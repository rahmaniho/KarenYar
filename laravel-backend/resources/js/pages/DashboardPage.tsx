import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Calculator,
  CalendarClock,
  Package,
  Plus,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db, type Debt, type Invoice, type Product, type Transaction } from '@/core/db/db';
import { formatDecimal, formatMoney, formatNumber, toFaDigits } from '@/core/currency/currency';
import {
  currentJalaliMonthKey,
  formatJalaliFull,
  formatJalaliNumeric,
  jalaliMonthLabel,
} from '@/core/jalali/jalali';
import { useSettingsStore } from '@/store/settings-store';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  filterByMonthKey,
  monthlySeries,
  sumTransactions,
  upcomingDebts,
} from '@/features/personal/personal-calc';
import { filterInvoicesByMonth, lowStockProducts, todaySales } from '@/features/store/store-calc';

/** داشبورد — نمای کلی فروشگاه و مالی شخصی امروز و این ماه */
export function DashboardPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const shopName = useSettingsStore((s) => s.shopName);

  const invoices = useLiveQuery(() => db.invoices.toArray(), [], [] as Invoice[]);
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[]);
  const transactions = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().toArray(),
    [],
    [] as Transaction[],
  );
  const debts = useLiveQuery(() => db.debts.toArray(), [], [] as Debt[]);

  const monthKey = currentJalaliMonthKey();
  const monthTransactions = useMemo(
    () => filterByMonthKey(transactions, monthKey),
    [transactions, monthKey],
  );
  const totals = useMemo(() => sumTransactions(monthTransactions), [monthTransactions]);
  const monthSales = useMemo(
    () => filterInvoicesByMonth(invoices, monthKey).reduce((s, i) => s + i.total, 0),
    [invoices, monthKey],
  );
  const salesToday = useMemo(() => todaySales(invoices), [invoices]);
  const lowStock = useMemo(() => lowStockProducts(products), [products]);
  const upcoming = useMemo(() => upcomingDebts(debts, 7), [debts]);
  const series = useMemo(() => monthlySeries(transactions, 6), [transactions]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="page-title">داشبورد {shopName}</h1>
        <p className="page-subtitle">
          {formatJalaliFull(new Date())} — همه‌چیز روی همین دستگاه و آفلاین در دسترس است.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/20 bg-success/5 p-4">
        <div>
          <p className="font-bold">فروش، انبار و حساب‌ها؛ هماهنگ در یک جا</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            با ثبت فروش در صندوق، موجودی به‌روز و درآمد به‌صورت خودکار ثبت می‌شود؛ بدون ورود دوبارهٔ
            اطلاعات.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/store/inventory">مشاهده گردش انبار ←</Link>
        </Button>
      </div>
      {/* اقدام‌های سریع */}
      <div className="mb-5 flex flex-wrap gap-2">
        <Button asChild variant="neon">
          <Link to="/store/pos">
            <ShoppingCart aria-hidden /> صندوق فروش
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/store/invoices/new">
            <Receipt aria-hidden />
            فاکتور جدید
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/store/finance">
            <Plus aria-hidden /> دفتر مالی کسب‌وکار
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/store/products">
            <Package aria-hidden /> کالای جدید
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/calculator">
            <Calculator aria-hidden /> ماشین‌حساب
          </Link>
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="فروش امروز"
          value={formatMoney(salesToday, unit)}
          icon={Banknote}
          tone="neon"
        />
        <StatCard
          title={`فروش ${jalaliMonthLabel(monthKey)}`}
          value={formatMoney(monthSales, unit)}
          icon={TrendingUp}
          tone="navy"
        />
        <StatCard
          title={`درآمد ثبت‌شدهٔ این ماه`}
          value={formatMoney(totals.income, unit)}
          icon={ArrowDownCircle}
          tone="success"
        />
        <StatCard
          title={`هزینه‌های این ماه`}
          value={formatMoney(totals.expense, unit)}
          icon={ArrowUpCircle}
          tone="danger"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">درآمد و هزینه — ۶ ماه اخیر</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="py-10 text-center text-sm leading-7 text-muted-foreground">
                هنوز تراکنشی ثبت نشده است.
                <br />
                از دکمه‌ی «ثبت تراکنش» شروع کنید تا نمودار مالی شما شکل بگیرد.
              </p>
            ) : (
              <div dir="ltr" className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) =>
                        toFaDigits(String(Math.round(v / 1_000_000)) + ' م')
                      }
                      width={44}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatMoney(value, unit),
                        name === 'income' ? 'درآمد' : 'هزینه',
                      ]}
                    />
                    <Bar dataKey="income" fill="#17e76c" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expense" fill="#e11d48" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-5 w-5 text-warning" aria-hidden />
                سررسیدهای نزدیک
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="py-3 text-center text-sm text-muted-foreground">
                  در ۷ روز آینده سررسیدی ندارید.
                </p>
              ) : (
                <ul className="divide-y">
                  {upcoming.map((s) => (
                    <li key={s.debt.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{s.debt.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatJalaliNumeric(new Date(s.debt.dueDate))} — مانده{' '}
                          {formatMoney(s.remaining, unit)}
                        </span>
                      </span>
                      <Badge variant={s.isOverdue ? 'destructive' : 'warning'}>
                        {s.isOverdue ? 'گذشته' : `${formatNumber(s.daysToDue)} روز`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
                <Link to="/personal/debts">مدیریت بدهی و اقساط</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />
                کمبود موجودی
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lowStock.length === 0 ? (
                <p className="py-3 text-center text-sm text-muted-foreground">
                  موجودی همه‌ی کالاها کافی است.
                </p>
              ) : (
                <ul className="divide-y">
                  {lowStock.slice(0, 5).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      <Badge variant={p.stock <= 0 ? 'destructive' : 'warning'}>
                        {formatDecimal(p.stock, 6)} {p.unit}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
                <Link to="/store/products">مدیریت کالاها</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* آخرین تراکنش‌ها */}
      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
            آخرین گردش‌های مالی
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/personal/transactions">مشاهده‌ی همه</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              تراکنشی برای نمایش وجود ندارد.
            </p>
          ) : (
            <ul className="divide-y">
              {transactions.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={
                      t.type === 'income'
                        ? 'flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success'
                        : 'flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive'
                    }
                  >
                    {t.type === 'income' ? (
                      <ArrowDownCircle className="h-5 w-5" aria-hidden />
                    ) : (
                      <ArrowUpCircle className="h-5 w-5" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.category}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatJalaliNumeric(new Date(t.date))}
                      {t.description ? ` — ${t.description}` : ''}
                      {t.source === 'sale' ? ' · فروش خودکار' : ''}
                    </span>
                  </span>
                  <span
                    className={
                      t.type === 'income'
                        ? 'text-sm font-bold text-success'
                        : 'text-sm font-bold text-destructive'
                    }
                  >
                    {t.type === 'income' ? '+' : '−'} {formatMoney(t.amount, unit)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
