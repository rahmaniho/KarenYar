/**
 * تمدید/بررسی دوره‌ای لایسنس سروری — فقط در بیلد سروری فعال است.
 * هنگام آنلاین‌شدن و بازگشت به برنامه هم بررسی می‌کند؛ خود استور فاصله‌ی
 * زمانی را رعایت می‌کند تا درخواست پشت‌سرهم به سرور نرود.
 */
import { useEffect } from 'react';
import { useLicenseStore } from '@/store/license-store';

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function useLicenseSync(): void {
  const sync = useLicenseStore((s) => s.sync);
  useEffect(() => {
    const run = () => {
      void sync();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(run, SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [sync]);
}
