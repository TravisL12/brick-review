import type {
  ImportResult,
  IdentifyResponse,
  InventoryPart,
  LegoSet,
  MinifigDetail,
  MinifigSummary,
  RankResponse,
  SetDetail,
  SetsStats,
} from './types';

const BASE = '/api';

/** Anything can be thrown; only `Error` carries the message `handle` puts there. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message) {
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      }
    } catch {
      /* keep the status-code message */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  listSets: () => fetch(`${BASE}/sets`).then((r) => handle<LegoSet[]>(r)),

  setsStats: () => fetch(`${BASE}/sets/stats`).then((r) => handle<SetsStats>(r)),

  getSet: (setNum: string) =>
    fetch(`${BASE}/sets/${encodeURIComponent(setNum)}`).then((r) => handle<SetDetail>(r)),

  getSetParts: (setNum: string) =>
    fetch(`${BASE}/sets/${encodeURIComponent(setNum)}/parts`).then((r) =>
      handle<InventoryPart[]>(r),
    ),

  listMinifigs: () => fetch(`${BASE}/minifigs`).then((r) => handle<MinifigSummary[]>(r)),

  getMinifig: (figNum: string) =>
    fetch(`${BASE}/minifigs/${encodeURIComponent(figNum)}`).then((r) => handle<MinifigDetail>(r)),

  resyncMinifig: (figNum: string) =>
    fetch(`${BASE}/minifigs/${encodeURIComponent(figNum)}/resync`, { method: 'POST' }).then((r) =>
      handle<MinifigDetail>(r),
    ),

  importSets: (text: string) =>
    fetch(`${BASE}/sets/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then((r) => handle<ImportResult>(r)),

  removeSet: (setNum: string) =>
    fetch(`${BASE}/sets/${encodeURIComponent(setNum)}`, { method: 'DELETE' }).then((r) =>
      handle<{ removed: string }>(r),
    ),

  resyncSet: (setNum: string) =>
    fetch(`${BASE}/sets/${encodeURIComponent(setNum)}/resync`, { method: 'POST' }).then((r) =>
      handle<{ queued: string }>(r),
    ),

  retryFailed: () =>
    fetch(`${BASE}/sets/retry-failed`, { method: 'POST' }).then((r) =>
      handle<{ queued: number }>(r),
    ),

  identify: (blob: Blob, opts: { searchType?: string; minScore?: number } = {}) => {
    const form = new FormData();
    form.append('image', blob, 'capture.jpg');
    const params = new URLSearchParams();
    if (opts.searchType) params.set('searchType', opts.searchType);
    if (opts.minScore != null) params.set('minScore', String(opts.minScore));
    const qs = params.toString();
    return fetch(`${BASE}/recognition/identify${qs ? `?${qs}` : ''}`, {
      method: 'POST',
      body: form,
    }).then((r) => handle<IdentifyResponse>(r));
  },

  rank: (observations: { partNum: string; weight?: number }[]) =>
    fetch(`${BASE}/recognition/rank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observations }),
    }).then((r) => handle<RankResponse>(r)),
};
