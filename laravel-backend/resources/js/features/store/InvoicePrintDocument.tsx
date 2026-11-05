/**
 * نمای چاپی/نمایشی فاکتور — هم‌چیدمان با خروجی PDF
 *
 * همین بلوک هم روی صفحه نمایش داده می‌شود و هم با window.print() چاپ می‌شود؛
 * پس تایپوگرافی، ترتیب بلوک‌ها و شبکه‌ی جدول با سند PDF یکی است.
 */
import { Fragment } from 'react';
import type { Customer, CustomerPayment, Invoice, InvoiceItem } from '@/core/db/db';
import { formatJalaliFull, formatJalaliNumeric } from '@/core/jalali/jalali';
import { CURRENCY_LABELS, formatDecimal, formatMoney, toFaDigits } from '@/core/currency/currency';
import { assetUrl, cn } from '@/lib/utils';
import { Ltr } from '@/components/Ltr';
import { amountInWords } from '@/core/text/amount-words';
import { allocateInvoiceDiscount } from './invoice-calc';
import { invoicePaymentMethod, PAYMENT_LABELS } from './payment';
import {
  invoiceDueDate,
  invoiceLifecycle,
  invoicePaymentState,
  LIFECYCLE_LABELS,
} from './invoice-domain';

export interface InvoicePrintSettings {
  shopName: string;
  shopPhone?: string;
  shopAddress?: string;
  shopEconomicCode?: string;
  shopRegistrationNumber?: string;
  currencyUnit: 'toman' | 'rial';
  invoiceFooterNote?: string;
  invoiceShowLogo?: boolean;
}

interface Props {
  invoice: Invoice;
  items: InvoiceItem[];
  customer?: Customer | null;
  settings: InvoicePrintSettings;
  /** پرداخت‌های ثبت‌شده‌ی همین فاکتور */
  payments?: CustomerPayment[];
  className?: string;
}

