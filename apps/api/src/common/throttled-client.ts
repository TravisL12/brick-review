import { Logger } from '@nestjs/common';

export interface ThrottledClientOptions {
  /** Names the client in the retry-exhausted error. */
  name: string;
  /** Minimum gap between the start of two outbound calls. */
  minIntervalMs: number;
  /** Attempts allowed after the first; 0 disables retrying. */
  maxRetries?: number;
  /** Receives a warning per retry, but only for retries that give a reason. */
  logger?: Logger;
}

export interface ThrottledAttempt {
  /** 0-based; 0 on the first try. */
  readonly attempt: number;
  /** Whether another attempt is still allowed. */
  readonly canRetry: boolean;
  /** Abandons this attempt and runs the task again after a backoff. */
  retry(reason?: string): never;
}

/** Control-flow marker for `ThrottledAttempt.retry()`; never escapes `run()`. */
class RetrySignal extends Error {
  constructor(readonly reason?: string) {
    super('retry');
  }
}

/**
 * Serialises outbound calls onto a single promise chain and keeps a minimum gap
 * between them. Every upstream here meters requests — Rebrickable bans repeat
 * offenders outright — so one client per host is the point: concurrent callers
 * cannot conspire to exceed the limit.
 */
export class ThrottledClient {
  private readonly maxRetries: number;
  /** Promise chain that serialises every outbound call. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(private readonly options: ThrottledClientOptions) {
    this.maxRetries = options.maxRetries ?? 0;
  }

  /**
   * Queues `task`, running it once the previous call has settled and the minimum
   * interval has elapsed. Calling `ctx.retry()` re-runs the task after
   * `minIntervalMs * 2^(attempt + 1)`; the queue stays held across the whole
   * retry sequence, so a struggling host is never hammered in parallel.
   */
  run<T>(task: (ctx: ThrottledAttempt) => Promise<T>): Promise<T> {
    const execute = async (): Promise<T> => {
      const wait = this.lastRequestAt + this.options.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);

      for (let attempt = 0; ; attempt++) {
        this.lastRequestAt = Date.now();
        try {
          return await task({
            attempt,
            canRetry: attempt < this.maxRetries,
            retry: (reason) => {
              throw new RetrySignal(reason);
            },
          });
        } catch (err) {
          if (!(err instanceof RetrySignal)) throw err;
          if (attempt >= this.maxRetries) {
            throw new Error(`${this.options.name} failed after ${this.maxRetries} retries`);
          }
          const backoff = this.options.minIntervalMs * Math.pow(2, attempt + 1);
          if (err.reason) this.options.logger?.warn(`${err.reason}; retrying in ${backoff}ms`);
          await sleep(backoff);
        }
      }
    };

    const chained = this.queue.then(execute, execute);
    // Keep the chain alive even when a call rejects.
    this.queue = chained.catch(() => undefined);
    return chained;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
