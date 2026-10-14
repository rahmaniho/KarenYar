import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eye, Plus, Receipt, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, type Invoice, type InvoiceItem } from '@/core/db/db';
import { formatMoney, formatNumber, toFaDigits } from '@/core/currency/currency';
import { currentJalaliMonthKey, formatJalaliNumeric, jalaliMonthLabel } from '@/core/jalali/jalali';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deleteInvoice } from './invoice.service';
import { filterInvoicesByMonth } from './store-calc';

/** فهرست فاکتورهای فروش */
export function InvoicesPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const invoices = useLiveQuery(
    () => db.invoices.orderBy('number').reverse().toArray(),
    [],
    [] as Invoice[],
  );
  const items = useLiveQuery(() => db.invoiceItems.toArray(), [], [] as InvoiceItem[]);
  const [deleting, setDeleting] = useState<Invoice | null>(null);

  const itemCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of items) map.set(item.invoiceId, (map.get(item.invoiceId) ?? 0) + 1);
    return map;
  }, [items]);

  const thisMonth = useMemo(
    () => filterInvoicesByMonth(invoices, currentJalaliMonthKey()),
    [invoices],
  );
  const monthTotal = thisMonth.reduce((s, i) => s + i.total, 0);

  return (
    <div>
      <PageHeader
        title="فاکتورهای فروش"
        subtitle="صدور، مشاهده، چاپ و خروجی PDF فاکتورها"
        actions={
          <Button asChild variant="neon">
            <Link to="/store/invoices/new">
              <Plus aria-hidden />
              فاکتور جدید
            </Link>
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          title={`فروش ${jalaliMonthLabel(currentJalaliMonthKey())}`}
          value={formatMoney(monthTotal, unit)}
          icon={Receipt}
          tone="neon"
        />
        <StatCard
          title="فاکتورهای این ماه"
          value={`${formatNumber(thisMonth.length)} فاکتور`}
          icon={Receipt}
          tone="navy"
        />
        <StatCard
          title="کل فاکتورها"
          value={`${formatNumber(invoices.length)} فاکتور`}
          icon={Receipt}
          tone="navy"
        />
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="هنوز فاکتوری صادر نشده است"
          description="با صدور اولین فاکتور، موجودی کالاها به‌صورت خودکار به‌روز و گزارش فروش ساخته می‌شود."
          action={
            <Button asChild variant="neon">
              <Link to="/store/invoices/new">
                <Plus aria-hidden />
                صدور اولین فاکتور
              </Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>مشتری</TableHead>
                <TableHead>اقلام</TableHead>
                <TableHead>مبلغ کل</TableHead>
                <TableHead className="w-28">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-bold">{toFaDigits(String(invoice.number))}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatJalaliNumeric(new Date(invoice.date))}
                  </TableCell>
                  <TableCell>
                    {invoice.customerName ?? 'مشتری نقدی'}
                    {invoice.isCredit && (
                      <span className="ms-2 inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning-foreground ring-1 ring-warning/40">
                        نسیه
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{formatNumber(itemCounts.get(invoice.id!) ?? 0)} قلم</TableCell>
                  <TableCell className="font-bold">{formatMoney(invoice.total, unit)}</TableCell>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`حذف فاکتور ${invoice.number}`}
                        onClick={() => setDeleting(invoice)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`حذف فاکتور شماره ${deleting ? toFaDigits(String(deleting.number)) : ''}`}
        description="فاکتور حذف و موجودی کالاهای آن به انبار برمی‌گردد. ادامه می‌دهید؟"
        confirmLabel="حذف فاکتور"
        destructive
        onConfirm={async () => {
          if (deleting?.id != null) {
            await deleteInvoice(deleting.id);
            toast.success('فاکتور حذف و موجودی اصلاح شد.');
          }
        }}
      />
    </div>
  );
}
