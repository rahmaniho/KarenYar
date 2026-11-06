import { useEffect, useState } from 'react';
import { FlaskConical, LogOut, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth-store';
import { demoRemainingLabel } from './demo-time';

/**
 * نوار «حالت دمو» در بالای همهٔ صفحه‌های فروشگاه.
 *
 * فقط برای فروشگاه دمو دیده می‌شود و دو راه پیش رو می‌گذارد: ساخت فروشگاه واقعی
 * یا پایان دادن به دمو (که دادهٔ دمو را فوراً پاک می‌کند).
 */
export function DemoBanner() {
  const user = useAuthStore((s) => s.user);
  const endDemo = useAuthStore((s) => s.endDemo);
  const store = user?.store;
  const isDemo = Boolean(store?.is_demo);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isDemo) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [isDemo]);

  if (!isDemo) {
    return null;
  }

  const remaining = demoRemainingLabel(store?.demo_expires_at, now);

  const finishDemo = async (goToSignup: boolean) => {
    setBusy(true);
    try {
      if (goToSignup) {
        // صفحهٔ ثبت‌نام پس از بارگذاری مجدد باز می‌شود (همهٔ دادهٔ دمو پاک می‌شود).
        window.sessionStorage.setItem('karo:open-signup', '1');
      }
      await endDemo();
      toast.success(goToSignup ? 'دمو پاک شد؛ فروشگاه واقعی بسازید.' : 'دمو پاک شد.');
      if (goToSignup) {
        window.location.reload();
      }
    } catch {
      toast.error('پایان دمو ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <div className="flex items-start gap-2">
        <FlaskConical aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-bold">حالت دمو — داده‌های نمونه و آزمایشی</p>
          <p className="text-xs opacity-90">
            زمان باقی‌مانده: {remaining}. این فروشگاه واقعی نیست و همهٔ داده‌هایش پس از پایان
            دمو پاک می‌شود.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="neon"
          onClick={() => void finishDemo(true)}
          disabled={busy}
        >
          <UserPlus aria-hidden />
          ساخت فروشگاه واقعی
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void finishDemo(false)}
          disabled={busy}
        >
          <LogOut aria-hidden />
          پایان دمو
        </Button>
      </div>
    </div>
  );
}
