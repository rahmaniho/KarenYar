/**
 * جایگزین `useLiveQuery` از dexie-react-hooks.
 *
 * در حالت سروری، کوئری‌ها هنگام هر تغییر در لایه‌ی داده دوباره اجرا می‌شوند.
 * در تست‌ها همان پیاده‌سازی اصلی Dexie استفاده می‌شود تا آزمون‌ها بدون شبکه
 * و روی fake-indexeddb بمانند.
 */
import { useLiveQuery as dexieUseLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { dbMode, serverDb } from './db';

function useServerLiveQuery<T>(
  querier: () => T | Promise<T>,
  deps: unknown[],
  defaultResult?: T,
): T | undefined {
  const [result, setResult] = useState<T | undefined>(defaultResult);

  const run = useCallback(() => {
    let alive = true;
    Promise.resolve()
      .then(querier)
      .then((value) => {
        if (alive) setResult(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let cancel = run();
    const unsubscribe = serverDb?.subscribe(() => {
      cancel();
      cancel = run();
    });
    return () => {
      cancel();
      unsubscribe?.();
    };
  }, [run]);

  return result;
}

/**
 * در اجرای واقعی به لایه‌ی سروری و در تست‌ها به Dexie وصل می‌شود. انتخاب یک‌بار
 * و در سطح ماژول انجام می‌شود، پس ترتیب فراخوانی هوک‌ها ثابت می‌ماند.
 */
export function useLiveQuery<T, TDefault = undefined>(
  querier: () => T | Promise<T>,
  deps?: unknown[],
  defaultResult?: TDefault,
): T | TDefault {
  if (dbMode === 'server') {
    return useServerLiveQuery(querier, deps ?? [], defaultResult as T | undefined) as T | TDefault;
  }

  return dexieUseLiveQuery(querier, deps ?? [], defaultResult) as T | TDefault;
}
