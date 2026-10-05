import { useCallback, useEffect, useRef, useState } from 'react';

export interface PollState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
}

/** Fetch on mount / when deps change, then re-fetch every `intervalMs`. */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  intervalMs = 15_000,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetcherRef
      .current(controller.signal)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    if (!intervalMs) return;
    const id = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, refresh]);

  // "loading" = nothing has resolved yet; later polls refresh silently.
  return { data, error, loading: data === null && error === null, refresh };
}