export function InvoicePrintDocument({
  invoice,
  items,
  customer,
  settings,
  payments = [],
  className,
}: Props) {
  const unit = settings.currencyUnit;
  const unitLabel = CURRENCY_LABELS[unit];
  const isVoided = invoice.status === 'voided';
  const issueDate = new Date(invoice.date);
  const buyerName = invoice.customerName?.trim() || customer?.name?.trim() || 'مشتری گذری';
  const buyerPhone = invoice.customerPhone?.trim() || customer?.phone?.trim() || 'ثبت نشده';
  const buyerAddress = invoice.customerAddress?.trim() || customer?.address?.trim() || 'ثبت نشده';
  const payState = invoicePaymentState(invoice, payments);
  const lifecycle = invoiceLifecycle(invoice, payments);
  const statusLabel = LIFECYCLE_LABELS[lifecycle];
  const isDraft = invoice.status === 'draft';
  const globalDiscountShares = allocateInvoiceDiscount(
    invoice,
    items.map((item) => ({ total: item.total - (item.discountAmount ?? 0) })),
  );

  const statusTone =
    isVoided || lifecycle === 'overdue'
      ? 'bg-red-50 text-red-700 ring-red-200'
      : lifecycle === 'paid'
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
        : 'bg-amber-50 text-amber-700 ring-amber-200';

  const money = (value: number) => formatMoney(value, unit);

  const metaCells = [
    { label: 'شماره فاکتور', value: toFaDigits(String(invoice.number)) },
    { label: 'تاریخ صدور', value: formatJalaliNumeric(issueDate) },
    { label: 'روش پرداخت', value: PAYMENT_LABELS[invoicePaymentMethod(invoice)] },
    { label: 'وضعیت سند', value: statusLabel, tone: statusTone },
    { label: 'سررسید', value: formatJalaliNumeric(invoiceDueDate(invoice)) },
  ];

  const totalsRows: { label: string; value: string; danger?: boolean; success?: boolean }[] = [
    {
      label: items.some((item) => (item.discountAmount ?? 0) > 0)
        ? 'جمع پس از تخفیف ردیف'
        : 'جمع اقلام',
      value: money(invoice.subtotal),
    },
  ];
  if (invoice.discountAmount > 0) {
    totalsRows.push({
      label:
        invoice.discountType === 'percent'
          ? `تخفیف (${toFaDigits(String(invoice.discountValue))}٪)`
          : 'تخفیف',
      value: `− ${money(invoice.discountAmount)}`,
      danger: true,
    });
  }
  if (invoice.taxAmount > 0) {
    totalsRows.push({
      label: `مالیات بر ارزش افزوده (${toFaDigits(String(invoice.taxPercent))}٪)`,
      value: money(invoice.taxAmount),
    });
  }
  if ((invoice.shippingAmount ?? 0) > 0)
    totalsRows.push({ label: 'هزینه حمل', value: money(invoice.shippingAmount!) });
  if ((invoice.otherAmount ?? 0) > 0)
    totalsRows.push({ label: 'سایر هزینه‌ها', value: money(invoice.otherAmount!) });
  if (invoice.paymentMethod === 'cash' && invoice.cashTendered !== undefined) {
    totalsRows.push({ label: 'وجه نقد دریافتی', value: money(invoice.cashTendered) });
    totalsRows.push({ label: 'باقی پول مشتری', value: money(invoice.changeAmount ?? 0) });
  }
  if (!isVoided && !isDraft && payState.paid > 0)
    totalsRows.push({ label: 'پرداخت خالص', value: money(payState.paid), success: true });
  if (payState.refunded > 0)
    totalsRows.push({ label: 'وجه برگشت‌خورده', value: money(payState.refunded), danger: true });

  const finalValue = invoice.isCredit && !isVoided && !isDraft ? payState.remaining : invoice.total;
  const finalLabel = isDraft
    ? 'مبلغ پیش‌نویس (غیرقطعی)'
    : isVoided
      ? 'مبلغ سند باطل‌شده'
      : invoice.isCredit
        ? finalValue > 0
          ? 'مانده قابل پرداخت'
          : 'تسویه‌شده'
        : 'مبلغ سند';

  const PartyCard = ({
    title,
    accent,
    rows,
  }: {
    title: string;
    accent: string;
    rows: { label: string; value: string; ltr?: boolean }[];
  }) => (
    <div className="rounded-xl border border-navy-100 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-[2px]', accent)} />
        <span className="text-[13px] font-extrabold text-navy-900">{title}</span>
      </div>
      <dl className="space-y-1.5 text-[12px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-1.5">
            <dt className="shrink-0 text-navy-400">{row.label}</dt>
            <dd className="min-w-0 flex-1 truncate font-semibold text-navy-800">
              {row.ltr && /[0-9A-Za-z@]/.test(row.value) ? <Ltr>{row.value}</Ltr> : row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );

  return (
    <div
      className={cn(
        'print-area relative mx-auto w-full max-w-[820px] overflow-hidden bg-white text-navy-900 shadow-card print:max-w-none print:shadow-none',
        className,
      )}
    >
      {/* نوار برند */}
      <div className="h-[14px] bg-navy-900" />
      <div className="h-[3px] bg-neon-500" />

      {(isVoided || isDraft) && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span
            className={`-rotate-[22deg] text-[110px] font-black leading-none ${isVoided ? 'text-red-600/[0.08]' : 'text-amber-600/[0.10]'}`}
          >
            {isVoided ? 'باطل' : 'پیش‌نویس'}
          </span>
        </div>
      )}

      <div className="relative px-6 py-6 sm:px-8">
        {/* سربرگ: هویت فروشگاه + کارت عنوان */}
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 flex-1 flex-row-reverse items-start justify-end gap-4">
            {settings.invoiceShowLogo !== false && (
              <img
                src={assetUrl('images/hesabyar/mark.png')}
                alt=""
                width={512}
                height={512}
                className="h-14 w-14 shrink-0 object-contain"
              />
            )}
            <div className="min-w-0 text-end">
              <p className="truncate text-[19px] font-extrabold leading-tight text-navy-900">
                {settings.shopName}
              </p>
              <p className="mt-1 truncate text-[11px] text-navy-500">
                {[settings.shopPhone && `تلفن: ${settings.shopPhone}`, settings.shopAddress]
                  .filter(Boolean)
                  .join('  ·  ')}
              </p>
              {(settings.shopEconomicCode || settings.shopRegistrationNumber) && (
                <p className="mt-0.5 truncate text-[10px] text-navy-400">
                  {[
                    settings.shopEconomicCode && `شناسه اقتصادی: ${settings.shopEconomicCode}`,
                    settings.shopRegistrationNumber &&
                      `شماره ثبت: ${settings.shopRegistrationNumber}`,
                  ]
                    .filter(Boolean)
                    .join('  ·  ')}
                </p>
              )}
            </div>
          </div>

          <div className="w-[210px] shrink-0 overflow-hidden rounded-xl border border-navy-100 bg-navy-50/60">
            <p className="bg-navy-900 py-2 text-center text-[12px] font-extrabold text-white">
              صورتحساب فروش
            </p>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-navy-500">شماره فاکتور</p>
              <p className="text-[19px] font-extrabold leading-tight text-navy-900">
                {toFaDigits(String(invoice.number))}
              </p>
              <div className="my-2 h-px bg-navy-100" />
              <p className="text-[10px] text-navy-500">{formatJalaliFull(issueDate)}</p>
            </div>
          </div>
        </div>

        {/* خریدار و فروشنده */}
        <div className="print-keep mt-5 grid gap-3 sm:grid-cols-2">
          <PartyCard
            title="خریدار"
            accent="bg-neon-500"
            rows={[
              { label: 'نام:', value: buyerName },
              { label: 'تلفن:', value: buyerPhone, ltr: true },
              { label: 'نشانی:', value: buyerAddress },
            ]}
          />
          <PartyCard
            title="فروشنده"
            accent="bg-navy-600"
            rows={[
              { label: 'نام:', value: settings.shopName },
              { label: 'تلفن:', value: settings.shopPhone?.trim() || 'ثبت نشده' },
              { label: 'نشانی:', value: settings.shopAddress?.trim() || 'ثبت نشده' },
            ]}
          />
        </div>

        {/* نوار مشخصات */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {metaCells.map((cell) => (
            <div key={cell.label} className={cn('rounded-lg bg-navy-50 px-3 py-2', cell.tone)}>
              <p className="text-[9px] text-current opacity-60">{cell.label}</p>
              <p className="mt-0.5 truncate text-[12px] font-extrabold">{cell.value}</p>
            </div>
          ))}
        </div>

        {isVoided && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white">
              !
            </span>
            <span className="font-semibold">
              این سند باطل شده است و از محاسبات فروش حذف می‌شود
              {invoice.voidReason ? ` — دلیل: ${invoice.voidReason}` : ''}
            </span>
          </div>
        )}

        {/* جدول اقلام */}
        <table className="mt-5 w-full border-collapse overflow-hidden rounded-lg text-[11.5px]">
          <thead>
            <tr className="bg-navy-900 text-white">
              <th className="w-10 px-2 py-2.5 text-center font-bold">ردیف</th>
              <th className="px-3 py-2.5 text-start font-bold">شرح کالا / خدمات</th>
              <th className="w-14 px-2 py-2.5 text-center font-bold">تعداد</th>
              <th className="w-28 px-2 py-2.5 text-start font-bold">قیمت واحد</th>
              <th className="w-24 px-2 py-2.5 text-start font-bold">تخفیف</th>
              <th className="w-28 px-3 py-2.5 text-start font-bold">مبلغ کل</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="bg-navy-50/50 px-3 py-6 text-center text-navy-400">
                  هیچ قلمی برای این فاکتور ثبت نشده است.
                </td>
              </tr>
            )}
            {items.map((item, index) => {
              const share = (item.discountAmount ?? 0) + globalDiscountShares[index];
              const netTotal = item.total - share;
              return (
                <tr
                  key={item.id ?? index}
                  className={cn('border-b border-navy-100/70', index % 2 === 1 && 'bg-navy-50/40')}
                >
                  <td className="px-2 py-3 text-center text-navy-400">
                    {toFaDigits(String(index + 1))}
                  </td>
                  <td className="px-3 py-3 font-semibold text-navy-800">{item.name || '—'}</td>
                  <td className="px-2 py-3 text-center">{formatDecimal(item.qty, 6)}</td>
                  <td className="tabular-nums px-2 py-3">{formatMoney(item.unitPrice, unit)}</td>
                  <td
                    className={cn(
                      'tabular-nums px-2 py-3',
                      share > 0 ? 'text-red-700' : 'text-navy-300',
                    )}
                  >
                    {share > 0 ? formatMoney(Math.round(share), unit) : '—'}
                  </td>
                  <td className="tabular-nums px-3 py-3 font-extrabold text-navy-900">
                    {formatMoney(netTotal, unit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1.5 text-[9.5px] text-navy-400">
          مبالغ به {unitLabel} است.
          {
            ' ستون تخفیف شامل تخفیف ردیف و سهم تخفیف کل است؛ مبلغ کل پس از تخفیف و پیش از مالیات است.'
          }
        </p>

        {/* جمع‌بندی + مبلغ به حروف */}
        <div className="print-keep mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-xl bg-navy-50 px-4 py-4">
            <p className="text-[10px] text-navy-400">مبلغ به حروف</p>
            <p className="mt-1 text-[12.5px] font-bold leading-6 text-navy-900">
              {amountInWords(invoice.total)} {unitLabel}
            </p>
            {invoice.note && (
              <Fragment>
                <p className="mt-3 text-[10px] text-navy-400">یادداشت</p>
                <p className="mt-0.5 text-[11px] leading-5 text-navy-600">{invoice.note}</p>
              </Fragment>
            )}
            {(invoice.terms || settings.invoiceFooterNote) && (
              <Fragment>
                <p className="mt-3 text-[10px] text-navy-400">شرایط پرداخت</p>
                <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-5 text-navy-600">
                  {invoice.terms || settings.invoiceFooterNote}
                </p>
              </Fragment>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-navy-100">
            <dl className="px-4 py-1">
              {totalsRows.map((row, index) => (
                <div
                  key={row.label}
                  className={cn(
                    'flex items-baseline justify-between gap-3 py-2 text-[11.5px]',
                    index < totalsRows.length - 1 && 'border-b border-dashed border-navy-100',
                  )}
                >
                  <dt className="text-navy-500">{row.label}</dt>
                  <dd
                    className={cn(
                      'tabular-nums font-semibold',
                      row.danger
                        ? 'text-red-700'
                        : row.success
                          ? 'text-emerald-700'
                          : 'text-navy-800',
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex items-baseline justify-between gap-3 bg-navy-900 px-4 py-3.5">
              <span className="text-[11.5px] font-extrabold text-white">{finalLabel}</span>
              <span className="tabular-nums text-[14px] font-extrabold text-neon-400">
                {money(finalValue)}
              </span>
            </div>
          </div>
        </div>

        {/* امضا */}
        <div className="print-keep mt-5 grid gap-3 sm:grid-cols-2">
          {[
            { title: 'مهر و امضای فروشنده', hint: settings.shopName },
            { title: 'امضای خریدار', hint: 'مهر یا امضای خریدار' },
          ].map((box) => (
            <div
              key={box.title}
              className="flex h-24 flex-col justify-between rounded-xl border border-dashed border-navy-200 px-4 py-3"
            >
              <span className="text-[11.5px] font-semibold text-navy-600">{box.title}</span>
              <span className="truncate text-[10px] text-navy-400">{box.hint}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-navy-100 pt-3 text-[10px] text-navy-400">
          <span className="truncate">{settings.shopName} · صادرشده با حساب‌یار کارن سافت</span>
          <span>
            کد پیگیری: <Ltr>{invoice.checkoutKey?.slice(-10) ?? `INV-${invoice.number}`}</Ltr>
          </span>
        </div>
      </div>
    </div>
  );
}
