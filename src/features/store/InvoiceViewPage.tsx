import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  Copy,
  FileDown,
  History,
  Pencil,
  Printer,
  Receipt,
  Trash2,
  Undo2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  db,
  type Customer,
  type CustomerPayment,
  type FinancialEvent,
  type Invoice,
  type InvoiceItem,
} from '@/core/db/db';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { formatJalaliLong, formatJalaliNumeric } from '@/core/jalali/jalali';
import { useLicenseStore } from '@/store/license-store';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { FeatureGate } from '@/components/FeatureGate';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { copyInvoiceToDraft, discardInvoiceDraft } from './invoice.service';
import { invoicePaymentState, LIFECYCLE_LABELS, invoiceLifecycle } from './invoice-domain';
import { VoidInvoiceDialog } from './VoidInvoiceDialog';
import { InvoicePrintDocument } from './InvoicePrintDocument';
import { InvoicePaymentDialog, InvoicePaymentHistory } from './InvoicePaymentDialog';

const EVENT_LABELS = {
  draft_saved: 'ذخیره پیش‌نویس',
  issued: 'صدور فاکتور',
  voided: 'ابطال فاکتور',
  payment_recorded: 'ثبت دریافت',
  refund_recorded: 'برگشت وجه',
  payment_reversed: 'اصلاح دریافت',
  draft_discarded: 'حذف پیش‌نویس',
  customer_payment_received: 'دریافت از مشتری',
} as const;

