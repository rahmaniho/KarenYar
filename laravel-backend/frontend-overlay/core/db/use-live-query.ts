/**
 * جایگزین `useLiveQuery` از dexie-react-hooks.
 *
 * در حالت سروری، کوئری‌ها هنگام هر تغییر در لایه‌ی داده دوباره اجرا می‌شوند.
 * در تست‌ها همان پیاده‌سازی اصلی Dexie استفاده می‌شود تا آزمون‌ها بدون شبکه
 * و روی fake-indexeddb بمانند.
 *
 * انتخاب هوک یک‌بار و در سطح ماژول انجام می‌شود (نه داخل رندر)، تا ترتیب
 * فراخوانی هوک‌ها در طول عمر کامپوننت ثابت بماند.
 */
import { useLiveQuery as dexieUseLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { dbMode, serverDb } from './db';

type LiveQueryHook = <T, TDefault = undefined>(
  querier: () => T | Promise<T>,
  deps?: unknown[],
  defaultResult?: TDefault,
) => T | TDefault;

function useServerLiveQuery<T, TDefault = undefined>(
  querier: () => T | Promise<T>,
  deps: unknown[] = [],
  defaultResult?: TDefault,
): T | TDefault {
  const [result, setResult] = useState<T | TDefault | undefined>(defaultResult);

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

  return result as T | TDefault;
}

export const useLiveQuery: LiveQueryHook =
  dbMode === 'server'
    ? (useServerLiveQuery as unknown as LiveQueryHook)
    : (dexieUseLiveQuery as unknown as LiveQueryHook);
