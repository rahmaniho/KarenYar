import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  CalendarClock,
  Plus,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db, type CustomerPayment } from '@/core/db/db';
import { formatMoney, formatNumber, toFaDigits } from '@/core/currency/currency';
import { formatJalaliNumeric } from '@/core/jalali/jalali';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { dashboardSnapshot, RANGE_LABELS, type DashboardRange } from './invoice-dashboard';
import { invoiceDueDate, invoicesNeedingFollowUp } from './invoice-domain';
import { useUrlState } from './use-url-state';

const RANGES: DashboardRange[] = ['7d', '30d', 'month', 'prev-month', '90d', 'all'];

const STATUS_COLORS: Record<string, string> = {
  draft: '#94A3B8',
  paid: '#12B76A',
  partial: '#F79009',
  unpaid: '#64748B',
  overdue: '#D92D20',
  voided: '#98A2B3',
};

function ChangeBadge({
  percent,
  available = true,
}: {
  percent: number | null;
  available?: boolean;
}) {
  if (!available)
    return (
      <span className="text-xs text-muted-foreground">برای همهٔ دوره‌ها مقایسه تعریف نشده است</span>
    );
  if (percent === null) return <span className="text-xs text-muted-foreground">دوره‌ی قبل: —</span>;
  const rounded = Math.round(percent);
  if (rounded === 0)
    return <span className="text-xs text-muted-foreground">بدون تغییر نسبت به دوره‌ی قبل</span>;
  const positive = rounded > 0;
  return (
    <span
      className={`text-xs font-semibold ${positive ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}
    >
      {positive ? '▲' : '▼'} {toFaDigits(Math.abs(rounded))}٪ نسبت به دوره‌ی قبل
    </span>
  );
}

/**
 * داشبورد ماژول فاکتور — همه‌ی اعداد از فاکتورها و پرداخت‌های واقعی محاسبه می‌شوند.
 */
export function InvoiceDashboardPage() {
  const navigate = useNavigate();
  const unit = useSettingsStore((s) => s.currencyUnit);
  const invoices = useLiveQuery(() => db.invoices.toArray(), [], []);
  const payments = useLiveQuery(() => db.customerPayments.toArray(), [], [] as CustomerPayment[]);
  const { values, update } = useUrlState({ range: 'month' });
  const range = (RANGES.find((item) => item === values.range) ?? 'month') as DashboardRange;

  const snapshot = useMemo(
    () => dashboardSnapshot(invoices, payments, range),
    [invoices, payments, range],
  );
  const followUp = useMemo(
    () => invoicesNeedingFollowUp(invoices, payments, 6),
    [invoices, payments],
  );
  const latest = useMemo(
    () =>
      [...invoices]
        .filter((invoice) => invoice.status !== 'draft')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6),
    [invoices],
  );

  const money = (value: number) => formatMoney(value, unit);
  const statusTotal = snapshot.status.reduce((sum, slice) => sum + slice.count, 0) || 1;

  if (!invoices.length) {
    return (
      <div>
        <PageHeader title="داشبورد فاکتور" subtitle="نمای کلی فروش، وصول و مطالبات" />
        <EmptyState
          icon={Receipt}
          title="هنوز فاکتوری ثبت نشده است"
          description="با ثبت اولین فاکتور، شاخص‌های فروش و مطالبات این داشبورد تکمیل می‌شود."
          action={
            <Button asChild variant="neon">
              <Link to="/store/invoices/new">
                <Plus aria-hidden />
                صدور فاکتور
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="داشبورد فاکتور"
        subtitle={`دوره‌ی ${RANGE_LABELS[range]} — ${toFaDigits(snapshot.stats.count)} فاکتور معتبر`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/store/invoices/issued">
                <Receipt aria-hidden />
                فهرست فاکتورها
              </Link>
            </Button>
            <Button asChild variant="neon">
              <Link to="/store/invoices/new">
                <Plus aria-hidden />
                فاکتور جدید
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((item) => (
          <Button
            key={item}
            size="sm"
            variant={item === range ? 'default' : 'outline'}
            onClick={() => update({ range: item })}
            aria-pressed={item === range}
          >
            {RANGE_LABELS[item]}
          </Button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">فروش دوره</p>
              <p className="mt-1 text-xl font-extrabold">{money(snapshot.sales.value)}</p>
            </div>
            <TrendingUp className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
          </div>
          <div className="mt-2">
            <ChangeBadge
              percent={snapshot.sales.changePercent}
              available={snapshot.comparisonAvailable}
            />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">وصول‌شده</p>
              <p className="mt-1 text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                {money(snapshot.collected.value)}
              </p>
            </div>
            <Wallet className="h-5 w-5 text-emerald-600" aria-hidden />
          </div>
          <div className="mt-2">
            <ChangeBadge
              percent={snapshot.collected.changePercent}
              available={snapshot.comparisonAvailable}
            />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">مانده‌ی وصول‌نشده</p>
              <p className="mt-1 text-xl font-extrabold text-amber-700 dark:text-amber-400">
                {money(snapshot.outstanding)}
              </p>
            </div>
            <CalendarClock className="h-5 w-5 text-amber-600" aria-hidden />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {toFaDigits(snapshot.draftLike)} فاکتور در انتظار پرداخت ·{' '}
            {toFaDigits(snapshot.stats.draftCount)} پیش‌نویس
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">سررسید گذشته</p>
              <p className="mt-1 text-xl font-extrabold text-destructive">
                {money(snapshot.overdue)}
              </p>
            </div>
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {toFaDigits(snapshot.overdueCount)} فاکتور نیازمند پیگیری
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-bold">
              <BarChart3 className="h-4 w-4 text-primary dark:text-neon-400" aria-hidden />
              روند فروش شش ماه اخیر
            </p>
            <span className="text-xs text-muted-foreground">باطل‌شده‌ها محاسبه نشده‌اند</span>
          </div>
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={snapshot.monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={70}
                  tickFormatter={(value: number) =>
                    formatNumber(Math.round(value * (unit === 'rial' ? 10 : 1)))
                  }
                />
                <Tooltip
                  formatter={(value: number) => [money(value), 'فروش']}
                  labelStyle={{ fontFamily: 'inherit' }}
                />
                <Bar dataKey="revenue" fill="#0B1B3A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <p className="mb-3 text-sm font-bold">ترکیب وضعیت فاکتورها</p>
          <ul className="space-y-2">
            {snapshot.status.map((slice) => (
              <li key={slice.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: STATUS_COLORS[slice.key] }}
                  />
                  {slice.label}
                </span>
                <span className="text-muted-foreground">
                  {toFaDigits(slice.count)} فاکتور · {money(slice.amount)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {snapshot.status.map((slice) => (
              <span
                key={slice.key}
                style={{
                  width: `${(slice.count / statusTotal) * 100}%`,
                  background: STATUS_COLORS[slice.key],
                }}
                className="inline-block h-full"
                title={`${slice.label}: ${toFaDigits(slice.count)}`}
              />
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">آخرین فاکتورها</p>
            <Link
              to="/store/invoices/issued"
              className="text-xs font-semibold text-primary hover:underline dark:text-neon-400"
            >
              همه
            </Link>
          </div>
          <ul className="divide-y text-sm">
            {latest.map((invoice) => (
              <li key={invoice.id} className="flex items-center justify-between gap-2 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-start"
                  onClick={() => navigate(`/store/invoices/${invoice.id}`)}
                >
                  <span className="font-bold">#{toFaDigits(invoice.number)}</span>
                  <span className="truncate text-muted-foreground">
                    {invoice.customerName ?? 'مشتری گذری'}
                  </span>
                </button>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatJalaliNumeric(new Date(invoice.date))}
                </span>
                <span className="whitespace-nowrap font-bold">{money(invoice.total)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">نیازمند پیگیری</p>
            <span className="text-xs text-muted-foreground">نزدیک‌ترین سررسید</span>
          </div>
          {followUp.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              همه‌ی فاکتورها تسویه شده‌اند.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {followUp.map((invoice) => (
                <li key={invoice.id} className="flex items-center justify-between gap-2 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-start"
                    onClick={() => navigate(`/store/invoices/${invoice.id}`)}
                  >
                    <ArrowLeftRight
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="font-bold">#{toFaDigits(invoice.number)}</span>
                    <span className="truncate text-muted-foreground">
                      {invoice.customerName ?? 'مشتری گذری'}
                    </span>
                  </button>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    سررسید {formatJalaliNumeric(invoiceDueDate(invoice))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="outline" size="sm" className="mt-3 w-full">
            <Link to="/store/invoices/issued?status=overdue">
              <Receipt aria-hidden />
              مشاهده‌ی فاکتورهای سررسیدگذشته
            </Link>
          </Button>
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/store/pos">
            <ShoppingCart aria-hidden />
            صندوق فروش
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/store/customers">
            <Wallet aria-hidden />
            حساب مشتریان
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/store/reports">
            <BarChart3 aria-hidden />
            گزارش فروش
          </Link>
        </Button>
      </div>
    </div>
  );
}
