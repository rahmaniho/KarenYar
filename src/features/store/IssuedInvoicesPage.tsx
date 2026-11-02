import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import {
  ArrowDownUp,
  CalendarDays,
  Download,
  Eye,
  FileDown,
  FileText,
  Filter,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { db, type Invoice } from '@/core/db/db';
import { formatMoney, formatNumber, toFaDigits } from '@/core/currency/currency';
import { formatJalaliFull, formatJalaliNumeric, jalaliMonthLabel } from '@/core/jalali/jalali';
import { downloadCsv } from '@/core/utils/csv';
import { useSettingsStore } from '@/store/settings-store';
import { useLicenseStore } from '@/store/license-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/components/StatCard';
import { FeatureGate } from '@/components/FeatureGate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { downloadInvoicePdf } from './invoice-pdf';
import { invoicePaymentMethod, PAYMENT_LABELS } from './payment';
import {
  invoiceCsvRows,
  invoiceMonthOptions,
  queryInvoices,
  summarizeInvoices,
  type InvoiceSortKey,
  type InvoiceStatusFilter,
} from './invoice-search';
import { VoidInvoiceDialog } from './VoidInvoiceDialog';

const SORT_LABELS: Record<InvoiceSortKey, string> = {
  'date-desc': 'جدیدترین تاریخ',
  'date-asc': 'قدیمی‌ترین تاریخ',
  'number-desc': 'بیشترین شماره',
  'number-asc': 'کمترین شماره',
  'total-desc': 'بیشترین مبلغ',
  'total-asc': 'کمترین مبلغ',
};

const STATUS_LABELS: Record<InvoiceStatusFilter, string> = {
  all: 'همهٔ وضعیت‌ها',
  completed: 'فقط معتبر',
  voided: 'فقط باطل‌شده',
  credit: 'فروش نسیه',
  cash: 'تسویه‌شده',
};

/**
 * «فاکتورهای صادرشده» — فهرست تخصصی با جستجوی چندفیلدی،
 * خروجی PDF (factor-<شماره>.pdf)، چاپ و CSV.
 */
export function IssuedInvoicesPage() {
  const navigate = useNavigate();
  const unit = useSettingsStore((s) => s.currencyUnit);
  const shopName = useSettingsStore((s) => s.shopName);
  const shopPhone = useSettingsStore((s) => s.shopPhone);
  const shopAddress = useSettingsStore((s) => s.shopAddress);
  const shopEconomicCode = useSettingsStore((s) => s.shopEconomicCode);
  const shopRegistrationNumber = useSettingsStore((s) => s.shopRegistrationNumber);
  const invoiceFooterNote = useSettingsStore((s) => s.invoiceFooterNote);
  const invoiceShowLogo = useSettingsStore((s) => s.invoiceShowLogo);
  const can = useLicenseStore((s) => s.can);

  const invoices = useLiveQuery(() => db.invoices.orderBy('number').reverse().toArray(), [], []);
  const items = useLiveQuery(() => db.invoiceItems.toArray(), [], []);
  const customers = useLiveQuery(() => db.customers.toArray(), [], []);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatusFilter>('all');
  const [method, setMethod] = useState('all');
  const [month, setMonth] = useState('all');
  const [sort, setSort] = useState<InvoiceSortKey>('date-desc');
  const [minTotal, setMinTotal] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const months = useMemo(() => invoiceMonthOptions(invoices), [invoices]);
  const rows = useMemo(
    () =>
      queryInvoices(invoices, items, {
        search,
        status,
        method,
        month: month === 'all' ? undefined : month,
        minTotal: minTotal ? Number(minTotal.replace(/\D/g, '')) : undefined,
        maxTotal: maxTotal ? Number(maxTotal.replace(/\D/g, '')) : undefined,
        sort,
      }),
    [invoices, items, search, status, method, month, minTotal, maxTotal, sort],
  );
  const summary = useMemo(() => summarizeInvoices(rows), [rows]);
  const customerById = useMemo(() => {
    const map = new Map<number, (typeof customers)[number]>();
    for (const customer of customers) if (customer.id != null) map.set(customer.id, customer);
    return map;
  }, [customers]);

  const activeFilters = [
    search && 'جستجو',
    status !== 'all' && 'وضعیت',
    method !== 'all' && 'روش پرداخت',
    month !== 'all' && 'ماه',
    (minTotal || maxTotal) && 'بازه مبلغ',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearch('');
    setStatus('all');
    setMethod('all');
    setMonth('all');
    setSort('date-desc');
    setMinTotal('');
    setMaxTotal('');
  };

  const exportPdf = async (
    invoice: Invoice,
    invoiceItems = items.filter((i) => i.invoiceId === invoice.id),
  ) => {
    if (!can('pdf-export')) {
      toast.error('خروجی PDF در نسخه‌ی رایگان فعال نیست.');
      return;
    }
    setBusyId(invoice.id ?? null);
    try {
      const fileName = await downloadInvoicePdf({
        invoice,
        items: invoiceItems,
        customer: invoice.customerId != null ? customerById.get(invoice.customerId) : null,
        settings: {
          shopName,
          shopPhone,
          shopAddress,
          shopEconomicCode,
          shopRegistrationNumber,
          invoiceFooterNote,
          invoiceShowLogo,
          currencyUnit: unit,
        },
      });
      toast.success(`فایل ${fileName} ساخته شد.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ساخت PDF ناموفق بود.');
    } finally {
      setBusyId(null);
    }
  };

  const exportSelected = async () => {
    const targets = rows.filter((row) => row.invoice.id != null && selected.has(row.invoice.id));
    if (!targets.length) {
      toast.error('ابتدا حداقل یک فاکتور را انتخاب کنید.');
      return;
    }
    for (const row of targets) {
      // پشت‌سرهم تا پنجره‌ی ذخیره‌ی مرورگر برای هر فایل جداگانه باز شود
      await exportPdf(row.invoice, row.items);
    }
  };

  const exportCsvFile = async () => {
    try {
      await downloadCsv(
        `invoices-${new Date().toISOString().slice(0, 10)}.csv`,
        invoiceCsvRows(rows),
      );
      toast.success('فهرست فاکتورها به CSV ذخیره شد.');
    } catch {
      toast.error('ذخیره‌ی CSV ناموفق بود.');
    }
  };

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <PageHeader
        title="فاکتورهای صادرشده"
        subtitle="جستجو، مشاهده، چاپ و خروجی PDF هر فاکتور با نام factor-شماره"
        actions={
          <>
            <Button variant="outline" onClick={() => void exportCsvFile()} disabled={!rows.length}>
              <Download aria-hidden />
              CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => void exportSelected()}
              disabled={!selected.size}
            >
              <FileDown aria-hidden />
              PDF انتخاب‌شده‌ها ({formatNumber(selected.size)})
            </Button>
            <Button asChild variant="outline">
              <Link to="/store/invoices/new">
                <Plus aria-hidden />
                فاکتور جدید
              </Link>
            </Button>
            <Button asChild variant="neon">
              <Link to="/store/pos">
                <ShoppingCart aria-hidden />
                صندوق فروش
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="فاکتورهای یافت‌شده"
          value={`${formatNumber(summary.count)} فاکتور`}
          hint={`${formatNumber(summary.activeCount)} معتبر · ${formatNumber(summary.voidedCount)} باطل`}
          icon={Receipt}
          tone="navy"
        />
        <StatCard
          title="جمع مبلغ معتبر"
          value={formatMoney(summary.activeTotal, unit)}
          hint={`میانگین هر فاکتور: ${formatMoney(summary.average, unit)}`}
          icon={FileText}
          tone="neon"
        />
        <StatCard
          title="فروش نسیه"
          value={formatMoney(summary.creditTotal, unit)}
          hint="مانده‌ی حساب مشتریان در بخش مشتریان قابل پیگیری است"
          icon={Undo2}
          tone="warning"
        />
        <StatCard
          title="مبلغ فاکتورهای باطل"
          value={formatMoney(summary.voidedTotal, unit)}
          hint="سند باطل‌شده در سوابق می‌ماند و در درآمد حساب نمی‌شود"
          icon={Trash2}
          tone="danger"
        />
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              className="ps-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="شماره فاکتور، نام مشتری، کالا، یادداشت یا مبلغ…"
              aria-label="جستجوی فاکتور"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="پاک کردن جستجو"
                className="absolute end-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={sort} onValueChange={(value) => setSort(value as InvoiceSortKey)}>
            <SelectTrigger className="w-44" aria-label="ترتیب نمایش">
              <ArrowDownUp className="h-4 w-4" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
          >
            <Filter aria-hidden />
            فیلترها
            {activeFilters > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                {toFaDigits(activeFilters)}
              </span>
            )}
          </Button>
          {activeFilters > 0 && (
            <Button variant="ghost" onClick={resetFilters}>
              <X aria-hidden />
              پاک کردن
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>وضعیت</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as InvoiceStatusFilter)}
              >
                <SelectTrigger aria-label="وضعیت فاکتور">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>روش پرداخت</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger aria-label="روش پرداخت">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ پرداخت‌ها</SelectItem>
                  {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ماه صدور</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger aria-label="ماه صدور">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ ماه‌ها</SelectItem>
                  {months.map((value) => (
                    <SelectItem key={value} value={value}>
                      {jalaliMonthLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>بازه مبلغ (تومان)</Label>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={minTotal}
                  onChange={(event) => setMinTotal(event.target.value)}
                  placeholder="از"
                  aria-label="حداقل مبلغ"
                />
                <span className="text-muted-foreground">—</span>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={maxTotal}
                  onChange={(event) => setMaxTotal(event.target.value)}
                  placeholder="تا"
                  aria-label="حداکثر مبلغ"
                />
              </div>
            </div>
          </div>
        )}
      </Card>

      {!can('pdf-export') && <FeatureGate feature="pdf-export" compact className="mb-4" />}

      {!invoices.length ? (
        <EmptyState
          icon={Receipt}
          title="هنوز فاکتوری صادر نشده است"
          description="اولین فروش را از صندوق ثبت کنید تا فاکتور با شماره‌ی خودکار صادر و اینجا فهرست شود."
          action={
            <Button asChild variant="neon">
              <Link to="/store/pos">
                <ShoppingCart aria-hidden />
                شروع فروش
              </Link>
            </Button>
          }
        />
      ) : !rows.length ? (
        <EmptyState
          icon={Search}
          title="فاکتوری با این فیلتر پیدا نشد"
          description="عبارت جستجو یا فیلترها را تغییر دهید."
          action={
            <Button variant="outline" onClick={resetFilters}>
              <X aria-hidden />
              پاک کردن فیلترها
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="انتخاب همهٔ فاکتورهای نمایش‌داده‌شده"
                    checked={
                      rows.length > 0 &&
                      rows.every((row) => row.invoice.id != null && selected.has(row.invoice.id))
                    }
                    onChange={(event) => {
                      setSelected(
                        event.target.checked
                          ? new Set(
                              rows
                                .map((row) => row.invoice.id)
                                .filter((id): id is number => id != null),
                            )
                          : new Set(),
                      );
                    }}
                  />
                </TableHead>
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
              {rows.map(({ invoice, itemCount }) => {
                const isVoided = invoice.status === 'voided';
                const id = invoice.id ?? 0;
                return (
                  <TableRow
                    key={id}
                    className={isVoided ? 'bg-muted/30 text-muted-foreground' : ''}
                    data-state={selected.has(id) ? 'selected' : undefined}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`انتخاب فاکتور ${invoice.number}`}
                        checked={selected.has(id)}
                        onChange={() => toggleSelected(id)}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-bold">#{toFaDigits(invoice.number)}</p>
                      <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
                        {formatJalaliNumeric(new Date(invoice.date))}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p>{invoice.customerName ?? 'مشتری گذری'}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {invoice.source === 'pos' ? 'ثبت از صندوق' : 'صدور دستی'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={invoice.isCredit ? 'warning' : 'secondary'}>
                        {PAYMENT_LABELS[invoicePaymentMethod(invoice)]}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatNumber(itemCount)} قلم</TableCell>
                    <TableCell
                      className={`whitespace-nowrap font-bold ${isVoided ? 'line-through' : ''}`}
                    >
                      {formatMoney(invoice.total, unit)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          isVoided ? 'destructive' : invoice.isCredit ? 'warning' : 'success'
                        }
                      >
                        {isVoided ? 'باطل‌شده' : invoice.isCredit ? 'نسیه' : 'تسویه‌شده'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex gap-1">
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                          <Link
                            to={`/store/invoices/${id}`}
                            aria-label={`مشاهده فاکتور ${invoice.number}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`چاپ فاکتور ${invoice.number}`}
                          onClick={() => navigate(`/store/invoices/${id}?print=1`)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary"
                          aria-label={`دریافت PDF فاکتور ${invoice.number}`}
                          disabled={busyId === id}
                          onClick={() => void exportPdf(invoice)}
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                        {!isVoided && (
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
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {rows.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          آخرین به‌روزرسانی فهرست: {formatJalaliFull(new Date())} — خروجی PDF هر فاکتور با نام
          <span dir="ltr" className="mx-1 font-mono">
            factor-{toFaDigits('شماره')}.pdf
          </span>
          ذخیره می‌شود.
        </p>
      )}

      <VoidInvoiceDialog
        invoice={voiding}
        onOpenChange={(open) => !open && setVoiding(null)}
        onVoided={() => setVoiding(null)}
      />
    </div>
  );
}
