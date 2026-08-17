import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Candidate, IdentifyResponse, RankResponse } from '../lib/types';

/** One part the session has seen, tallied across every scan that turned it up. */
export interface Observation {
  partNum: string;
  name: string;
  imgUrl: string;
  hits: number;
  bestScore: number;
}

const MIN_SCORE = 0.3;

/**
 * Owns a scanning session: the last identification, the running tally of bricks
 * seen and the set ranking derived from it. The camera frame comes from
 * `captureRef`, which the caller hands to `CameraCapture`.
 */
export function useScanSession() {
  const captureRef = useRef<(() => Promise<Blob | null>) | null>(null);

  const [result, setResult] = useState<IdentifyResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [intervalMs, setIntervalMs] = useState(2500);
  const [observations, setObservations] = useState<Record<string, Observation>>({});
  const [ranking, setRanking] = useState<RankResponse | null>(null);

  // `busy` is read inside the live-scan timer; a ref keeps the timer effect stable.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const recordObservation = useCallback((candidate: Candidate) => {
    setObservations((prev) => {
      const existing = prev[candidate.partNum];
      return {
        ...prev,
        [candidate.partNum]: {
          partNum: candidate.partNum,
          name: candidate.name,
          imgUrl: candidate.imgUrl,
          hits: (existing?.hits ?? 0) + 1,
          bestScore: Math.max(existing?.bestScore ?? 0, candidate.score),
        },
      };
    });
  }, []);

  const identify = useCallback(
    async (blob: Blob, { auto = false }: { auto?: boolean } = {}) => {
      setBusy(true);
      if (!auto) setError(null);
      try {
        const res = await api.identify(blob, { searchType: 'parts', minScore: MIN_SCORE });
        setResult(res);
        setError(null);
        const top = res.candidates[0];
        if (top) recordObservation(top);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [recordObservation],
  );

  const scanOnce = useCallback(
    async (opts?: { auto?: boolean }) => {
      const blob = await captureRef.current?.();
      if (!blob) {
        setError('No camera frame available — start the camera first.');
        return;
      }
      await identify(blob, opts);
    },
    [identify],
  );

  // Live mode: one in-flight request at a time, spaced by the chosen interval.
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled || busyRef.current) return;
      void scanOnce({ auto: true });
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live, intervalMs, scanOnce]);

  // Re-rank whenever the session tally changes.
  useEffect(() => {
    const list = Object.values(observations);
    if (list.length === 0) {
      setRanking(null);
      return;
    }
    let cancelled = false;
    void api
      .rank(list.map((o) => ({ partNum: o.partNum, weight: o.bestScore })))
      .then((res) => {
        if (!cancelled) setRanking(res);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [observations]);

  const observationList = useMemo(
    () => Object.values(observations).sort((a, b) => b.hits - a.hits),
    [observations],
  );

  const clear = useCallback(() => {
    setObservations({});
    setRanking(null);
  }, []);

  return {
    captureRef,
    result,
    busy,
    error,
    live,
    setLive,
    intervalMs,
    setIntervalMs,
    observationList,
    ranking,
    identify,
    scanOnce,
    clear,
  };
}
