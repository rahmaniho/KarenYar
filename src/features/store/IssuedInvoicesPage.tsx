import { useEffect, useMemo, useState } from 'react';
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
  LayoutDashboard,
  Plus,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  Undo2,
  Wallet,
  X,
} from 'lucide-react';
import { db, type CustomerPayment, type Invoice } from '@/core/db/db';
import { formatMoney, formatNumber, toFaDigits } from '@/core/currency/currency';
import { currentJalaliMonthKey, formatJalaliNumeric, jalaliMonthLabel } from '@/core/jalali/jalali';
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
import { InvoicePaymentDialog } from './InvoicePaymentDialog';
import {
  invoiceCsvRows,
  invoiceMonthOptions,
  paginateInvoices,
  queryInvoices,
  summarizeInvoices,
  type InvoiceSortKey,
  type InvoiceStatusFilter,
} from './invoice-search';
import { LIFECYCLE_LABELS } from './invoice-domain';
import { VoidInvoiceDialog } from './VoidInvoiceDialog';
import { useUrlState } from './use-url-state';

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
  paid: 'تسویه‌شده',
  partial: 'پرداخت جزئی',
  unpaid: 'پرداخت‌نشده',
  overdue: 'سررسید گذشته',
  credit: 'فروش نسیه',
  cash: 'نقدی (بدون نسیه)',
  completed: 'فقط معتبر',
  voided: 'باطل‌شده',
};

const PAGE_SIZES = [10, 25, 50, 100] as const;

const FILTER_DEFAULTS = {
  q: '',
  status: 'all',
  method: 'all',
  month: 'all',
  sort: 'date-desc',
  page: '1',
  size: '25',
};

