import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Banknote, HandCoins, Receipt, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  db,
  type CustomerPayment,
  type Invoice,
  type InvoiceItem,
  type Product,
} from '@/core/db/db';
import { formatMoney, formatNumber, toFaDigits } from '@/core/currency/currency';
import { currentJalaliMonthKey, jalaliMonthKey, jalaliMonthLabel } from '@/core/jalali/jalali';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  dailySalesSeries,
  filterInvoicesByMonth,
  lowStockProducts,
  monthlySalesSeries,
  salesTotals,
  topProducts,
} from './store-calc';
import { totalReceivables } from './customers-calc';

/** گزارش فروش روزانه/ماهانه، سود ناخالص، کالاهای پرفروش و کمبود موجودی */
export function StoreReportsPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const invoices = useLiveQuery(() => db.invoices.toArray(), [], [] as Invoice[]);
  const items = useLiveQuery(() => db.invoiceItems.toArray(), [], [] as InvoiceItem[]);
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[]);
  const payments = useLiveQuery(() => db.customerPayments.toArray(), [], [] as CustomerPayment[]);
  const [month, setMonth] = useState(currentJalaliMonthKey());

  const monthOptions = useMemo(() => {
    const set = new Set<string>([currentJalaliMonthKey()]);
    for (const inv of invoices) set.add(jalaliMonthKey(new Date(inv.date)));
    return [...set].sort().reverse().slice(0, 24);
  }, [invoices]);

  const monthInvoices = useMemo(() => filterInvoicesByMonth(invoices, month), [invoices, month]);
  const totals = useMemo(() => salesTotals(monthInvoices, items), [monthInvoices, items]);
  const daily = useMemo(() => dailySalesSeries(invoices, month), [invoices, month]);
  const monthly = useMemo(() => monthlySalesSeries(invoices, 6), [invoices]);
  const monthItemIds = useMemo(() => new Set(monthInvoices.map((i) => i.id)), [monthInvoices]);
  const tops = useMemo(
    () =>
      topProducts(
        items.filter((i) => monthItemIds.has(i.invoiceId)),
        10,
      ),
    [items, monthItemIds],
  );
  const lowStock = useMemo(() => lowStockProducts(products), [products]);

  const marginPercent = totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : 0;
  const receivables = useMemo(() => totalReceivables(invoices, payments), [invoices, payments]);

  return (
    <div>
      <PageHeader
        title="گزارش فروش"
        subtitle="فروش روزانه و ماهانه، سود ناخالص و کالاهای پرفروش فروشگاه"
        actions={
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-48" aria-label="انتخاب ماه گزارش">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((key) => (
                <SelectItem key={key} value={key}>
                  {jalaliMonthLabel(key)}
                  {key === currentJalaliMonthKey() ? ' (جاری)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {invoices.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="هنوز فروشی ثبت نشده است"
          description="پس از صدور اولین فاکتور، نمودارهای فروش روزانه و ماهانه و سود ناخالص اینجا نمایش داده می‌شود."
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard
              title={`فروش ${jalaliMonthLabel(month)}`}
              value={formatMoney(totals.revenue, unit)}
              icon={Banknote}
              tone="neon"
            />
            <StatCard
              title="سود ناخالص"
              value={formatMoney(totals.grossProfit, unit)}
              hint={`حاشیه: ${toFaDigits(marginPercent.toFixed(1))}٪`}
              icon={TrendingUp}
              tone="success"
            />
            <StatCard
              title="بهای تمام‌شده‌ی فروش"
              value={formatMoney(totals.cost, unit)}
              icon={Receipt}
              tone="navy"
            />
            <StatCard
              title="تعداد فاکتور"
              value={`${formatNumber(totals.invoiceCount)} فاکتور`}
              icon={Receipt}
              tone="navy"
            />
            <StatCard
              title="مطالبات مشتریان (نسیه)"
              value={formatMoney(receivables, unit)}
              icon={HandCoins}
              tone="warning"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">فروش روزانه‌ی {jalaliMonthLabel(month)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div dir="ltr" className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) =>
                          toFaDigits(String(Math.round(v / 1_000_000)) + ' م')
                        }
                        width={44}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatMoney(value, unit), 'فروش روز']}
                        labelFormatter={(l: string) => `روز ${l}`}
                      />
                      <Bar dataKey="total" fill="#0B1B3A" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">روند فروش ۶ ماه اخیر</CardTitle>
              </CardHeader>
              <CardContent>
                <div dir="ltr" className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                        formatter={(value: number) => [formatMoney(value, unit), 'فروش ماه']}
                      />
                      <Bar dataKey="revenue" fill="#17e76c" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  پرفروش‌ترین کالاها در {jalaliMonthLabel(month)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tops.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    در این ماه فروشی ثبت نشده است.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>کالا</TableHead>
                        <TableHead>تعداد</TableHead>
                        <TableHead>فروش</TableHead>
                        <TableHead>سود</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tops.map((p) => (
                        <TableRow key={p.name}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{formatNumber(p.qty)}</TableCell>
                          <TableCell>{formatMoney(p.revenue, unit)}</TableCell>
                          <TableCell className="text-success">
                            {formatMoney(p.profit, unit)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />
                  هشدار کمبود موجودی
                </CardTitle>
              </CardHeader>
              <CardContent>
                {lowStock.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    همه‌ی کالاها موجودی کافی دارند.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {lowStock.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{p.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            حد هشدار: {formatNumber(p.minStock)} {p.unit}
                          </span>
                        </span>
                        <Badge variant={p.stock <= 0 ? 'destructive' : 'warning'}>
                          {formatNumber(p.stock)} {p.unit}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
