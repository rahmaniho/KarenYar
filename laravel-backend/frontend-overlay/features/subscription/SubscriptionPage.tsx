import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Check,
  CreditCard,
  Crown,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/core/api/client';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { formatJalaliLongISO } from '@/core/jalali/jalali';
import { cn } from '@/lib/utils';
import { useAuthStore, type StoreLicense } from '@/store/auth-store';
import {
  DEFAULT_ALLOWED_MONTHS,
  ORDER_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  computeQuote,
  durationLabel,
  type CouponRule,
  type SeatUsage,
  type SubscriptionPlan,
} from './subscription-types';

interface SubscriptionOrder {
  id: number;
  plan: string;
  plan_label: string;
  type: string;
  months: number;
  seats: number;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'canceled';
  gateway: string;
  reference_id: string | null;
  invoice_number?: string | null;
  created_at: string | null;
}

interface InvoiceSummary {
  number: string;
  total: number;
  discount: number;
  issued_at: string | null;
}

interface SubscriptionState {
  license: StoreLicense | null;
  usage: SeatUsage;
  orders: SubscriptionOrder[];
  invoices: InvoiceSummary[];
  plans: SubscriptionPlan[];
  gateways: { key: string; label: string }[];
  allowed_months: number[];
  currency: string;
  trial_days: number;
}

const FAQ = [
  {
    q: 'اشتراک پس از پرداخت چه زمانی فعال می‌شود؟',
    a: 'به‌محض تأیید قطعی تراکنش از طرف درگاه، اشتراک در همان لحظه فعال می‌شود و فاکتور در همین صفحه قابل مشاهده است. اگر پرداخت انجام شده ولی فعال‌سازی را نمی‌بینید، شمارهٔ سفارش را برای پشتیبانی بفرستید.',
  },
  {
    q: 'اگر وسط دوره اشتراک را تمدید کنم چه می‌شود؟',
    a: 'روزهای باقی‌ماندهٔ فعلی سوخت نمی‌شود؛ مدت جدید از تاریخ پایان فعلی ادامه پیدا می‌کند.',
  },
  {
    q: 'هزینهٔ کاربر اضافه چطور محاسبه می‌شود؟',
    a: 'قیمت پایه شامل یک کاربر است. از کاربر دوم به بعد، هزینهٔ هر کاربر اضافه (به‌صورت ماهانه) به مبلغ اضافه می‌شود؛ برای کل دوره در تعداد ماه ضرب می‌شود.',
  },
  {
    q: 'ارتقای پلن در میانهٔ دوره چگونه است؟',
    a: 'سطح پلن بلافاصله بالا می‌رود، روزهای باقی‌مانده حفظ می‌شود و مدت خریداری‌شده به پایان فعلی اضافه می‌گردد. بابت باقی‌ماندهٔ دورهٔ قبل مبلغ اضافه‌ای گرفته نمی‌شود.',
  },
  {
    q: 'اگر تعداد کاربران بیشتر از سقف شود چه اتفاقی می‌افتد؟',
    a: 'افزودن کاربر جدید تا سقف اشتراک مجاز است. با رسیدن به سقف، دکمهٔ افزودن کاربر پیام می‌دهد و می‌توانید با خرید کاربر اضافه، سقف را بالا ببرید. کاربران غیرفعال ظرفیت مصرف نمی‌کنند.',
  },
  {
    q: 'داده‌های حسابداری من با انقضای اشتراک چه می‌شود؟',
    a: 'هیچ داده‌ای حذف نمی‌شود. با انقضا فقط امکانات جدید محدود می‌شود و دسترسی به داده‌های خودتان و خروجی گرفتن از آن‌ها همیشه باز است.',
  },
];

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

/** مبلغ به تومان با جداکنندهٔ فارسی. */
function money(value: number): string {
  return formatMoney(value, 'toman');
}

