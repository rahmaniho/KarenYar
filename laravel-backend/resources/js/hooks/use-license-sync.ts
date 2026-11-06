/**
 * تازه‌سازی دوره‌ای اطلاعات لایسنس فروشگاه.
 *
 * چون لایسنس از سرور می‌آید، هنگام آنلاین‌شدن و بازگشت به برنامه اطلاعات
 * کاربر (و لایسنس همراه آن) دوباره خوانده می‌شود.
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export function useLicenseSync(): void {
  const role = useAuthStore((s) => s.user?.role ?? null);
  const refresh = useAuthStore((s) => s.refresh);

  useEffect(() => {
    if (role !== 'store') {
      return;
    }
    const run = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(run, REFRESH_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [role, refresh]);
}
