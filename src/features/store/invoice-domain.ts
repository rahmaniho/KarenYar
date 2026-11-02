/**
 * دامنه‌ی فاکتور — وضعیت پرداخت، مانده، سررسید و آمار (منطق خالص و تست‌پذیر).
 *
 * قواعد معماری:
 * - همه‌ی مبالغ به «تومان» و عدد صحیح هستند (رجوع به core/currency).
 * - وضعیت پرداخت از روی داده‌های واقعی (invoice.total و پرداخت‌های ثبت‌شده) محاسبه می‌شود،
 *   نه از یک فیلد قابل‌تغییر در رابط کاربری.
 * - فاکتور باطل‌شده هیچ‌گاه در فروش فعال و مطالبات حساب نمی‌شود.
 */
import type { CustomerPayment, Invoice } from '@/core/db/db';

export type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'overpaid';

export interface InvoicePaymentState {
  /** مبلغ کل فاکتور */
  total: number;
  /** جمع پرداخت‌های ثبت‌شده برای همین فاکتور */
  paid: number;
  /** مانده‌ی بدهی (هرگز منفی نمی‌شود) */
  remaining: number;
  /** اضافه‌پرداخت (اگر پرداخت‌ها از مبلغ فاکتور بیشتر باشد) */
  overpaid: number;
  status: PaymentStatus;
}

const isSafeAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** جمع پرداخت‌های یک فاکتور از دفتر پرداخت‌های مشتری */
export function paymentTotalForInvoice(invoiceId: number, payments: CustomerPayment[]): number {
  let sum = 0;
  for (const payment of payments) {
    if (payment.invoiceId !== invoiceId) continue;
    if (!isSafeAmount(payment.amount)) continue;
    sum += payment.amount;
  }
  return sum;
}

/**
 * وضعیت پرداخت یک فاکتور.
 * پرداخت‌های بدون شناسه‌ی فاکتور (علی‌الحساب) به فاکتور خاصی نسبت داده نمی‌شوند؛
 * مانده‌ی کل حساب در customers-calc محاسبه می‌شود.
 */
export function invoicePaymentState(
  invoice: Invoice,
  payments: CustomerPayment[] = [],
): InvoicePaymentState {
  const total = isSafeAmount(invoice.total) ? invoice.total : 0;
  const id = invoice.id;
  // فروش نقدی/کارتی در لحظه‌ی صدور تسویه شده است و پرداخت جداگانه ثبت نمی‌شود.
  const settledAtIssue = !invoice.isCredit && invoice.status !== 'voided';
  const recordDed = id == null ? 0 : paymentTotalForInvoice(id, payments);
  const paid = invoice.status === 'voided' ? 0 : Math.max(settledAtIssue ? total : 0, recordDed);
  const remaining = Math.max(0, total - paid);
  const overpaid = Math.max(0, paid - total);
  const status: PaymentStatus =
    invoice.status === 'voided'
      ? 'unpaid'
      : paid <= 0
        ? 'unpaid'
        : remaining > 0
          ? 'partial'
          : overpaid > 0
            ? 'overpaid'
            : 'paid';
  return { total, paid, remaining, overpaid, status };
}

/** برچسب فارسی وضعیت پرداخت */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: 'تسویه‌شده',
  partial: 'پرداخت جزئی',
  unpaid: 'پرداخت‌نشده',
  overpaid: 'اضافه‌پرداخت',
};

export type InvoiceLifecycle = 'voided' | 'paid' | 'partial' | 'unpaid' | 'overdue';

/** وضعیت چرخه‌ی عمر فاکتور برای فهرست‌ها و گزارش‌ها */
export function invoiceLifecycle(
  invoice: Invoice,
  payments: CustomerPayment[] = [],
  now: Date = new Date(),
): InvoiceLifecycle {
  if (invoice.status === 'voided') return 'voided';
  const { status } = invoicePaymentState(invoice, payments);
  if (status === 'paid' || status === 'overpaid') return 'paid';
  if (isOverdue(invoice, now)) return 'overdue';
  return status === 'partial' ? 'partial' : 'unpaid';
}

export const LIFECYCLE_LABELS: Record<InvoiceLifecycle, string> = {
  voided: 'باطل‌شده',
  paid: 'تسویه‌شده',
  partial: 'پرداخت جزئی',
  unpaid: 'پرداخت‌نشده',
  overdue: 'سررسید گذشته',
};

