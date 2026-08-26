// ===========================================================================
//  useApiData — load something from the API, with loading / error / refresh.
//
//  Small on purpose: one hook covers every screen, and `refresh()` is what a
//  screen calls after it changes something so the numbers come back from
//  PostgreSQL rather than being patched in the browser.
// ===========================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

export type ApiData<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setData: (value: T | null) => void;
};

export function useApiData<T>(loader: () => Promise<T>, dependencies: unknown[] = [], options: { pollMs?: number } = {}): ApiData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep the newest loader without making it a dependency of the effect.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const mounted = useRef(true);

  const run = useCallback(async () => {
    try {
      const result = await loaderRef.current();
      if (!mounted.current) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void run();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  useEffect(() => {
    if (!options.pollMs) return;
    const timer = setInterval(() => void run(), options.pollMs);
    return () => clearInterval(timer);
  }, [options.pollMs, run]);

  return { data, loading, error, refresh: run, setData };
}