export function SubscriptionPage({
  onRedirect = (url: string) => window.location.assign(url),
}: {
  onRedirect?: (url: string) => void;
}) {
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [planCode, setPlanCode] = useState<string | null>(null);
  const [seats, setSeats] = useState(1);
  const [months, setMonths] = useState(12);
  const [durationMode, setDurationMode] = useState<'monthly' | 'yearly' | 'custom'>('yearly');
  const [years, setYears] = useState(1);

  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<CouponRule | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const [gateway, setGateway] = useState('manual');
  const [busy, setBusy] = useState(false);
  const [instructions, setInstructions] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<SubscriptionState>('/api/subscription');
      setState(response);
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

  useEffect(() => {
    void load();
  }, [load]);

  // بازگشت از درگاه
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if (!payment) return;

    if (payment === 'success') {
      toast.success('پرداخت تأیید شد؛ اشتراک فعال است.');
      void useAuthStore.getState().refresh();
      void load();
    } else if (payment === 'failed') {
      toast.error('پرداخت انجام نشد. اگر مبلغی کسر شده باشد، پس از بررسی برمی‌گردد.');
    } else {
      toast.error('نتیجهٔ پرداخت نامشخص است؛ وضعیت سفارش را در همین صفحه ببینید.');
    }

    params.delete('payment');
    params.delete('order');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [load]);

  const plans = useMemo(() => state?.plans ?? [], [state]);
  const license = state?.license ?? null;
  const allowedMonths = useMemo(
    () => (state?.allowed_months?.length ? state.allowed_months : DEFAULT_ALLOWED_MONTHS),
    [state],
  );

  // پلن فعلی (یا اولین پلن) به‌عنوان انتخاب اولیه
  useEffect(() => {
    if (planCode !== null || plans.length === 0) return;
    const current = license?.plan_code
      ? plans.find((plan) => plan.code === license.plan_code)
      : null;
    setPlanCode((current ?? plans[0]).code);
  }, [license?.plan_code, planCode, plans]);

  const plan = useMemo(
    () => plans.find((item) => item.code === planCode) ?? plans[0] ?? null,
    [planCode, plans],
  );

  // سقف و کف کاربران با انتخاب پلن هم‌تراز می‌شود
  useEffect(() => {
    if (!plan) return;
    setSeats((current) => Math.min(Math.max(current, plan.min_seats), plan.max_seats));
  }, [plan]);

  useEffect(() => {
    if (durationMode === 'monthly') setMonths(1);
    if (durationMode === 'yearly') setMonths(years * 12);
  }, [durationMode, years]);

  const quote = useMemo(
    () => (plan ? computeQuote(plan, seats, months, coupon) : null),
    [plan, seats, months, coupon],
  );

  const changeSeats = (delta: number) => {
    if (!plan) return;
    setSeats((current) => Math.min(Math.max(current + delta, plan.min_seats), plan.max_seats));
  };

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (code === '') {
      setCoupon(null);
      setCouponError(null);
      return;
    }

    setCouponBusy(true);
    setCouponError(null);
    try {
      const response = await apiFetch<{
        quote: { discount: number; total: number; subtotal: number };
      }>(
        `/api/subscription/quote?plan_code=${encodeURIComponent(plan?.code ?? '')}&seats=${seats}&months=${months}&coupon_code=${encodeURIComponent(code)}`,
      );
      if (response.quote.discount <= 0) {
        setCoupon(null);
        setCouponError('این کد برای این سفارش تخفیفی ندارد.');
        return;
      }
      // تخفیف دقیقاً همان مبلغی است که سرور تأیید کرده (درصدی یا ثابت).
      setCoupon({ code: code.toUpperCase(), type: 'fixed', value: response.quote.discount });
      toast.success(`کد تخفیف اعمال شد: ${money(response.quote.discount)} تخفیف`);
    } catch (caught) {
      setCoupon(null);
      setCouponError(errorMessage(caught));
    } finally {
      setCouponBusy(false);
    }
  };

  const pay = async () => {
    if (!plan) return;
    setBusy(true);
    setInstructions(null);
    try {
      const response = await apiFetch<{
        order: SubscriptionOrder;
        redirect_url: string | null;
        instructions: string | null;
      }>('/api/subscription/checkout', {
        method: 'POST',
        body: JSON.stringify({
          plan_code: plan.code,
          seats,
          months,
          coupon_code: coupon?.code ?? null,
          gateway,
        }),
      });

      // قیمت نهایی همان است که سرور تعیین کرده است.
      if (quote && response.order.amount !== quote.total) {
        toast.error('مبلغ نهایی توسط سرور به‌روزرسانی شد؛ صفحه را تازه کنید.');
      }

      if (response.redirect_url) {
        toast.success('در حال انتقال به درگاه پرداخت…');
        onRedirect(response.redirect_url);
        return;
      }

      setInstructions(response.instructions);
      toast.success('سفارش ثبت شد؛ پس از واریز، شمارهٔ سفارش را برای پشتیبانی بفرستید.');
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !state) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">
        در حال خواندن تعرفه‌ها…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6" dir="rtl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <Crown className="h-6 w-6 text-primary dark:text-neon-400" aria-hidden />
            اشتراک و ارتقای حسابیار
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            پلن، تعداد کاربران و مدت را انتخاب کنید؛ قیمت همان لحظه و به‌صورت شفاف محاسبه می‌شود.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw aria-hidden className={loading ? 'animate-spin' : undefined} />
          تازه‌سازی
        </Button>
      </header>

      {error && (
        <Card className="mb-4 border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive" role="alert">
            {error}
          </CardContent>
        </Card>
      )}

      {/* وضعیت فعلی */}
      {license && (
        <Card className="mb-5 border-navy-200 dark:border-navy-700">
          <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-bold',
                STATUS_TONES[license.status ?? 'active'],
              )}
            >
              {STATUS_LABELS[license.status ?? 'active'] ?? license.status}
            </span>
            <span className="font-semibold">
              اشتراک فعلی:{' '}
              {plans.find((item) => item.code === license.plan_code)?.name ?? license.tier}
            </span>
            <span className="text-muted-foreground">
              {license.seats} کاربر مجاز · {state?.usage.used} کاربر فعال
            </span>
            <span className="text-muted-foreground">
              {license.is_lifetime
                ? ' بدون انقضا'
                : license.expires_at
                  ? ` تا ${formatJalaliLongISO(license.expires_at)}`
                  : ''}
            </span>
            {typeof license.days_remaining === 'number' && !license.is_lifetime && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                {toFaDigits(license.days_remaining)} روز باقی‌مانده
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {/* ۱) پلن‌ها */}
      <section aria-labelledby="plans-title" className="mb-6">
        <h2 id="plans-title" className="mb-3 text-lg font-extrabold">
          ۱) انتخاب نسخه
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((item) => {
            const selected = plan?.code === item.code;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => setPlanCode(item.code)}
                aria-pressed={selected}
                aria-label={`انتخاب پلن ${item.name}`}
                className={cn(
                  'rounded-2xl border p-4 text-start transition',
                  selected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/40 dark:border-neon-400 dark:bg-neon-400/10'
                    : 'border-border hover:border-primary/40 hover:bg-muted/50',
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-base font-extrabold">{item.name}</p>
                  {selected && (
                    <BadgeCheck className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
                  )}
                </div>
                <p className="mt-2 text-lg font-bold">{money(item.base_monthly)}</p>
                <p className="text-xs text-muted-foreground">ماهانه برای یک کاربر</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  هر کاربر اضافه: {money(item.extra_user_monthly)} در ماه
                </p>
                <ul className="mt-3 space-y-1 text-xs leading-6">
                  {item.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5">
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                        aria-hidden
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </section>

      {/* ۲) کاربران + ۳) مدت */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card className="border-navy-200 dark:border-navy-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
              ۲) تعداد کاربران
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="کاهش کاربر"
                onClick={() => changeSeats(-1)}
                disabled={!plan || seats <= plan.min_seats}
              >
                <Minus aria-hidden />
              </Button>
              <Input
                aria-label="تعداد کاربران"
                className="w-20 text-center"
                inputMode="numeric"
                value={seats}
                onChange={(event) => {
                  const value = Number(event.target.value.replace(/[^0-9]/g, ''));
                  if (!plan) return;
                  setSeats(
                    Math.min(Math.max(value || plan.min_seats, plan.min_seats), plan.max_seats),
                  );
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="افزایش کاربر"
                onClick={() => changeSeats(1)}
                disabled={!plan || seats >= plan.max_seats}
              >
                <Plus aria-hidden />
              </Button>
              <span className="text-sm text-muted-foreground">
                {plan ? `حداکثر ${toFaDigits(plan.max_seats)} کاربر` : ''}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 5, 10].map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={seats === preset ? 'default' : 'outline'}
                  onClick={() => setSeats(preset)}
                  disabled={!!plan && (preset < plan.min_seats || preset > plan.max_seats)}
                >
                  {toFaDigits(preset)} کاربر
                </Button>
              ))}
            </div>

            <p className="text-xs leading-6 text-muted-foreground">
              قیمت پایه شامل یک کاربر است. کاربران اضافه:{' '}
              <b>{toFaDigits(quote?.extra_users ?? 0)} نفر</b> — هزینهٔ ماهانهٔ کاربران اضافه:{' '}
              <b>{money(quote?.extra_monthly ?? 0)}</b>
            </p>
          </CardContent>
        </Card>

        <Card className="border-navy-200 dark:border-navy-700">
          <CardHeader>
            <CardTitle className="text-base">۳) مدت اشتراک</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['monthly', 'ماهانه'],
                  ['yearly', 'سالانه'],
                  ['custom', 'دلخواه'],
                ] as const
              ).map(([mode, label]) => (
                <Button
                  key={mode}
                  type="button"
                  variant={durationMode === mode ? 'default' : 'outline'}
                  onClick={() => {
                    setDurationMode(mode);
                    if (mode === 'monthly') setMonths(1);
                    if (mode === 'yearly') setMonths(years * 12);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>

            {durationMode === 'yearly' && (
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="کاهش سال"
                  onClick={() => setYears((current) => Math.max(1, current - 1))}
                  disabled={years <= 1}
                >
                  <Minus aria-hidden />
                </Button>
                <span className="text-sm font-semibold">{toFaDigits(years)} سال</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="افزایش سال"
                  onClick={() => setYears((current) => Math.min(2, current + 1))}
                  disabled={years >= 2}
                >
                  <Plus aria-hidden />
                </Button>
              </div>
            )}

            {durationMode === 'custom' && (
              <div className="flex flex-wrap gap-2">
                {allowedMonths.map((month) => (
                  <Button
                    key={month}
                    type="button"
                    size="sm"
                    variant={months === month ? 'default' : 'outline'}
                    onClick={() => setMonths(month)}
                  >
                    {toFaDigits(month)} ماه
                  </Button>
                ))}
              </div>
            )}

            <p className="text-xs leading-6 text-muted-foreground">
              مدت انتخاب‌شده: <b>{durationLabel(months, plan?.is_lifetime)}</b> — اشتراک سالانه
              دقیقاً ۱۲ برابر ماهانه است و تخفیف خودکاری ندارد.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ۴ و ۵) خلاصهٔ سفارش */}
      <Card className="mb-6 border-primary/30 dark:border-neon-400/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
            ۴) خلاصهٔ سفارش
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {quote && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <tbody>
                  <Row label="پلن انتخابی" value={quote.plan_name} />
                  <Row label="قیمت پایهٔ ماهانه" value={money(quote.base_monthly)} />
                  <Row label="تعداد کاربران" value={`${toFaDigits(quote.seats)} نفر`} />
                  <Row label="کاربران اضافه" value={`${toFaDigits(quote.extra_users)} نفر`} />
                  <Row label="هزینهٔ ماهانهٔ کاربران اضافه" value={money(quote.extra_monthly)} />
                  <Row label="مدت اشتراک" value={durationLabel(quote.months, quote.is_lifetime)} />
                  <Row label="مبلغ پایهٔ کل دوره" value={money(quote.base_total)} />
                  <Row label="مبلغ کاربران اضافه برای کل دوره" value={money(quote.extra_total)} />
                  <Row label="جمع پیش از تخفیف" value={money(quote.subtotal)} />
                  <Row
                    label="تخفیف"
                    value={quote.discount > 0 ? `− ${money(quote.discount)}` : 'ندارد'}
                    tone={quote.discount > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined}
                  />
                  <Row label="مبلغ نهایی قابل پرداخت" value={money(quote.total)} strong />
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="coupon">کد تخفیف (اختیاری)</Label>
              <div className="flex gap-2">
                <Input
                  id="coupon"
                  dir="ltr"
                  value={couponInput}
                  onChange={(event) => {
                    setCouponInput(event.target.value);
                    setCouponError(null);
                  }}
                  placeholder="مثلاً NOWRUZ"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void applyCoupon()}
                  disabled={couponBusy}
                >
                  اعمال
                </Button>
              </div>
              {couponError && (
                <p className="text-xs text-destructive" role="alert">
                  {couponError}
                </p>
              )}
              {coupon && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  کد {coupon.code} اعمال شد.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>روش پرداخت</Label>
              <div className="flex flex-wrap gap-2">
                {(state?.gateways ?? []).map((item) => (
                  <Button
                    key={item.key}
                    type="button"
                    size="sm"
                    variant={gateway === item.key ? 'default' : 'outline'}
                    aria-pressed={gateway === item.key}
                    onClick={() => setGateway(item.key)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {instructions && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="font-semibold">اطلاعات واریز</p>
              <p dir="ltr" className="mt-1 text-start">
                {instructions}
              </p>
            </div>
          )}

          {/* ۶) پرداخت */}
          <Button
            variant="neon"
            size="lg"
            className="w-full"
            onClick={() => void pay()}
            disabled={busy || !plan}
          >
            <CreditCard aria-hidden />
            {busy ? 'در حال ثبت سفارش…' : `پرداخت و فعال‌سازی — ${money(quote?.total ?? 0)}`}
          </Button>

          <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            مبلغ نهایی در سرور محاسبه و ثبت می‌شود؛ اطلاعات کارت در درگاه پرداخت وارد می‌شود و به
            کارو نمی‌رسد. اشتراک فقط پس از تأیید قطعی تراکنش فعال می‌شود.
          </p>
        </CardContent>
      </Card>

      {/* سابقه */}
      {(state?.orders.length ?? 0) > 0 && (
        <Card className="mb-6 border-navy-200 dark:border-navy-700">
          <CardHeader>
            <CardTitle className="text-base">سابقهٔ سفارش و فاکتور</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-2 py-2 text-start font-semibold">تاریخ</th>
                  <th className="px-2 py-2 text-start font-semibold">نوع</th>
                  <th className="px-2 py-2 text-start font-semibold">پلن</th>
                  <th className="px-2 py-2 text-start font-semibold">کاربر</th>
                  <th className="px-2 py-2 text-start font-semibold">مبلغ</th>
                  <th className="px-2 py-2 text-start font-semibold">وضعیت</th>
                  <th className="px-2 py-2 text-start font-semibold">فاکتور</th>
                </tr>
              </thead>
              <tbody>
                {state?.orders.map((order) => {
                  return (
                    <tr key={order.id} className="border-b last:border-0">
                      <td className="px-2 py-2">
                        {order.created_at ? formatJalaliLongISO(order.created_at) : '—'}
                      </td>
                      <td className="px-2 py-2">{ORDER_TYPE_LABELS[order.type] ?? order.type}</td>
                      <td className="px-2 py-2">{order.plan_label}</td>
                      <td className="px-2 py-2">{toFaDigits(order.seats)}</td>
                      <td className="px-2 py-2">{money(order.amount)}</td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-semibold',
                            order.status === 'paid'
                              ? STATUS_TONES.active
                              : order.status === 'pending'
                                ? STATUS_TONES.pending
                                : STATUS_TONES.expired,
                          )}
                        >
                          {order.status === 'paid'
                            ? 'پرداخت‌شده'
                            : order.status === 'pending'
                              ? 'در انتظار پرداخت'
                              : order.status === 'failed'
                                ? 'ناموفق'
                                : 'لغو‌شده'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs" dir="ltr">
                        {order.status === 'paid' ? (order.invoice_number ?? '—') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ۷) پرسش‌های متداول */}
      <section aria-labelledby="faq-title">
        <h2 id="faq-title" className="mb-3 text-lg font-extrabold">
          ۵) پرسش‌های متداول
        </h2>
        <div className="space-y-2">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="rounded-xl border border-border bg-card p-4 text-sm open:shadow-sm"
            >
              <summary className="cursor-pointer font-semibold">{item.q}</summary>
              <p className="mt-2 leading-7 text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className={cn('px-2 py-2', strong && 'font-extrabold')}>{label}</td>
      <td
        className={cn(
          'px-2 py-2 text-end',
          strong ? 'text-base font-extrabold' : 'font-medium',
          tone,
        )}
      >
        {value}
      </td>
    </tr>
  );
}