/** سررسید فاکتور (ISO) — پیش‌فرض ۳۰ روز پس از صدور */
export function invoiceDueDate(invoice: Invoice, defaultDays = 30): Date {
  if (invoice.dueDate) {
    const parsed = new Date(invoice.dueDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const issued = new Date(invoice.date);
  if (Number.isNaN(issued.getTime())) return new Date(invoice.date);
  return new Date(issued.getTime() + defaultDays * 86_400_000);
}

const startOfToday = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

/** آیا فاکتور پرداخت‌نشده از سررسید گذشته است؟ (روزهای کامل، بدون ساعت) */
export function isOverdue(invoice: Invoice, now: Date = new Date()): boolean {
  if (invoice.status === 'voided') return false;
  if (!invoice.isCredit) return false;
  return startOfToday(invoiceDueDate(invoice)).getTime() < startOfToday(now).getTime();
}

/** روزهای مانده تا سررسید (منفی = گذشته) */
export function daysUntilDue(invoice: Invoice, now: Date = new Date()): number {
  const ms = startOfToday(invoiceDueDate(invoice)).getTime() - startOfToday(now).getTime();
  return Math.round(ms / 86_400_000);
}

/** اعتبارسنجی مبلغ پرداخت جدید برای یک فاکتور (جلوگیری از پرداخت اضافه و تکراری) */
export function validateInvoicePayment(
  invoice: Invoice,
  amount: number,
  payments: CustomerPayment[] = [],
): { ok: true; amount: number } | { ok: false; message: string } {
  if (invoice.status === 'voided')
    return { ok: false, message: 'فاکتور باطل‌شده قابل پرداخت نیست.' };
  if (invoice.id == null) return { ok: false, message: 'فاکتور ذخیره‌نشده قابل پرداخت نیست.' };
  if (!isSafeAmount(amount) || amount <= 0)
    return { ok: false, message: 'مبلغ پرداخت باید عددی صحیح و بیشتر از صفر باشد.' };
  if (!invoice.isCredit)
    return { ok: false, message: 'این فاکتور هنگام صدور تسویه شده است؛ پرداخت جدید لازم نیست.' };
  const state = invoicePaymentState(invoice, payments);
  if (state.remaining <= 0) return { ok: false, message: 'این فاکتور قبلاً تسویه شده است.' };
  if (amount > state.remaining)
    return { ok: false, message: 'مبلغ پرداخت از مانده‌ی فاکتور بیشتر است.' };
  return { ok: true, amount };
}

export interface InvoiceStats {
  /** تعداد فاکتورهای معتبر (غیر باطل) */
  count: number;
  voidedCount: number;
  /** جمع مبلغ فاکتورهای معتبر */
  total: number;
  /** مبلغ وصول‌شده */
  collected: number;
  /** مانده‌ی وصول‌نشده */
  outstanding: number;
  /** مانده‌ی فاکتورهای سررسیدگذشته */
  overdue: number;
  overdueCount: number;
  partialCount: number;
  unpaidCount: number;
  average: number;
}

/** آمار واقعی فاکتورها برای داشبورد و کارت‌های خلاصه */
export function invoiceStats(
  invoices: Invoice[],
  payments: CustomerPayment[] = [],
  now: Date = new Date(),
): InvoiceStats {
  let count = 0;
  let voidedCount = 0;
  let total = 0;
  let collected = 0;
  let outstanding = 0;
  let overdue = 0;
  let overdueCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;
  for (const invoice of invoices) {
    if (invoice.status === 'voided') {
      voidedCount += 1;
      continue;
    }
    const state = invoicePaymentState(invoice, payments);
    count += 1;
    total += state.total;
    collected += state.paid;
    outstanding += state.remaining;
    if (state.status === 'partial') partialCount += 1;
    if (state.status === 'unpaid') unpaidCount += 1;
    if (state.remaining > 0 && isOverdue(invoice, now)) {
      overdue += state.remaining;
      overdueCount += 1;
    }
  }
  return {
    count,
    voidedCount,
    total,
    collected,
    outstanding,
    overdue,
    overdueCount,
    partialCount,
    unpaidCount,
    average: count ? Math.round(total / count) : 0,
  };
}

export interface AgingBuckets {
  /** تا ۳۰ روز */
  current: number;
  /** ۳۱ تا ۶۰ روز */
  d30: number;
  /** ۶۱ تا ۹۰ روز */
  d60: number;
  /** بیش از ۹۰ روز */
  d90: number;
}

/** تحلیل سنی مطالبات بر پایه‌ی سررسید (برای پیگیری وصول) */
export function receivablesAging(
  invoices: Invoice[],
  payments: CustomerPayment[] = [],
  now: Date = new Date(),
): AgingBuckets {
  const result: AgingBuckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const invoice of invoices) {
    if (invoice.status === 'voided' || !invoice.isCredit) continue;
    const { remaining } = invoicePaymentState(invoice, payments);
    if (remaining <= 0) continue;
    const lateBy = -daysUntilDue(invoice, now);
    if (lateBy <= 0) result.current += remaining;
    else if (lateBy <= 30) result.d30 += remaining;
    else if (lateBy <= 60) result.d60 += remaining;
    else result.d90 += remaining;
  }
  return result;
}

/** فاکتورهای نیازمند پیگیری: سررسیدگذشته یا پرداخت جزئی، جدیدترین سررسید اول */
export function invoicesNeedingFollowUp(
  invoices: Invoice[],
  payments: CustomerPayment[] = [],
  limit = 5,
): Invoice[] {
  return invoices
    .filter((invoice) => {
      if (invoice.status === 'voided') return false;
      const state = invoicePaymentState(invoice, payments);
      return state.remaining > 0;
    })
    .sort((a, b) => invoiceDueDate(a).getTime() - invoiceDueDate(b).getTime())
    .slice(0, limit);
}
