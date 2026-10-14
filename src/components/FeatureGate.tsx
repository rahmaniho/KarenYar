import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FEATURE_LABELS, type Feature } from '@/core/license/license-core';
import { useLicenseStore } from '@/store/license-store';
import { cn } from '@/lib/utils';

interface FeatureGateProps {
  feature: Feature;
  children: ReactNode;
  /** حالت جمع‌وجور: فقط یک بنر خطی به‌جای کارت کامل */
  compact?: boolean;
  className?: string;
}

/**
 * گیت قابلیت بر اساس لایسنس — اگر کاربر دسترسی نداشته باشد،
 * پیام ارتقا به نسخه‌ی حرفه‌ای با لینک صفحه‌ی فعال‌سازی نمایش داده می‌شود.
 */
export function FeatureGate({ feature, children, compact = false, className }: FeatureGateProps) {
  const can = useLicenseStore((s) => s.can);
  if (can(feature)) return <>{children}</>;

  if (compact) {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm',
          className,
        )}
        role="note"
      >
        <Lock className="h-4 w-4 text-warning" aria-hidden />
        <span>
          «{FEATURE_LABELS[feature]}» در نسخه‌ی حرفه‌ای فعال است.
        </span>
        <Button asChild size="sm" variant="neon" className="ms-auto">
          <Link to="/settings#license">
            <Crown className="h-4 w-4" />
            ارتقا به حرفه‌ای
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-10 text-center',
        className,
      )}
      role="note"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-900 text-accent dark:bg-navy-700">
        <Lock className="h-7 w-7" aria-hidden />
      </div>
      <p className="font-bold">این قابلیت در نسخه‌ی حرفه‌ای است</p>
      <p className="max-w-md text-sm text-muted-foreground">
        «{FEATURE_LABELS[feature]}» برای کاربران نسخه‌ی رایگان قفل است. با یک‌بار خرید نسخه‌ی حرفه‌ای،
        همه‌ی امکانات حساب‌یار برای همیشه فعال می‌شود.
      </p>
      <Button asChild variant="neon">
        <Link to="/settings#license">
          <Crown className="h-4 w-4" />
          فعال‌سازی نسخه‌ی حرفه‌ای
        </Link>
      </Button>
    </div>
  );
}
