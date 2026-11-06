import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/core/api/client';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { formatJalaliLongISO } from '@/core/jalali/jalali';
import { cn } from '@/lib/utils';
import {
  STATUS_LABELS,
  STATUS_TONES,
  type SeatUsage,
  type SubscriptionPlan,
} from '@/features/subscription/subscription-types';

interface LicenseSummary {
  plan_code?: string | null;
  tier: string;
  seats?: number;
  status?: string;
  is_trial?: boolean;
  is_lifetime: boolean;
  expires_at: string | null;
  days_remaining: number | null;
}

interface InvoiceSummary {
  number: string;
  total: number;
  issued_at: string | null;
}

interface BillingSummary {
  license: LicenseSummary | null;
  usage: SeatUsage;
  plans: SubscriptionPlan[];
  invoices: InvoiceSummary[];
}

const cardClass = 'border-navy-200 dark:border-navy-700';

/**
 * کارت خلاصهٔ اشتراک در تنظیمات.
 *
 * محاسبه و خرید در صفحهٔ اختصاصی «اشتراک» انجام می‌شود؛ اینجا فقط وضعیت،
 * مصرف کاربران و فاکتورها نمایش داده می‌شود.
 */
export function BillingPanel() {
  const navigate = useNavigate();
  const [data, setData] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await apiFetch<BillingSummary>('/api/subscription'));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const license = data?.license ?? null;
  const planName = data?.plans.find((plan) => plan.code === license?.plan_code)?.name;

  return (
    <Card id="billing" className={cn('mt-4 scroll-mt-20', cardClass)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
          اشتراک و صورت‌حساب
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive" role="alert">
            خواندن وضعیت اشتراک ممکن نشد.
          </p>
        )}

        {loading && !data && <p className="text-sm text-muted-foreground">در حال خواندن…</p>}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-4 text-sm">
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-bold',
                  STATUS_TONES[license?.status ?? 'expired'],
                )}
              >
                {STATUS_LABELS[license?.status ?? 'expired'] ?? 'بدون اشتراک'}
              </span>
              <span className="font-semibold">
                {planName ?? (license ? 'اشتراک فعال' : 'اشتراکی ثبت نشده')}
              </span>
              {license?.is_lifetime ? (
                <span className="text-muted-foreground">مادام‌العمر</span>
              ) : license?.expires_at ? (
                <span className="text-muted-foreground">
                  تا {formatJalaliLongISO(license.expires_at)}
                  {typeof license.days_remaining === 'number' &&
                    ` — ${toFaDigits(license.days_remaining)} روز`}
                </span>
              ) : null}
              {license?.is_trial && (
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">
                  دورهٔ آزمایشی
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ms-auto"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw aria-hidden className={loading ? 'animate-spin' : undefined} />
                تازه‌سازی
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" aria-hidden />
                کاربران: <b>{toFaDigits(data.usage.used)}</b> از{' '}
                <b>{toFaDigits(data.usage.allowed)}</b>
              </span>
              {!data.usage.can_add && (
                <span className="text-xs text-destructive">
                  سقف کاربران پر شده است؛ برای افزودن کاربر، تعداد کاربران اشتراک را افزایش دهید.
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="neon" onClick={() => navigate('/subscription')}>
                <CreditCard aria-hidden />
                {license ? 'تمدید یا ارتقای اشتراک' : 'خرید اشتراک'}
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">فاکتورها</p>
              {data.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">هنوز فاکتوری صادر نشده است.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {data.invoices.map((invoice) => (
                    <li key={invoice.number} className="flex flex-wrap items-center gap-2 py-2">
                      <span dir="ltr" className="font-mono text-xs">
                        {invoice.number}
                      </span>
                      <span>{formatMoney(invoice.total, 'toman')}</span>
                      <span className="ms-auto text-xs text-muted-foreground">
                        {invoice.issued_at ? formatJalaliLongISO(invoice.issued_at) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
