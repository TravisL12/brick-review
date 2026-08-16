import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BrickognizeResult, BrickognizeSearchType } from './brickognize.types';

const PATH_BY_TYPE: Record<BrickognizeSearchType, string> = {
  all: '/predict/',
  parts: '/predict/parts/',
  sets: '/predict/sets/',
  figs: '/predict/figs/',
};

@Injectable()
export class BrickognizeService {
  private readonly logger = new Logger(BrickognizeService.name);
  private readonly baseUrl: string;
  private readonly minIntervalMs: number;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(config: ConfigService) {
    this.baseUrl = config
      .get<string>('BRICKOGNIZE_BASE_URL', 'https://api.brickognize.com')
      .replace(/\/$/, '');
    this.minIntervalMs = Number(config.get<string>('BRICKOGNIZE_MIN_INTERVAL_MS', '700'));
  }

  /**
   * Brickognize is a free public service. Requests are serialised and spaced so a
   * live-video client cannot turn into a firehose.
   */
  predict(
    image: Buffer,
    filename: string,
    mimetype: string,
    searchType: BrickognizeSearchType = 'parts',
  ): Promise<BrickognizeResult> {
    const run = async (): Promise<BrickognizeResult> => {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();

      const form = new FormData();
      form.append(
        'query_image',
        new Blob([new Uint8Array(image)], { type: mimetype || 'image/jpeg' }),
        filename || 'capture.jpg',
      );

      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}${PATH_BY_TYPE[searchType]}`, {
          method: 'POST',
          body: form,
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        this.logger.error(`Brickognize request failed: ${String(err)}`);
        throw new HttpException('Could not reach Brickognize', HttpStatus.BAD_GATEWAY);
      }

      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        if (res.status === 429) {
          throw new HttpException(
            'Brickognize rate limit hit — slow down the scan interval.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        throw new HttpException(
          `Brickognize returned ${res.status}: ${body}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      return (await res.json()) as BrickognizeResult;
    };

    const chained = this.queue.then(run, run);
    this.queue = chained.catch(() => undefined);
    return chained;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
