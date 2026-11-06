import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calculator,
  Check,
  FileText,
  FlaskConical,
  HandCoins,
  LogIn,
  Package,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, apiFetch } from '@/core/api/client';
import { formatNumber, toFaDigits } from '@/core/currency/currency';
import { setPlanIntent } from '@/features/subscription/plan-intent';
import type { SubscriptionPlan } from '@/features/subscription/subscription-types';
import { assetUrl, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import {
  LANDING_FAQ,
  LANDING_FEATURES,
  LANDING_STEPS,
  type LandingFeature,
} from './landing-content';

interface PlansResponse {
  plans: SubscriptionPlan[];
  trial_days: number;
  currency_label: string;
  public_registration: boolean;
}

const FEATURE_ICONS: Record<LandingFeature['icon'], typeof ShoppingCart> = {
  pos: ShoppingCart,
  invoice: FileText,
  inventory: Package,
  customers: Users,
  payroll: HandCoins,
  finance: TrendingUp,
  tools: Calculator,
  offline: WifiOff,
};

/** کارت تعرفه — قیمت پایهٔ ماهانه از سرور می‌آید (هیچ عدد ثابتی در UI نیست). */
function PlanCard({
  plan,
  currencyLabel,
  onChoose,
}: {
  plan: SubscriptionPlan;
  currencyLabel: string;
  onChoose: (code: string) => void;
}) {
  return (
    <Card className="flex h-full flex-col border-white/10 bg-white/[0.04] text-white shadow-xl">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-extrabold">{plan.name}</h3>
            <Badge variant="outline" className="border-white/20 text-white/70">
              {toFaDigits(plan.min_seats)} تا {plan.max_seats > 0 ? toFaDigits(plan.max_seats) : '∞'} کاربر
            </Badge>
          </div>
          {plan.description && (
            <p className="text-xs leading-6 text-white/55">{plan.description}</p>
          )}
        </div>

        <div>
          <p className="text-2xl font-black tracking-tight">
            {plan.is_lifetime ? 'مادام‌العمر' : formatNumber(plan.base_monthly)}
            {!plan.is_lifetime && (
              <span className="ms-1 text-xs font-medium text-white/50"> {currencyLabel} / ماه</span>
            )}
          </p>
          {!plan.is_lifetime && plan.extra_user_monthly > 0 && (
            <p className="mt-1 text-[11px] text-white/45">
              هر کاربر اضافه: {formatNumber(plan.extra_user_monthly)} {currencyLabel} در ماه
            </p>
          )}
        </div>

        <ul className="flex-1 space-y-2 text-xs text-white/70">
          {plan.features.slice(0, 5).map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="leading-5">{feature}</span>
            </li>
          ))}
        </ul>

        <Button type="button" variant="neon" className="w-full" onClick={() => onChoose(plan.code)}>
          شروع با این پلن
          <ArrowLeft aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * صفحهٔ معرفی عمومی (لندینگ) — نخستین چیزی که بازدیدکنندهٔ واردنشده می‌بیند.
 *
 * دمو، ثبت‌نام/خرید و ورود از همین صفحه شروع می‌شوند؛ ورود پس از خرید همان
 * نشست معمول برنامه است و کاربر را مستقیم به برنامهٔ فروشگاه می‌برد.
 */
export function LandingPage({
  onLogin,
  onSignup,
}: {
  onLogin: () => void;
  onSignup: () => void;
}) {
  const demoLogin = useAuthStore((s) => s.demoLogin);
  const [demoLoading, setDemoLoading] = useState(false);
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [plansError, setPlansError] = useState(false);

  useEffect(() => {
    let alive = true;

    apiFetch<PlansResponse>('/api/subscription/plans')
      .then((response) => {
        if (alive) {
          setPlans(response);
        }
      })
      .catch(() => {
        if (alive) {
          setPlansError(true);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  const startDemo = useCallback(async () => {
    setDemoLoading(true);
    try {
      await demoLogin();
      toast.success('دمو آماده است؛ همه‌چیز آزمایشی و پس از پایان پاک می‌شود.');
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? (Object.values(caught.errors ?? {}).flat().find(Boolean) ?? caught.message)
          : 'ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.';
      toast.error(message || 'ساخت دمو ناموفق بود.');
    } finally {
      setDemoLoading(false);
    }
  }, [demoLogin]);

  const trialDays = plans?.trial_days ?? 14;
  const currencyLabel = plans?.currency_label ?? 'تومان';
  const canRegister = plans?.public_registration ?? true;

  return (
    <div dir="rtl" className="min-h-dvh scroll-smooth bg-navy-900 text-white">
      {/* ————— هدر ————— */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-900/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a href="#top" className="flex min-w-0 items-center gap-2">
            <img
              src={assetUrl('images/karo/mark.png')}
              alt="لوگوی کارو"
              width={512}
              height={512}
              className="h-9 w-9 shrink-0 rounded-xl ring-1 ring-white/15"
            />
            <span className="truncate text-sm font-extrabold">کارو — نرم‌افزار حسابداری</span>
          </a>

          <nav aria-label="بخش‌های صفحه" className="hidden items-center gap-5 text-sm text-white/65 md:flex">
            <a className="transition hover:text-white" href="#features">
              ویژگی‌ها
            </a>
            <a className="transition hover:text-white" href="#demo">
              دمو
            </a>
            <a className="transition hover:text-white" href="#pricing">
              تعرفه‌ها
            </a>
            <a className="transition hover:text-white" href="#faq">
              پرسش‌ها
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" size="sm" className="text-white/80" onClick={onLogin}>
              <LogIn aria-hidden />
              ورود
            </Button>
            {canRegister && (
              <Button type="button" variant="neon" size="sm" onClick={onSignup}>
                شروع رایگان
              </Button>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        {/* ————— قهرمان صفحه ————— */}
        <section className="relative overflow-hidden px-4 pb-16 pt-12 sm:pt-16" aria-labelledby="hero-title">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(34,211,238,0.18),transparent_70%)]"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <Badge variant="outline" className="border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
                <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
                آفلاین واقعی · دادهٔ شما روی دستگاه خودتان
              </Badge>

              <h1 id="hero-title" className="text-3xl font-black leading-[1.35] sm:text-4xl sm:leading-[1.3]">
                حسابداری فروشگاه،
                <span className="bg-gradient-to-l from-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                  {' '}
                  ساده و همیشه در دسترس
                </span>
              </h1>

              <p className="max-w-xl text-sm leading-7 text-white/70 sm:text-base">
                فروش، فاکتور، انبار، مشتریان، حقوق و دستمزد و گزارش‌ها — همه در یک برنامهٔ فارسی.
                بدون اینترنت کار می‌کند، فاکتور رسمی می‌سازد و داده‌ات را از دست نمی‌دهد.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                {canRegister && (
                  <Button type="button" variant="neon" size="lg" onClick={onSignup}>
                    ساخت فروشگاه و شروع رایگان
                    <ArrowLeft aria-hidden />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="border-white/25 bg-white/[0.03] text-white hover:bg-white/10"
                  onClick={() => void startDemo()}
                  disabled={demoLoading}
                >
                  <FlaskConical aria-hidden />
                  {demoLoading ? 'در حال ساخت دمو…' : 'امتحان دموی امن'}
                </Button>
              </div>

              <dl className="grid max-w-lg grid-cols-2 gap-3 text-xs text-white/60 sm:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <dt className="text-white/40">دورهٔ آزمایشی</dt>
                  <dd className="mt-1 font-bold text-white">{toFaDigits(trialDays)} روز رایگان</dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <dt className="text-white/40">نصب</dt>
                  <dd className="mt-1 font-bold text-white">وب، دسکتاپ، اندروید</dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <dt className="text-white/40">فاکتور</dt>
                  <dd className="mt-1 font-bold text-white">چاپ و PDF فارسی</dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <dt className="text-white/40">پشتیبان</dt>
                  <dd className="mt-1 font-bold text-white">JSON و همگام‌سازی</dd>
                </div>
              </dl>
            </div>

            {/* پیش‌نمایش تصویری (نمونهٔ رابط) */}
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-tr from-cyan-500/20 via-transparent to-emerald-500/20 blur-2xl"
              />
              <Card className="overflow-hidden border-white/10 bg-white/[0.04] text-white shadow-2xl">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>پیش‌نمایش داشبورد (نمونه)</span>
                    <span className="flex gap-1" aria-hidden>
                      <i className="h-2 w-2 rounded-full bg-red-400/70" />
                      <i className="h-2 w-2 rounded-full bg-amber-300/70" />
                      <i className="h-2 w-2 rounded-full bg-emerald-400/70" />
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ['فروش امروز', '۱۲٬۴۵۰٬۰۰۰'],
                      ['فاکتورها', '۳۸'],
                      ['موجودی کم', '۴ کالا'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-white/10 bg-white/[0.05] p-3">
                        <p className="text-[10px] text-white/45">{label}</p>
                        <p className="mt-1 text-sm font-extrabold">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-3 flex items-center justify-between text-[11px] text-white/50">
                      <span>روند فروش هفته</span>
                      <span className="text-emerald-300">+۱۸٪</span>
                    </div>
                    <div className="flex h-24 items-end gap-1.5" aria-hidden>
                      {[38, 52, 44, 66, 58, 78, 92].map((height, index) => (
                        <span
                          key={index}
                          className={cn(
                            'flex-1 rounded-t-md',
                            index === 6
                              ? 'bg-gradient-to-t from-cyan-500/70 to-emerald-300'
                              : 'bg-white/15',
                          )}
                          style={{ height: `${height}%` }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 text-[11px] text-white/60">
                    {[
                      ['فاکتور ۱۰۲۴', 'چای کیسه‌ای ۲۵ عددی', '۲۴۰٬۰۰۰'],
                      ['فاکتور ۱۰۲۳', 'برنج ایرانی ۵ کیلویی', '۷۵۰٬۰۰۰'],
                    ].map(([number, item, amount]) => (
                      <div
                        key={number}
                        className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
                      >
                        <span className="text-white/70">{number}</span>
                        <span className="truncate px-2">{item}</span>
                        <span className="font-bold text-white">{amount}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ————— ویژگی‌ها ————— */}
        <section id="features" className="border-t border-white/5 px-4 py-16" aria-labelledby="features-title">
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="max-w-2xl space-y-2">
              <h2 id="features-title" className="text-2xl font-black">
                هر چیزی که یک کسب‌وکار کوچک لازم دارد
              </h2>
              <p className="text-sm leading-7 text-white/60">
                از صندوق فروش تا حقوق و دستمزد؛ بدون ماژول اضافه، بدون آموزش طولانی.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {LANDING_FEATURES.map((feature) => {
                const Icon = FEATURE_ICONS[feature.icon];

                return (
                  <Card key={feature.title} className="border-white/10 bg-white/[0.03] text-white transition hover:border-cyan-400/30">
                    <CardContent className="space-y-2 p-4">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                        <Icon aria-hidden className="h-5 w-5" />
                      </span>
                      <h3 className="text-sm font-extrabold">{feature.title}</h3>
                      <p className="text-xs leading-6 text-white/55">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* ————— دمو و مسیر شروع ————— */}
        <section
          id="demo"
          className="border-t border-white/5 bg-white/[0.02] px-4 py-16"
          aria-labelledby="demo-title"
        >
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <Badge variant="outline" className="border-amber-300/40 bg-amber-300/10 text-amber-200">
                <Sparkles aria-hidden className="h-3.5 w-3.5" />
                بدون ثبت‌نام، بدون پرداخت
              </Badge>
              <h2 id="demo-title" className="text-2xl font-black">
                دموی امن را امتحان کنید
              </h2>
              <p className="text-sm leading-7 text-white/65">
                یک فروشگاه آزمایشی و کاملاً جدا با کالاها، مشتریان و فاکتورهای نمونه برایتان ساخته
                می‌شود. هر کاری می‌خواهید بکنید؛ در پایان، دادهٔ دمو خودکار پاک می‌شود و به دادهٔ
                مشتریان واقعی هیچ آسیبی نمی‌رسد.
              </p>
              <Button
                type="button"
                variant="neon"
                size="lg"
                onClick={() => void startDemo()}
                disabled={demoLoading}
              >
                <FlaskConical aria-hidden />
                {demoLoading ? 'در حال ساخت دمو…' : 'ورود به دموی امن'}
              </Button>
            </div>

            <ol className="grid gap-3 sm:grid-cols-3">
              {LANDING_STEPS.map((step, index) => (
                <li key={step.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                    {toFaDigits(index + 1)}
                  </span>
                  <h3 className="mt-2 text-sm font-extrabold">{step.title}</h3>
                  <p className="mt-1 text-xs leading-6 text-white/55">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ————— تعرفه‌ها ————— */}
        <section id="pricing" className="border-t border-white/5 px-4 py-16" aria-labelledby="pricing-title">
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="max-w-2xl space-y-2">
              <h2 id="pricing-title" className="text-2xl font-black">
                تعرفه‌ها
              </h2>
              <p className="text-sm leading-7 text-white/60">
                قیمت ماهانه بر اساس تعداد کاربر؛ سالانه معادل ۱۲ ماه است. مبلغ نهایی همیشه در سرور
                محاسبه می‌شود و تعرفه‌ها از پنل مدیریت به‌روز می‌شوند.
              </p>
            </div>

            {plansError && (
              <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                فعلاً نمایش تعرفه‌ها ممکن نیست؛ از دکمهٔ «شروع رایگان» وارد شوید و تعرفه‌ها را داخل
                برنامه ببینید.
              </p>
            )}

            {!plans && !plansError && (
              <div className="grid gap-3 md:grid-cols-3">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-72 rounded-2xl bg-white/5" />
                ))}
              </div>
            )}

            {plans && (
              <div className="grid gap-3 md:grid-cols-3">
                {plans.plans.map((plan) => (
                  <PlanCard
                    key={plan.code}
                    plan={plan}
                    currencyLabel={currencyLabel}
                    onChoose={(code) => {
                      setPlanIntent(code);
                      onSignup();
                    }}
                  />
                ))}
              </div>
            )}

            <p className="text-xs leading-6 text-white/40">
              پرداخت با زرین‌پال یا کارت‌به‌کارت (با ثبت مرجع و تأیید مدیر) انجام می‌شود. با پایان
              اشتراک، دسترسی محدود می‌شود اما داده‌های شما حذف نمی‌شود.
            </p>
          </div>
        </section>

        {/* ————— پرسش‌های متداول ————— */}
        <section
          id="faq"
          className="border-t border-white/5 bg-white/[0.02] px-4 py-16"
          aria-labelledby="faq-title"
        >
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 id="faq-title" className="text-2xl font-black">
              پرسش‌های متداول
            </h2>
            <div className="space-y-2">
              {LANDING_FAQ.map((item) => (
                <details
                  key={item.question}
                  className="group rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <summary className="cursor-pointer list-none text-sm font-bold marker:hidden">
                    <span className="flex items-center justify-between gap-3">
                      {item.question}
                      <span aria-hidden className="text-xl text-white/30 transition group-open:rotate-45">
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-2 text-xs leading-6 text-white/60">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ————— فراخوان پایانی ————— */}
        <section className="px-4 py-16">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 rounded-3xl border border-white/10 bg-gradient-to-tr from-cyan-500/10 via-white/[0.03] to-emerald-500/10 p-8 text-center">
            <h2 className="text-2xl font-black">همین امروز شروع کنید</h2>
            <p className="max-w-xl text-sm leading-7 text-white/60">
              با دورهٔ آزمایشی رایگان شروع کنید، یا اول دمو را ببینید. هر وقت آماده بودید، اشتراک
              بگیرید و با همان حساب وارد برنامه شوید.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {canRegister && (
                <Button type="button" variant="neon" size="lg" onClick={onSignup}>
                  ساخت فروشگاه
                  <ArrowLeft aria-hidden />
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="border-white/25 bg-transparent text-white hover:bg-white/10"
                onClick={onLogin}
              >
                <LogIn aria-hidden />
                قبلاً حساب دارم — ورود
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-4 py-8 text-xs text-white/45">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p>© کارو — نرم‌افزار حسابداری · کارن سافت</p>
          <div className="flex items-center gap-4">
            <a className="transition hover:text-white" href="https://www.karen-soft.ir" target="_blank" rel="noreferrer">
              karen-soft.ir
            </a>
            <button type="button" className="transition hover:text-white" onClick={onLogin}>
              ورود به برنامه
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