/**
 * «فاکتورهای صادرشده» — فهرست حرفه‌ای با جستجوی چندفیلدی، وضعیت پرداخت،
 * صفحه‌بندی واقعی، خروجی PDF (factor-<شماره>.pdf)، چاپ، CSV و ثبت پرداخت.
 * فیلترها در آدرس صفحه ذخیره می‌شوند و با بازگشت از صفحه‌ی فاکتور حفظ می‌مانند.
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
  const payments = useLiveQuery(() => db.customerPayments.toArray(), [], [] as CustomerPayment[]);

  const { values, update } = useUrlState(FILTER_DEFAULTS);
  const [showFilters, setShowFilters] = useState(
    values.status !== 'all' || values.method !== 'all' || values.month !== 'all',
  );
  const [minTotal, setMinTotal] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const months = useMemo(() => invoiceMonthOptions(invoices), [invoices]);
  const rows = useMemo(
    () =>
      queryInvoices(invoices, items, {
        search: values.q,
        status: values.status as InvoiceStatusFilter,
        method: values.method,
        month: values.month === 'all' ? undefined : values.month,
        minTotal: minTotal ? Number(minTotal.replace(/\D/g, '')) : undefined,
        maxTotal: maxTotal ? Number(maxTotal.replace(/\D/g, '')) : undefined,
        sort: values.sort as InvoiceSortKey,
        payments,
      }),
    [invoices, items, values, minTotal, maxTotal, payments],
  );
  const summary = useMemo(() => summarizeInvoices(rows), [rows]);
  const page = useMemo(
    () => paginateInvoices(rows, Number(values.page) || 1, Number(values.size) || 25),
    [rows, values.page, values.size],
  );

  // صفحه‌ی خارج از محدوده (مثلاً بعد از تغییر فیلتر) به آخرین صفحه برمی‌گردد
  useEffect(() => {
    if (page.page !== Number(values.page)) update({ page: String(page.page) });
  }, [page.page, values.page, update]);

  const customerById = useMemo(() => {
    const map = new Map<number, (typeof customers)[number]>();
    for (const customer of customers) if (customer.id != null) map.set(customer.id, customer);
    return map;
  }, [customers]);

  const activeFilters = [
    values.q && 'جستجو',
    values.status !== 'all' && 'وضعیت',
    values.method !== 'all' && 'روش پرداخت',
    values.month !== 'all' && 'ماه',
    (minTotal || maxTotal) && 'بازه مبلغ',
  ].filter(Boolean).length;

  const resetFilters = () => {
    update({ q: '', status: 'all', method: 'all', month: 'all', sort: 'date-desc', page: '1' });
    setMinTotal('');
    setMaxTotal('');
  };

  const buildPdf = async (
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
        payments: payments.filter((payment) => payment.invoiceId === invoice.id),
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
      await buildPdf(row.invoice, row.items);
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

  const allOnPageSelected =
    page.rows.length > 0 &&
    page.rows.every((row) => row.invoice.id != null && selected.has(row.invoice.id));

  return (
    <div>
      <PageHeader
        title="فاکتورهای صادرشده"
        subtitle="جستجو، وضعیت پرداخت، چاپ و خروجی PDF هر فاکتور با نام factor-شماره"
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/store/invoices/dashboard">
                <LayoutDashboard aria-hidden />
                داشبورد فاکتور
              </Link>
            </Button>
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
            <Button asChild variant="neon">
              <Link to="/store/invoices/new">
                <Plus aria-hidden />
                فاکتور جدید
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
          title="وصول‌شده"
          value={formatMoney(summary.paidTotal, unit)}
          hint={`از ${formatMoney(summary.activeTotal, unit)} مبلغ صادرشده`}
          icon={Wallet}
          tone="success"
        />
        <StatCard
          title="مانده‌ی وصول‌نشده"
          value={formatMoney(summary.remainingTotal, unit)}
          hint={`${formatNumber(summary.creditCount)} فاکتور نسیه`}
          icon={Undo2}
          tone="warning"
        />
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              className="ps-9"
              value={values.q}
              onChange={(event) => update({ q: event.target.value, page: '1' })}
              placeholder="شماره فاکتور، نام مشتری، کالا، یادداشت یا مبلغ…"
              aria-label="جستجوی فاکتور"
            />
            {values.q && (
              <button
                type="button"
                onClick={() => update({ q: '', page: '1' })}
                aria-label="پاک کردن جستجو"
                className="absolute end-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={values.sort} onValueChange={(value) => update({ sort: value, page: '1' })}>
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
          <Select
            value={values.status}
            onValueChange={(value) => update({ status: value, page: '1' })}
          >
            <SelectTrigger className="w-40" aria-label="وضعیت فاکتور">
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
              <Label>روش پرداخت</Label>
              <Select
                value={values.method}
                onValueChange={(value) => update({ method: value, page: '1' })}
              >
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
              <Select
                value={values.month}
                onValueChange={(value) => update({ month: value, page: '1' })}
              >
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
                  {!months.includes(currentJalaliMonthKey()) && (
                    <SelectItem value={currentJalaliMonthKey()}>
                      {jalaliMonthLabel(currentJalaliMonthKey())}
                    </SelectItem>
                  )}
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
                  onChange={(event) => {
                    setMinTotal(event.target.value);
                    update({ page: '1' });
                  }}
                  placeholder="از"
                  aria-label="حداقل مبلغ"
                />
                <span className="text-muted-foreground">—</span>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={maxTotal}
                  onChange={(event) => {
                    setMaxTotal(event.target.value);
                    update({ page: '1' });
                  }}
                  placeholder="تا"
                  aria-label="حداکثر مبلغ"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>تعداد در صفحه</Label>
              <Select
                value={values.size}
                onValueChange={(value) => update({ size: value, page: '1' })}
              >
                <SelectTrigger aria-label="تعداد ردیف در صفحه">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {toFaDigits(size)} ردیف
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        <>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="انتخاب همهٔ فاکتورهای این صفحه"
                      checked={allOnPageSelected}
                      onChange={(event) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          for (const row of page.rows) {
                            const id = row.invoice.id;
                            if (id == null) continue;
                            if (event.target.checked) next.add(id);
                            else next.delete(id);
                          }
                          return next;
                        });
                      }}
                    />
                  </TableHead>
                  <TableHead>شماره / تاریخ</TableHead>
                  <TableHead className="hidden lg:table-cell">مشتری</TableHead>
                  <TableHead className="hidden sm:table-cell">مبلغ کل</TableHead>
                  <TableHead>مانده</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="text-end">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.rows.map(({ invoice, lifecycle, paid, remaining }) => {
                  const isVoided = invoice.status === 'voided';
                  const id = invoice.id ?? 0;
                  const tone =
                    lifecycle === 'voided'
                      ? 'destructive'
                      : lifecycle === 'paid'
                        ? 'success'
                        : lifecycle === 'overdue'
                          ? 'destructive'
                          : lifecycle === 'partial'
                            ? 'warning'
                            : 'secondary';
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
                      <TableCell className="hidden lg:table-cell">
                        <p className="max-w-40 truncate">{invoice.customerName ?? 'مشتری گذری'}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {PAYMENT_LABELS[invoicePaymentMethod(invoice)]}
                        </p>
                      </TableCell>
                      <TableCell
                        className={`hidden whitespace-nowrap font-bold sm:table-cell ${isVoided ? 'line-through' : ''}`}
                      >
                        {formatMoney(invoice.total, unit)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {isVoided ? (
                          <span className="text-muted-foreground">—</span>
                        ) : remaining > 0 ? (
                          <span className="font-bold text-destructive">
                            {formatMoney(remaining, unit)}
                          </span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">تسویه</span>
                        )}
                        {paid > 0 && remaining > 0 && (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            پرداخت‌شده: {formatMoney(paid, unit)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tone}>{LIFECYCLE_LABELS[lifecycle]}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex justify-end gap-1">
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
                            className="hidden h-8 w-8 sm:inline-flex"
                            aria-label={`چاپ فاکتور ${invoice.number}`}
                            onClick={() => navigate(`/store/invoices/${id}?print=1`)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary"
                            aria-label={`دریافت PDF فاکتور ${invoice.number}`}
                            disabled={busyId === id}
                            onClick={() => void buildPdf(invoice)}
                          >
                            <FileDown className="h-4 w-4" />
                          </Button>
                          {!isVoided && invoice.isCredit && remaining > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-700 dark:text-emerald-400"
                              aria-label={`ثبت پرداخت فاکتور ${invoice.number}`}
                              onClick={() => setPaying(invoice)}
                            >
                              <Wallet className="h-4 w-4" />
                            </Button>
                          )}
                          {!isVoided && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              aria-label={`ابطال فاکتور ${invoice.number}`}
                              onClick={() => setVoiding(invoice)}
                            >
                              <Trash2 className="h-4 w-4" />
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

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              نمایش {toFaDigits(page.from)} تا {toFaDigits(page.to)} از {toFaDigits(page.total)}{' '}
              فاکتور
              {selected.size > 0 && ` — ${toFaDigits(selected.size)} انتخاب‌شده`}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page.page <= 1}
                onClick={() => update({ page: String(page.page - 1) })}
              >
                قبلی
              </Button>
              {Array.from({ length: page.pageCount }, (_, index) => index + 1)
                .filter(
                  (number) =>
                    page.pageCount <= 7 ||
                    Math.abs(number - page.page) <= 2 ||
                    number === 1 ||
                    number === page.pageCount,
                )
                .map((number, index, list) => (
                  <span key={number} className="flex items-center gap-1">
                    {index > 0 && number - list[index - 1] > 1 && (
                      <span className="px-1 text-muted-foreground">…</span>
                    )}
                    <Button
                      variant={number === page.page ? 'default' : 'outline'}
                      size="sm"
                      className="min-w-9"
                      onClick={() => update({ page: String(number) })}
                      aria-current={number === page.page ? 'page' : undefined}
                    >
                      {toFaDigits(number)}
                    </Button>
                  </span>
                ))}
              <Button
                variant="outline"
                size="sm"
                disabled={page.page >= page.pageCount}
                onClick={() => update({ page: String(page.page + 1) })}
              >
                بعدی
              </Button>
            </div>
          </div>
        </>
      )}

      <VoidInvoiceDialog
        invoice={voiding}
        onOpenChange={(open) => !open && setVoiding(null)}
        onVoided={() => setVoiding(null)}
      />
      <InvoicePaymentDialog
        invoice={paying}
        onOpenChange={(open) => !open && setPaying(null)}
        onPaid={() => setPaying(null)}
      />
    </div>
  );
}
