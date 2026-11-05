/**
 * نگه‌داری وضعیت فیلترها در query string — با بازگشت به فهرست، فیلترها و صفحه‌ی جاری حفظ می‌شوند.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useUrlState(defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const result: Record<string, string> = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const value = params.get(key);
      if (value !== null) result[key] = value;
    }
    return result;
  }, [params, defaults]);

  /** به‌روزرسانی یک یا چند کلید؛ مقدار خالی/پیش‌فرض کلید را از URL پاک می‌کند */
  const update = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value == null || value === '' || value === defaults[key]) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [defaults, setParams],
  );

  return { values, update };
}
