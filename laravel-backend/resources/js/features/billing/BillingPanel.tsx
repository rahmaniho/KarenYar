import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, Crown, RefreshCw, Receipt, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/core/api/client';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { formatJalaliLongISO } from '@/core/jalali/jalali';
import { cn } from '@/lib/utils';
import { useAuthStore, type StoreLicense } from '@/store/auth-store';
import {
  GATEWAY_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  TIER_LABELS,
  licenseStatusMessage,
  planPeriodLabel,
  type BillingGateway,
  type BillingOrder,
  type BillingPlan,
} from './billing-labels';

interface BillingResponse {
  license: StoreLicense | null;
  orders: BillingOrder[];
  plans: BillingPlan[];
  gateways: BillingGateway[];
  pending_order: BillingOrder | null;
}

const cardClass = 'border-navy-200 dark:border-navy-700';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errors) {
      const first = Object.values(error.errors).flat().find(Boolean);
      if (first) return first;
    }
    return error.message;
  }
  return 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.';
}

/**
 * بخش «اشتراک، خرید و تمدید» برای کاربر فروشگاه.
 *
 * جریان پول: انتخاب پلن → ساخت سفارش در سرور → هدایت به درگاه (یا نمایش متن
 * واریز کارت‌به‌کارت) → بازگشت با `?payment=success|failed` → تأیید در سرور و
 * تمدید لایسنس. کلید لایسنس هرگز در مرورگر ساخته یا تغییر داده نمی‌شود.
 */
export function BillingPanel({
  onRedirect = (url: string) => window.location.assign(url),
}: {
  onRedirect?: (url: string) => void;
}) {
  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gateway, setGateway] = useState<string>('manual');
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<BillingResponse>('/api/billing');
      setData(response);
      setGateway((current) => {
        const keys = response.gateways.map((item) => item.key);
        return keys.includes(current) ? current : (keys[0] ?? 'manual');
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  // نتیجهٔ بازگشت از درگاه
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if (!payment) return;

    if (payment === 'success') {
      toast.success('پرداخت با موفقیت ثبت شد و اشتراک تمدید شد.');
      void useAuthStore.getState().refresh();
    } else if (payment === 'failed') {
      toast.error('پرداخت انجام نشد. اگر مبلغی کسر شده باشد، پس از بررسی برمی‌گردد.');
    } else {
      toast.error('نتیجهٔ پرداخت نامشخص است؛ وضعیت سفارش را در همین صفحه ببینید.');
    }

    params.delete('payment');
    params.delete('order');
    const query = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const license = data?.license ?? null;
  const pendingOrder = data?.pending_order ?? null;

  const sortedPlans = useMemo(() => {
    const order = ['pro_monthly', 'pro_yearly', 'proplus_monthly', 'proplus_yearly', 'lifetime'];
    return [...(data?.plans ?? [])].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [data?.plans]);

  const buy = async (planKey: string) => {
    setBusyPlan(planKey);
    setInstructions(null);
    try {
      const response = await apiFetch<{
        order: BillingOrder;
        redirect_url: string | null;
        instructions: string | null;
      }>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: planKey, gateway }),
      });

      if (response.redirect_url) {
        toast.success('در حال انتقال به درگاه پرداخت…');
        onRedirect(response.redirect_url);
        return;
      }

      setInstructions(response.instructions);
      toast.success('سفارش ثبت شد؛ پس از واریز، پرداخت را برای ما بفرستید تا تأیید شود.');
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <Card id="billing" className={cn('mt-4 scroll-mt-20', cardClass)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
          اشتراک، خرید و تمدید
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {loading && !data && (
          <p className="text-sm text-muted-foreground">در حال خواندن وضعیت اشتراک…</p>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-4">
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-sm font-semibold text-accent-foreground">
                {TIER_LABELS[license?.tier ?? 'free']}
              </span>
              {license && (
                <span className="text-sm">
                  {license.is_lifetime
                    ? 'بدون انقضا'
                    : license.expires_at
                      ? `اعتبار تا ${formatJalaliLongISO(license.expires_at)}`
                      : 'بدون تاریخ انقضا'}
                </span>
              )}
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

            <p className="text-sm leading-7 text-muted-foreground" role="status">
              {licenseStatusMessage(license)}
            </p>

            {instructions && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-semibold">اطلاعات واریز</p>
                <p dir="ltr" className="mt-1 text-start">
                  {instructions}
                </p>
                <p className="mt-2">
                  پس از واریز، شناسهٔ سفارش <b>#{toFaDigits(String(pendingOrder?.id ?? ''))}</b> را
                  برای پشتیبانی بفرستید.
                </p>
              </div>
            )}

            {/* روش پرداخت */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">روش پرداخت</p>
              <div className="flex flex-wrap gap-2">
                {data.gateways.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setGateway(item.key)}
                    aria-pressed={gateway === item.key}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-sm font-medium transition',
                      gateway === item.key
                        ? 'border-primary bg-primary/10 text-primary dark:border-neon-400 dark:text-neon-300'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {GATEWAY_LABELS[item.key] ?? item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* پلن‌ها */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedPlans.map((plan) => (
                <div
                  key={plan.key}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4"
                >
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-sm font-bold">
                      <Crown className="h-4 w-4 text-primary dark:text-neon-400" aria-hidden />
                      {plan.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{plan.description}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-base font-extrabold">{formatMoney(plan.amount, 'toman')}</p>
                    <p className="text-xs text-muted-foreground">{planPeriodLabel(plan)}</p>
                    <Button
                      className="w-full"
                      variant={plan.tier === 'proplus' ? 'neon' : 'default'}
                      onClick={() => void buy(plan.key)}
                      disabled={busyPlan !== null}
                    >
                      {busyPlan === plan.key ? 'در حال ثبت…' : license ? 'تمدید / ارتقا' : 'خرید'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* سابقهٔ سفارش‌ها */}
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Receipt className="h-4 w-4" aria-hidden />
                سابقهٔ سفارش‌ها
              </p>

              {data.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">هنوز سفارشی ثبت نشده است.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="px-2 py-2 text-start font-semibold">تاریخ</th>
                        <th className="px-2 py-2 text-start font-semibold">پلن</th>
                        <th className="px-2 py-2 text-start font-semibold">مبلغ</th>
                        <th className="px-2 py-2 text-start font-semibold">وضعیت</th>
                        <th className="px-2 py-2 text-start font-semibold">کد پیگیری</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((order) => (
                        <tr key={order.id} className="border-b last:border-0">
                          <td className="px-2 py-2">
                            {order.created_at ? formatJalaliLongISO(order.created_at) : '—'}
                          </td>
                          <td className="px-2 py-2">{order.plan_label}</td>
                          <td className="px-2 py-2">{formatMoney(order.amount, 'toman')}</td>
                          <td className="px-2 py-2">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-xs font-semibold',
                                ORDER_STATUS_TONES[order.status],
                              )}
                            >
                              {ORDER_STATUS_LABELS[order.status] ?? order.status}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-xs" dir="ltr">
                            {order.reference_id ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              پرداخت در درگاه انجام می‌شود و اطلاعات کارت هرگز به کارو نمی‌رسد. تا زمانی که پرداخت
              تأیید نشود لایسنس تغییر نمی‌کند و با هر تمدید، روزهای باقی‌ماندهٔ فعلی از بین نمی‌رود.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
