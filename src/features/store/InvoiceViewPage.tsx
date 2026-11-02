import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  FileDown,
  Plus,
  Printer,
  Receipt,
  Undo2,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { db, type CustomerPayment, type Invoice, type InvoiceItem } from '@/core/db/db';
import { toFaDigits } from '@/core/currency/currency';
import { formatJalaliLong } from '@/core/jalali/jalali';
import { downloadInvoicePdf } from './invoice-pdf';
import { useLicenseStore } from '@/store/license-store';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { FeatureGate } from '@/components/FeatureGate';
import { Button } from '@/components/ui/button';
import { VoidInvoiceDialog } from './VoidInvoiceDialog';
import { InvoicePrintDocument } from './InvoicePrintDocument';
import { InvoicePaymentDialog, InvoicePaymentHistory } from './InvoicePaymentDialog';
import { invoicePaymentState } from './invoice-domain';

/** مشاهده و چاپ فاکتور — ناحیه‌ی چاپ با شناسه‌ی print-area */
export function InvoiceViewPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const invoiceId = Number(id);
  const unit = useSettingsStore((s) => s.currencyUnit);
  const shopName = useSettingsStore((s) => s.shopName);
  const shopPhone = useSettingsStore((s) => s.shopPhone);
  const shopAddress = useSettingsStore((s) => s.shopAddress);
  const shopEconomicCode = useSettingsStore((s) => s.shopEconomicCode);
  const shopRegistrationNumber = useSettingsStore((s) => s.shopRegistrationNumber);
  const invoiceFooterNote = useSettingsStore((s) => s.invoiceFooterNote);
  const invoiceShowLogo = useSettingsStore((s) => s.invoiceShowLogo);
  const can = useLicenseStore((s) => s.can);
  // useLiveQuery هنگام بارگذاری هم undefined برمی‌گرداند؛ تا مهلت کوتاه تمام نشود «پیدا نشد» نشان نمی‌دهیم
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    setLoadTimedOut(false);
    const timer = window.setTimeout(() => setLoadTimedOut(true), 600);
    return () => window.clearTimeout(timer);
  }, [invoiceId]);
  const [deleting, setDeleting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // ورود با ?print=1 از فهرست فاکتورها: پس از آماده‌شدن سند، پنجره‌ی چاپ باز می‌شود
  useEffect(() => {
    if (searchParams.get('print') !== '1') return;
    const timer = window.setTimeout(() => window.print(), 700);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  const invoice = useLiveQuery(
    () => (Number.isFinite(invoiceId) ? db.invoices.get(invoiceId) : undefined),
    [invoiceId],
  ) as Invoice | undefined;
  const items = useLiveQuery(
    () => db.invoiceItems.where('invoiceId').equals(invoiceId).toArray(),
    [invoiceId],
    [] as InvoiceItem[],
  );
  const customer = useLiveQuery(
    async () => {
      const current = await db.invoices.get(invoiceId);
      return current?.customerId != null
        ? ((await db.customers.get(current.customerId)) ?? null)
        : null;
    },
    [invoiceId],
    null,
  );
  const payments = useLiveQuery(
    () => db.customerPayments.where('invoiceId').equals(invoiceId).toArray(),
    [invoiceId],
    [] as CustomerPayment[],
  );

  if (invoice === undefined && !loadTimedOut) {
    return (
      <div className="space-y-4" role="status" aria-label="در حال بارگذاری فاکتور">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="mx-auto h-96 max-w-3xl animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (invoice === undefined) {
    return (
      <EmptyState
        icon={Receipt}
        title="فاکتور پیدا نشد"
        description="ممکن است این فاکتور حذف شده باشد."
        action={
          <Button asChild>
            <Link to="/store/invoices">بازگشت به فهرست فاکتورها</Link>
          </Button>
        }
      />
    );
  }

  const downloadPdf = async () => {
    if (!invoice) return;
    setPdfLoading(true);
    try {
      const fileName = await downloadInvoicePdf({
        invoice,
        items: items ?? [],
        customer: invoice.customerId != null ? (customer ?? null) : null,
        payments,
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
      toast.error(
        error instanceof Error ? error.message : 'ساخت PDF با خطا مواجه شد؛ از چاپ استفاده کنید.',
      );
    } finally {
      setPdfLoading(false);
    }
  };

  const printInvoice = () => {
    document.body.dataset.printMode = 'invoice';
    window.print();
    window.setTimeout(() => delete document.body.dataset.printMode, 0);
  };

  return (
    <div>
      <PageHeader
        title={`فاکتور شماره ${toFaDigits(String(invoice.number))}`}
        subtitle={formatJalaliLong(new Date(invoice.date))}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/store/invoices')}>
              <ArrowRight aria-hidden />
              بازگشت
            </Button>
            <Button asChild variant="outline">
              <Link to="/store/pos">
                <ShoppingCart aria-hidden />
                صندوق فروش
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/store/invoices/new">
                <Plus aria-hidden />
                فاکتور جدید
              </Link>
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
              invoicePaymentState(invoice, payments).remaining > 0 && (
                <Button variant="outline" onClick={() => setPaying(true)}>
                  <Wallet aria-hidden />
                  ثبت پرداخت
                </Button>
              )}
            {invoice.status !== 'voided' && (
              <Button variant="destructive" onClick={() => setDeleting(true)}>
                <Undo2 aria-hidden />
                ابطال فروش
              </Button>
            )}
          </>
        }
      />

      {!can('pdf-export') && <FeatureGate feature="pdf-export" compact className="mb-4 no-print" />}

      <InvoicePrintDocument
        invoice={invoice}
        items={items ?? []}
        customer={customer}
        payments={payments}
        settings={{
          shopName,
          shopPhone,
          shopAddress,
          shopEconomicCode,
          shopRegistrationNumber,
          invoiceFooterNote,
          invoiceShowLogo,
          currencyUnit: unit,
        }}
        className="rounded-2xl border"
      />

      <InvoicePaymentHistory invoice={invoice} />
      <InvoicePaymentDialog
        invoice={paying ? invoice : null}
        onOpenChange={(open) => !open && setPaying(false)}
      />
      <VoidInvoiceDialog invoice={deleting ? invoice : null} onOpenChange={setDeleting} />
    </div>
  );
}
