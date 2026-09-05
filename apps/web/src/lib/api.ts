import type {
  AuthUser,
  ImportResult,
  IdentifyResponse,
  InventoryPart,
  LegoSet,
  MinifigDetail,
  MinifigSummary,
  RankResponse,
  SetDetail,
  SetsStats,
  ShowcaseSet,
} from './types';

const BASE = '/api';

/** Anything can be thrown; only `Error` carries the message `handle` puts there. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Carries the HTTP status so callers can tell "signed out" from "broken". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/**
 * Fired whenever the API rejects a call as unauthenticated. `AuthProvider` listens
 * and drops back to the sign-in screen, so a session that expires while a tab is
 * open turns into a sign-in prompt rather than an error on every page.
 */
export const SESSION_EXPIRED_EVENT = 'brick-review:session-expired';

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
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

/**
 * Every call goes through here so the session cookie is always sent. Same-origin
 * in dev via the Vite proxy, but `include` keeps it working if the API is ever
 * served from a different origin.
 */
function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return fetch(`${BASE}${path}`, { credentials: 'include', ...init }).then((r) => handle<T>(r));
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const api = {
  register: (body: { email: string; password: string; displayName?: string }) =>
    postJson<AuthUser>('/auth/register', body),

  login: (body: { email: string; password: string }) => postJson<AuthUser>('/auth/login', body),

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  me: () => request<AuthUser>('/auth/me'),

  /** Public — the splash screen's artwork, available before anyone signs in. */
  splashSets: () => request<ShowcaseSet[]>('/splash/sets'),

  listSets: () => request<LegoSet[]>('/sets'),

  setsStats: () => request<SetsStats>('/sets/stats'),

  getSet: (setNum: string) => request<SetDetail>(`/sets/${encodeURIComponent(setNum)}`),

  getSetParts: (setNum: string) =>
    request<InventoryPart[]>(`/sets/${encodeURIComponent(setNum)}/parts`),

  listMinifigs: () => request<MinifigSummary[]>('/minifigs'),

  getMinifig: (figNum: string) => request<MinifigDetail>(`/minifigs/${encodeURIComponent(figNum)}`),

  resyncMinifig: (figNum: string) =>
    request<MinifigDetail>(`/minifigs/${encodeURIComponent(figNum)}/resync`, { method: 'POST' }),

  importSets: (text: string) => postJson<ImportResult>('/sets/import', { text }),

  removeSet: (setNum: string) =>
    request<{ removed: string }>(`/sets/${encodeURIComponent(setNum)}`, { method: 'DELETE' }),

  resyncSet: (setNum: string) =>
    request<{ queued: string }>(`/sets/${encodeURIComponent(setNum)}/resync`, { method: 'POST' }),

  retryFailed: () => request<{ queued: number }>('/sets/retry-failed', { method: 'POST' }),

  identify: (blob: Blob, opts: { searchType?: string; minScore?: number } = {}) => {
    const form = new FormData();
    form.append('image', blob, 'capture.jpg');
    const params = new URLSearchParams();
    if (opts.searchType) params.set('searchType', opts.searchType);
    if (opts.minScore != null) params.set('minScore', String(opts.minScore));
    const qs = params.toString();
    return request<IdentifyResponse>(`/recognition/identify${qs ? `?${qs}` : ''}`, {
      method: 'POST',
      body: form,
    });
  },

  rank: (observations: { partNum: string; weight?: number }[]) =>
    postJson<RankResponse>('/recognition/rank', { observations }),
};
