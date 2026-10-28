import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eye, Plus, Receipt, Search, ShoppingCart, Undo2 } from 'lucide-react';
import { db, type Invoice } from '@/core/db/db';
import { formatMoney, formatNumber, toFaDigits } from '@/core/currency/currency';
import { currentJalaliMonthKey, formatJalaliNumeric, jalaliMonthLabel } from '@/core/jalali/jalali';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { filterInvoicesByMonth } from './store-calc';
import { invoicePaymentMethod, normalizeSearch, PAYMENT_LABELS } from './payment';
import { VoidInvoiceDialog } from './VoidInvoiceDialog';

export function InvoicesPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const invoices = useLiveQuery(() => db.invoices.orderBy('number').reverse().toArray(), [], []);
  const items = useLiveQuery(() => db.invoiceItems.toArray(), [], []);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const itemCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of items) map.set(item.invoiceId, (map.get(item.invoiceId) ?? 0) + 1);
    return map;
  }, [items]);
  const thisMonth = useMemo(
    () => filterInvoicesByMonth(invoices, currentJalaliMonthKey()),
    [invoices],
  );
  const filtered = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          (status === 'all' || (invoice.status ?? 'completed') === status) &&
          (method === 'all' || invoicePaymentMethod(invoice) === method) &&
          normalizeSearch(
            `${invoice.number} ${invoice.customerName ?? ''} ${invoice.note ?? ''}`,
          ).includes(normalizeSearch(search)),
      ),
    [invoices, search, status, method],
  );

  return (
    <div>
      <PageHeader
        title="فاکتورهای فروش"
        subtitle="جستجو، مشاهده رسید، چاپ و ابطال فروش با اصلاح خودکار انبار و درآمد"
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/store/invoices/new">
                <Plus />
                فاکتور جدید
              </Link>
            </Button>
            <Button asChild variant="neon">
              <Link to="/store/pos">
                <ShoppingCart />
                صندوق فروش
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          title={`فروش ${jalaliMonthLabel(currentJalaliMonthKey())}`}
          value={formatMoney(
            thisMonth.reduce((sum, i) => sum + i.total, 0),
            unit,
          )}
          icon={Receipt}
          tone="neon"
        />
        <StatCard
          title="فاکتورهای معتبر این ماه"
          value={`${formatNumber(thisMonth.length)} فاکتور`}
          icon={Receipt}
          tone="navy"
        />
        <StatCard
          title="فاکتورهای باطل‌شده"
          value={`${formatNumber(invoices.filter((i) => i.status === 'voided').length)} فاکتور`}
          icon={Undo2}
          tone="warning"
        />
      </div>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-40 flex-1">
            <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="ps-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="شماره فاکتور، نام مشتری یا یادداشت…"
              aria-label="جستجوی فاکتور"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40" aria-label="وضعیت فاکتور">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
              <SelectItem value="completed">فروش معتبر</SelectItem>
              <SelectItem value="voided">باطل‌شده</SelectItem>
            </SelectContent>
          </Select>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-40" aria-label="روش پرداخت فاکتور">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ پرداخت‌ها</SelectItem>
              {Object.entries(PAYMENT_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>
      {!invoices.length ? (
        <EmptyState
          icon={Receipt}
          title="هنوز فاکتوری صادر نشده است"
          description="اولین فروش را از صندوق ثبت کنید تا موجودی کم شود و درآمد آن به دفتر مالی اضافه شود."
          action={
            <Button asChild variant="neon">
              <Link to="/store/pos">
                <ShoppingCart />
                شروع فروش
              </Link>
            </Button>
          }
        />
      ) : !filtered.length ? (
        <EmptyState
          icon={Search}
          title="فاکتوری با این فیلتر پیدا نشد"
          description="عبارت جستجو یا فیلترها را تغییر دهید."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره / تاریخ</TableHead>
                <TableHead>مشتری</TableHead>
                <TableHead>روش پرداخت</TableHead>
                <TableHead>اقلام</TableHead>
                <TableHead>مبلغ کل</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  className={invoice.status === 'voided' ? 'bg-muted/30 text-muted-foreground' : ''}
                >
                  <TableCell>
                    <p className="font-bold">#{toFaDigits(invoice.number)}</p>
                    <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
                      {formatJalaliNumeric(new Date(invoice.date))}
                    </p>
                  </TableCell>
                  <TableCell>
                    {invoice.customerName ?? 'مشتری گذری'}
                    {invoice.source === 'pos' && (
                      <p className="mt-1 text-[10px] text-muted-foreground">ثبت از صندوق</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={invoice.isCredit ? 'warning' : 'secondary'}>
                      {PAYMENT_LABELS[invoicePaymentMethod(invoice)]}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatNumber(itemCounts.get(invoice.id!) ?? 0)} قلم</TableCell>
                  <TableCell
                    className={`whitespace-nowrap font-bold ${invoice.status === 'voided' ? 'line-through' : ''}`}
                  >
                    {formatMoney(invoice.total, unit)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={invoice.status === 'voided' ? 'destructive' : 'success'}>
                      {invoice.status === 'voided' ? 'باطل‌شده' : 'ثبت‌شده'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex gap-1">
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <Link
                          to={`/store/invoices/${invoice.id}`}
                          aria-label={`مشاهده فاکتور ${invoice.number}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      {invoice.status !== 'voided' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label={`ابطال فاکتور ${invoice.number}`}
                          onClick={() => setVoiding(invoice)}
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <VoidInvoiceDialog invoice={voiding} onOpenChange={(open) => !open && setVoiding(null)} />
    </div>
  );
}
