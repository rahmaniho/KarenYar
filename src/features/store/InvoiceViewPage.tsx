import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '@/lib/utils';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, FileDown, Plus, Printer, Receipt, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, type Invoice, type InvoiceItem } from '@/core/db/db';
import { formatMoney, formatNumber, toFaDigits } from '@/core/currency/currency';
import { formatJalaliLong } from '@/core/jalali/jalali';
import { exportElementToPdf } from '@/core/utils/pdf';
import { useLicenseStore } from '@/store/license-store';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { FeatureGate } from '@/components/FeatureGate';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { deleteInvoice } from './invoice.service';

/** مشاهده و چاپ فاکتور — ناحیه‌ی چاپ با شناسه‌ی print-area */
export function InvoiceViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const invoiceId = Number(id);
  const unit = useSettingsStore((s) => s.currencyUnit);
  const shopName = useSettingsStore((s) => s.shopName);
  const shopPhone = useSettingsStore((s) => s.shopPhone);
  const shopAddress = useSettingsStore((s) => s.shopAddress);
  const can = useLicenseStore((s) => s.can);
  const printRef = useRef<HTMLDivElement>(null);
  // useLiveQuery هنگام بارگذاری هم undefined برمی‌گرداند؛ تا مهلت کوتاه تمام نشود «پیدا نشد» نشان نمی‌دهیم
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    setLoadTimedOut(false);
    const timer = window.setTimeout(() => setLoadTimedOut(true), 600);
    return () => window.clearTimeout(timer);
  }, [invoiceId]);
  const [deleting, setDeleting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const invoice = useLiveQuery(
    () => (Number.isFinite(invoiceId) ? db.invoices.get(invoiceId) : undefined),
    [invoiceId],
  ) as Invoice | undefined;
  const items = useLiveQuery(
    () => db.invoiceItems.where('invoiceId').equals(invoiceId).toArray(),
    [invoiceId],
    [] as InvoiceItem[],
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
    if (!printRef.current) return;
    setPdfLoading(true);
    try {
      await exportElementToPdf(printRef.current, `hesabyar-invoice-${invoice.number}.pdf`);
      toast.success('فایل PDF فاکتور ساخته شد.');
    } catch {
      toast.error('ساخت PDF با خطا مواجه شد؛ از چاپ استفاده کنید.');
    } finally {
      setPdfLoading(false);
    }
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
              <Link to="/store/invoices/new">
                <Plus aria-hidden />
                فاکتور جدید
              </Link>
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
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
            <Button variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden />
              حذف
            </Button>
          </>
        }
      />

      {!can('pdf-export') && <FeatureGate feature="pdf-export" compact className="mb-4 no-print" />}

      <div
        ref={printRef}
        className="print-area mx-auto max-w-3xl rounded-2xl border bg-white p-6 text-navy-900 shadow-card sm:p-8"
      >
        {/* سربرگ فاکتور */}
        <div className="flex items-start justify-between border-b-2 border-navy-900 pb-4">
          <div>
            <p className="text-xl font-extrabold">{shopName}</p>
            {shopPhone && <p className="mt-1 text-sm text-navy-600">تلفن: {shopPhone}</p>}
            {shopAddress && <p className="text-sm text-navy-600">{shopAddress}</p>}
          </div>
          <div className="text-left">
            <p className="text-sm text-navy-600">فاکتور فروش</p>
            <p className="text-2xl font-extrabold">#{toFaDigits(String(invoice.number))}</p>
            <p className="text-sm text-navy-600">{formatJalaliLong(new Date(invoice.date))}</p>
          </div>
        </div>

        <p className="mt-4 text-sm">
          خریدار: <b>{invoice.customerName ?? 'مشتری نقدی'}</b>
          {invoice.isCredit && (
            <span className="ms-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300">
              فروش نسیه
            </span>
          )}
        </p>

        <table className="mt-4 w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-navy-700">
              <th className="px-2 py-2 text-start font-semibold">ردیف</th>
              <th className="px-2 py-2 text-start font-semibold">شرح کالا</th>
              <th className="px-2 py-2 text-start font-semibold">تعداد</th>
              <th className="px-2 py-2 text-start font-semibold">قیمت واحد</th>
              <th className="px-2 py-2 text-start font-semibold">جمع</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-2 py-2">{toFaDigits(String(i + 1))}</td>
                <td className="px-2 py-2 font-medium">{item.name}</td>
                <td className="px-2 py-2">{formatNumber(item.qty)}</td>
                <td className="px-2 py-2">{formatMoney(item.unitPrice, unit)}</td>
                <td className="px-2 py-2 font-semibold">{formatMoney(item.total, unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-5 flex justify-end">
          <dl className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-navy-600">جمع اقلام</dt>
              <dd>{formatMoney(invoice.subtotal, unit)}</dd>
            </div>
            {invoice.discountAmount > 0 && (
              <div className="flex justify-between">
                <dt className="text-navy-600">تخفیف</dt>
                <dd>− {formatMoney(invoice.discountAmount, unit)}</dd>
              </div>
            )}
            {invoice.taxAmount > 0 && (
              <div className="flex justify-between">
                <dt className="text-navy-600">
                  مالیات بر ارزش افزوده ({toFaDigits(String(invoice.taxPercent))}٪)
                </dt>
                <dd>{formatMoney(invoice.taxAmount, unit)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-navy-900 pt-2 text-base font-extrabold">
              <dt>مبلغ قابل پرداخت</dt>
              <dd>{formatMoney(invoice.total, unit)}</dd>
            </div>
          </dl>
        </div>

        <p className="mt-8 flex items-center justify-center gap-1.5 border-t pt-4 text-center text-xs text-navy-500">
          از خرید شما سپاسگزاریم — صادرشده با حساب‌یار کارن سافت
          <img
            src={assetUrl('images/karensoft/mark.png')}
            alt=""
            width={256}
            height={256}
            className="h-4 w-4 object-contain"
          />
        </p>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`حذف فاکتور شماره ${toFaDigits(String(invoice.number))}`}
        description="فاکتور حذف و موجودی کالاهای آن به انبار برمی‌گردد. ادامه می‌دهید؟"
        confirmLabel="حذف فاکتور"
        destructive
        onConfirm={async () => {
          await deleteInvoice(invoice.id!);
          toast.success('فاکتور حذف شد.');
          navigate('/store/invoices');
        }}
      />
    </div>
  );
}
