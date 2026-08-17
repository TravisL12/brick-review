import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  BricksetAdditionalImagesResponse,
  BricksetGetSetsResponse,
  BricksetResponse,
} from './brickset.types';

const BASE_URL = 'https://brickset.com/api/v3.asmx';
/** Brickset meters keys per day, so serialise and space the calls out. */
const MIN_INTERVAL_MS = 600;
const MAX_RETRIES = 2;

export interface SetImageRef {
  url: string;
  thumbUrl: string | null;
}

export interface BricksetImages {
  /** Brickset's internal set id, worth caching to skip the lookup next time. */
  bricksetId: number | null;
  images: SetImageRef[];
}

/**
 * Brickset is the only source we have for *additional* set photos — Rebrickable's
 * API exposes exactly one image per set. Everything here is best-effort: a missing
 * key, a down service or an unknown set must never fail a set sync.
 */
@Injectable()
export class BricksetService {
  private readonly logger = new Logger(BricksetService.name);
  private readonly apiKey: string;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('BRICKSET_API_KEY', '').trim();
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Additional photos for a set, newest-first by Brickset's own ordering.
   * Pass `knownId` to skip the set-id lookup and spend one request instead of two.
   */
  async getSetImages(setNum: string, knownId?: number | null): Promise<BricksetImages> {
    if (!this.isConfigured()) return { bricksetId: knownId ?? null, images: [] };

    try {
      const bricksetId = knownId ?? (await this.lookupSetId(setNum));
      if (bricksetId == null) return { bricksetId: null, images: [] };

      const res = await this.request<BricksetAdditionalImagesResponse>('getAdditionalImages', {
        setID: String(bricksetId),
      });

      const images = (res.additionalImages ?? [])
        .map((img) => ({ url: img.imageURL, thumbUrl: img.thumbnailURL ?? null }))
        .filter((img): img is SetImageRef => typeof img.url === 'string' && img.url.length > 0)
        .sort((a, b) => imageOrder(a.url) - imageOrder(b.url));

      return { bricksetId, images };
    } catch (err) {
      this.logger.warn(`Could not load Brickset images for ${setNum}: ${String(err)}`);
      return { bricksetId: knownId ?? null, images: [] };
    }
  }

  /** Rebrickable set numbers ("31139-1") are already in Brickset's own format. */
  private async lookupSetId(setNum: string): Promise<number | null> {
    const res = await this.request<BricksetGetSetsResponse>('getSets', {
      userHash: '',
      params: JSON.stringify({ setNumber: setNum }),
    });
    return res.sets?.[0]?.setID ?? null;
  }

  /** Serialised + throttled GET. Brickset reports failures in the body, not the status code. */
  private request<T extends BricksetResponse>(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);

      const url = new URL(`${BASE_URL}/${endpoint}`);
      url.searchParams.set('apiKey', this.apiKey);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        this.lastRequestAt = Date.now();
        const res = await fetch(url, { headers: { Accept: 'application/json' } });

        if (!res.ok) {
          if (res.status >= 500 && attempt < MAX_RETRIES) {
            await sleep(MIN_INTERVAL_MS * Math.pow(2, attempt + 1));
            continue;
          }
          throw new Error(`Brickset ${endpoint} failed (${res.status})`);
        }

        const body = (await res.json()) as T;
        if (body.status !== 'success') {
          throw new Error(`Brickset ${endpoint}: ${body.message ?? 'unknown error'}`);
        }
        return body;
      }
      throw new Error(`Brickset ${endpoint} failed after retries`);
    };

    const chained = this.queue.then(run, run);
    // Keep the chain alive even when a call rejects.
    this.queue = chained.catch(() => undefined);
    return chained;
  }
}

/**
 * Brickset returns images in filename order, which sorts "alt10" before "alt2".
 * Order by the trailing number so the carousel follows the numbering.
 */
function imageOrder(url: string): number {
  const match = /(\d+)(?=\.[a-z]+$)/i.exec(url);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
