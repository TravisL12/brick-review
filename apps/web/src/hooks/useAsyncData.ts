import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { errorMessage } from '../lib/api';

export interface AsyncData<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Exposed so page actions (resync, remove) can fold their own results back in. */
  setData: Dispatch<SetStateAction<T | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

/**
 * Loads once on mount and again whenever `deps` change. A response that arrives
 * after the deps moved on is dropped, so a fast second navigation cannot be
 * overwritten by the first request finishing late.
 */
export function useAsyncData<T>(load: () => Promise<T>, deps: unknown[]): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    load()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `load` is redeclared every render; the caller's `deps` are the real trigger.
  }, deps);

  return { data, loading, error, setData, setError };
}