export function InvoiceViewPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const invoiceId = Number(id);
  const validId = Number.isSafeInteger(invoiceId) && invoiceId > 0;
  const unit = useSettingsStore((s) => s.currencyUnit);
  const settings = useSettingsStore();
  const can = useLicenseStore((s) => s.can);
  const [voiding, setVoiding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const printed = useRef(false);
  const invoice = useLiveQuery(
    () => (validId ? db.invoices.get(invoiceId).then((row) => row ?? null) : Promise.resolve(null)),
    [invoiceId],
    undefined,
  ) as Invoice | null | undefined;
  const items = useLiveQuery(
    () =>
      validId
        ? db.invoiceItems.where('invoiceId').equals(invoiceId).toArray()
        : Promise.resolve([] as InvoiceItem[]),
    [invoiceId],
    undefined as InvoiceItem[] | undefined,
  );
  const customer = useLiveQuery(
    () =>
      invoice?.customerId != null
        ? db.customers.get(invoice.customerId).then((row) => row ?? null)
        : Promise.resolve(null),
    [invoice?.customerId],
    null,
  ) as Customer | null | undefined;
  const payments = useLiveQuery(
    () =>
      validId
        ? db.customerPayments.where('invoiceId').equals(invoiceId).toArray()
        : Promise.resolve([] as CustomerPayment[]),
    [invoiceId],
    [] as CustomerPayment[],
  );
  const events = useLiveQuery(
    () =>
      validId
        ? db.financialEvents
            .where('invoiceId')
            .equals(invoiceId)
            .sortBy('createdAt')
            .then((rows) => rows.reverse())
        : Promise.resolve([] as FinancialEvent[]),
    [invoiceId],
    [] as FinancialEvent[],
  );

  const printInvoice = () => {
    window.print();
  };
  useEffect(() => {
    if (
      searchParams.get('print') !== '1' ||
      !invoice ||
      items === undefined ||
      customer === undefined ||
      printed.current
    )
      return;
    printed.current = true;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) window.requestAnimationFrame(printInvoice);
    });
    return () => {
      cancelled = true;
    };
  }, [searchParams, invoice, items, customer]);

  if (invoice === undefined || items === undefined)
    return (
      <div className="space-y-4" role="status" aria-label="در حال بارگذاری فاکتور">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="mx-auto h-96 max-w-3xl animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  if (invoice === null)
    return (
      <EmptyState
        icon={Receipt}
        title="فاکتور پیدا نشد"
        description="شناسه سند معتبر نیست یا سند حذف شده است."
        action={
          <Button asChild>
            <Link to="/store/invoices/issued">بازگشت به فهرست فاکتورها</Link>
          </Button>
        }
      />
    );

  const printSettings = {
    shopName: settings.shopName,
    shopPhone: settings.shopPhone,
    shopAddress: settings.shopAddress,
    shopEconomicCode: settings.shopEconomicCode,
    shopRegistrationNumber: settings.shopRegistrationNumber,
    invoiceFooterNote: settings.invoiceFooterNote,
    invoiceShowLogo: settings.invoiceShowLogo,
    currencyUnit: unit,
  };
  const state = invoicePaymentState(invoice, payments);
  const lifecycle = invoiceLifecycle(invoice, payments);
  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const { downloadInvoicePdf } = await import('./invoice-pdf');
      const fileName = await downloadInvoicePdf({
        invoice,
        items,
        customer,
        payments,
        settings: printSettings,
      });
      toast.success(`فایل ${fileName} ساخته شد.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'ساخت PDF ناموفق بود؛ از چاپ استفاده کنید.',
      );
    } finally {
      setPdfLoading(false);
    }
  };
  const copy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const copyId = await copyInvoiceToDraft(invoice.id!);
      toast.success('کپی به‌صورت پیش‌نویس ساخته شد؛ آن را بررسی و صادر کنید.');
      navigate(`/store/invoices/${copyId}/edit`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'کپی فاکتور ناموفق بود.');
    } finally {
      setCopying(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`فاکتور شماره ${toFaDigits(invoice.number)}`}
        subtitle={formatJalaliLong(new Date(invoice.date))}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/store/invoices/issued')}>
              <ArrowRight aria-hidden />
              بازگشت
            </Button>
            {invoice.status === 'draft' && (
              <Button asChild variant="outline">
                <Link to={`/store/invoices/${invoice.id}/edit`}>
                  <Pencil aria-hidden />
                  ویرایش پیش‌نویس
                </Link>
              </Button>
            )}
            <Button variant="outline" disabled={copying} onClick={() => void copy()}>
              <Copy aria-hidden />
              {copying ? 'در حال کپی…' : 'کپی به پیش‌نویس'}
            </Button>
            <Button variant="outline" onClick={printInvoice}>
              <Printer aria-hidden />
              چاپ
            </Button>
            <Button
              variant="neon"
              onClick={() => void downloadPdf()}
              disabled={pdfLoading || !can('pdf-export')}
            >
              <FileDown aria-hidden />
              {pdfLoading ? 'در حال ساخت…' : 'دریافت PDF'}
            </Button>
            {invoice.isCredit &&
              invoice.status !== 'voided' &&
              invoice.status !== 'draft' &&
              state.remaining > 0 && (
                <Button variant="outline" onClick={() => setPaying(true)}>
                  <Wallet aria-hidden />
                  ثبت پرداخت
                </Button>
              )}
            {invoice.status === 'draft' ? (
              <Button variant="destructive" onClick={() => setDiscarding(true)}>
                <Trash2 aria-hidden />
                حذف پیش‌نویس
              </Button>
            ) : (
              invoice.status !== 'voided' && (
                <Button variant="destructive" onClick={() => setVoiding(true)}>
                  <Undo2 aria-hidden />
                  ابطال فروش
                </Button>
              )
            )}
          </>
        }
      />
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Badge
          variant={
            lifecycle === 'voided'
              ? 'destructive'
              : lifecycle === 'paid'
                ? 'success'
                : lifecycle === 'draft'
                  ? 'warning'
                  : 'secondary'
          }
        >
          {LIFECYCLE_LABELS[lifecycle]}
        </Badge>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/store/invoices/${invoice.id}#payment-history`}>
            <History aria-hidden />
            تاریخچه مالی
          </Link>
        </Button>
      </div>
      {!can('pdf-export') && <FeatureGate feature="pdf-export" compact className="mb-4 no-print" />}
      <InvoicePrintDocument
        invoice={invoice}
        items={items}
        customer={customer}
        payments={payments}
        settings={printSettings}
        className="rounded-2xl border"
      />
      {invoice.internalNote && (
        <div className="no-print mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <p className="mb-1 font-bold">یادداشت داخلی — در چاپ مشتری نمایش داده نمی‌شود</p>
          <p className="whitespace-pre-wrap leading-6">{invoice.internalNote}</p>
        </div>
      )}
      <InvoicePaymentHistory invoice={invoice} />
      {events.length > 0 && (
        <div className="no-print mt-4 rounded-2xl border bg-card p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold">
            <History className="h-4 w-4 text-primary" aria-hidden />
            رویدادهای این سند
          </p>
          <ol className="space-y-2 text-xs">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0"
              >
                <span>
                  <span className="font-semibold">{EVENT_LABELS[event.action]}</span>
                  {event.reason ? ` — ${event.reason}` : ''}
                  {event.amount != null ? ` · ${formatMoney(event.amount, unit)}` : ''}
                </span>
                <span className="text-muted-foreground">
                  {formatJalaliNumeric(new Date(event.createdAt))}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] text-muted-foreground">
            این تاریخچه محلی است و جایگزین لاگ ضدتغییر سروری یا کنترل دسترسی چندکاربره نیست.
          </p>
        </div>
      )}
      <InvoicePaymentDialog invoice={paying ? invoice : null} onOpenChange={setPaying} />
      <VoidInvoiceDialog invoice={voiding ? invoice : null} onOpenChange={setVoiding} />
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="حذف پیش‌نویس"
        description="این پیش‌نویس هیچ اثر مالی یا انباری ندارد؛ خود سند و اقلامش حذف می‌شوند و رویداد حذف باقی می‌ماند."
        confirmLabel="حذف پیش‌نویس"
        destructive
        onConfirm={async () => {
          await discardInvoiceDraft(invoice.id!, invoice.revision ?? 1);
          toast.success('پیش‌نویس حذف شد.');
          navigate('/store/invoices/issued');
        }}
      />
    </div>
  );
}
