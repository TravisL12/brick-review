import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WARM_PRESETS,
  isRebrickableMedia,
  rebrickableThumb,
} from '../common/rebrickable-image.util';
import type {
  RebrickableInventoryPart,
  RebrickablePage,
  RebrickableColorDetail,
  RebrickableSet,
  RebrickableTheme,
} from './rebrickable.types';

const BASE_URL = 'https://rebrickable.com/api/v3';
/** Rebrickable allows ~1 req/s and bans repeat offenders, so serialise with a gap. */
const MIN_INTERVAL_MS = 1100;
const MAX_RETRIES = 3;
/** A hung CDN must not stall a sync. */
const WARM_TIMEOUT_MS = 5000;

@Injectable()
export class RebrickableService {
  private readonly logger = new Logger(RebrickableService.name);
  private readonly apiKey: string;
  /** Promise chain that serialises every outbound call. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;
  /** Themes change rarely and the whole list is small, so load it once per process. */
  private themes: Promise<Map<number, RebrickableTheme>> | null = null;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('REBRICKABLE_API_KEY', '').trim();
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new HttpException(
        'REBRICKABLE_API_KEY is not configured. Get a free key at https://rebrickable.com/api/ and add it to .env',
        HttpStatus.FAILED_DEPENDENCY,
      );
    }
  }

  /** Serialised + throttled GET with retry on 429/5xx. */
  private request<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);

      const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        this.lastRequestAt = Date.now();
        const res = await fetch(url, {
          headers: { Authorization: `key ${this.apiKey}`, Accept: 'application/json' },
        });

        if (res.ok) return (await res.json()) as T;

        if (res.status === 404) {
          throw new HttpException(`Not found on Rebrickable: ${path}`, HttpStatus.NOT_FOUND);
        }
        if (res.status === 401 || res.status === 403) {
          throw new HttpException(
            'Rebrickable rejected the API key (401/403). Check REBRICKABLE_API_KEY.',
            HttpStatus.FAILED_DEPENDENCY,
          );
        }
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff = MIN_INTERVAL_MS * Math.pow(2, attempt + 1);
          this.logger.warn(`Rebrickable ${res.status} on ${path}; retrying in ${backoff}ms`);
          await sleep(backoff);
          continue;
        }
        throw new HttpException(
          `Rebrickable request failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw new HttpException('Rebrickable request failed after retries', HttpStatus.BAD_GATEWAY);
    };

    const chained = this.queue.then(run, run);
    // Keep the chain alive even when a call rejects.
    this.queue = chained.catch(() => undefined);
    return chained;
  }

  /** Full theme table, fetched once and memoised. */
  private loadThemes(): Promise<Map<number, RebrickableTheme>> {
    this.themes ??= (async () => {
      const map = new Map<number, RebrickableTheme>();
      let page = 1;
      for (;;) {
        const res = await this.request<RebrickablePage<RebrickableTheme>>('/lego/themes/', {
          page,
          page_size: 1000,
        });
        for (const theme of res.results) map.set(theme.id, theme);
        if (!res.next || page >= 10) break;
        page += 1;
      }
      return map;
    })().catch((err: unknown) => {
      // Do not memoise a failure — a later sync should be able to retry.
      this.themes = null;
      throw err;
    });
    return this.themes;
  }

  /** Human-readable theme, including parents: "Creator > Creator 3-in-1". */
  async getThemePath(themeId: number | null | undefined): Promise<string | null> {
    if (themeId == null || !this.isConfigured()) return null;
    try {
      const themes = await this.loadThemes();
      const parts: string[] = [];
      let current = themes.get(themeId);
      const guard = new Set<number>();
      while (current && !guard.has(current.id)) {
        guard.add(current.id);
        parts.unshift(current.name);
        current = current.parent_id != null ? themes.get(current.parent_id) : undefined;
      }
      return parts.length > 0 ? parts.join(' > ') : null;
    } catch (err) {
      this.logger.warn(`Could not resolve theme ${themeId}: ${String(err)}`);
      return null;
    }
  }

  /** The whole colour table (~275 rows), including external catalogue ids. */
  async getColors(): Promise<RebrickableColorDetail[]> {
    this.assertConfigured();
    const all: RebrickableColorDetail[] = [];
    let page = 1;
    for (;;) {
      const res = await this.request<RebrickablePage<RebrickableColorDetail>>('/lego/colors/', {
        page,
        page_size: 1000,
        inc_color_details: 1,
      });
      all.push(...res.results);
      if (!res.next || page >= 10) break;
      page += 1;
    }
    return all;
  }

  getSet(setNum: string): Promise<RebrickableSet> {
    this.assertConfigured();
    return this.request<RebrickableSet>(`/lego/sets/${encodeURIComponent(setNum)}/`);
  }

  /**
   * Rebrickable renders /media/thumbs/ sizes on demand: the first request for a
   * given image+preset pays 0.2-0.8s of server-side resize, every later one is
   * ~35ms from the edge. A HEAD is enough to trigger that work without pulling
   * the body down, so warming at sync time means the gallery never pays the
   * cold cost in front of the user.
   *
   * Best-effort by design — this is the CDN, not the rate-limited API, so it
   * deliberately bypasses the request queue rather than starving real calls.
   */
  async warmThumbs(imgUrl: string | null | undefined): Promise<void> {
    if (!imgUrl || !isRebrickableMedia(imgUrl)) return;

    for (const preset of WARM_PRESETS) {
      try {
        await fetch(rebrickableThumb(imgUrl, preset), {
          method: 'HEAD',
          signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
        });
      } catch {
        // A cold thumbnail only costs the first viewer a moment; never fail a sync for it.
      }
    }
  }

  /** Walks every inventory page for a set. */
  async getSetParts(setNum: string): Promise<RebrickableInventoryPart[]> {
    this.assertConfigured();
    const all: RebrickableInventoryPart[] = [];
    let page = 1;

    for (;;) {
      const res = await this.request<RebrickablePage<RebrickableInventoryPart>>(
        `/lego/sets/${encodeURIComponent(setNum)}/parts/`,
        { page, page_size: 1000, inc_part_details: 1, inc_color_details: 1 },
      );
      all.push(...res.results);
      if (!res.next) break;
      page += 1;
      if (page > 50) {
        this.logger.warn(`Stopped paging ${setNum} inventory at 50 pages`);
        break;
      }
    }
    return all;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
