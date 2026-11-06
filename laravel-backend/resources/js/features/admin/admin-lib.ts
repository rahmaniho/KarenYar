import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/core/api/client';

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errors) {
      const first = Object.values(error.errors).flat().find(Boolean);
      if (first) return first;
    }
    return error.message;
  }
  return 'ارتباط با سرور برقرار نشد؛ اتصال را بررسی کنید.';
}

/** بارگذاری داده با امکان تازه‌سازی دستی و جلوگیری از به‌روزرسانی پس از unmount. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      if (alive.current) setData(result);
    } catch (caught) {
      if (alive.current) setError(errorMessage(caught));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: load, setData };
}
