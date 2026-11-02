/**
 * ثبت پرداخت مشتری روی فاکتور — تراکنشی، اعتبارسنجی‌شده و بدون امکان ثبت دوباره.
 * دریافت نسیه درآمد جدید نیست؛ فقط مانده‌ی حساب و وضعیت پرداخت فاکتور را تغییر می‌دهد.
 */
import { db, nowISO, type CustomerPayment } from '@/core/db/db';
import { roundMoney } from '@/core/currency/currency';
import { invoicePaymentState, validateInvoicePayment } from './invoice-domain';

export interface RecordPaymentInput {
  invoiceId: number;
  /** مبلغ به تومان (عدد صحیح) */
  amount: number;
  /** کلید یکتا برای جلوگیری از ثبت دوباره با کلیک/ارسال تکراری */
  idempotencyKey?: string;
  method?: 'cash' | 'card' | 'transfer';
  note?: string;
  /** تاریخ پرداخت؛ پیش‌فرض اکنون */
  date?: string;
}

/** پرداخت‌های همین فاکتور (برای فرم پرداخت) */
export async function paymentsOfInvoice(invoiceId: number): Promise<CustomerPayment[]> {
  return db.customerPayments.where('invoiceId').equals(invoiceId).toArray();
}

/**
 * ثبت پرداخت روی فاکتور نسیه.
 * - مبلغ بیش از مانده، فاکتور باطل و فاکتور نقدی رد می‌شوند.
 * - کلید یکتای پرداخت (در صورت ارسال) از ثبت دوباره جلوگیری می‌کند.
 */
export async function recordInvoicePayment(input: RecordPaymentInput): Promise<number> {
  const amount = roundMoney(input.amount);
  const key = input.idempotencyKey?.trim();
  if (key && key.length > 128) throw new Error('شناسه‌ی پرداخت نامعتبر است.');

  return db.transaction('rw', [db.invoices, db.customerPayments, db.customers], async () => {
    const invoice = await db.invoices.get(input.invoiceId);
    if (!invoice) throw new Error('فاکتور پیدا نشد.');
    if (invoice.customerId == null)
      throw new Error('برای ثبت پرداخت، فاکتور باید به یک مشتری ثبت‌شده تعلق داشته باشد.');
    const customer = await db.customers.get(invoice.customerId);
    if (!customer) throw new Error('مشتری این فاکتور پیدا نشد.');

    const existing = await db.customerPayments.where('invoiceId').equals(input.invoiceId).toArray();
    if (key) {
      const duplicate = existing.find((payment) => payment.note?.includes(`#${key}`));
      if (duplicate?.id != null) return duplicate.id; // همان درخواست قبلی؛ دوباره ثبت نمی‌شود
    }
    const check = validateInvoicePayment(invoice, amount, existing);
    if (!check.ok) throw new Error(check.message);

    const date = input.date ?? nowISO();
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) throw new Error('تاریخ پرداخت معتبر نیست.');

    const noteParts = [input.note?.trim(), input.method ? `روش: ${methodLabel(input.method)}` : ''];
    if (key) noteParts.push(`#${key}`);
    const id = (await db.customerPayments.add({
      customerId: customer.id!,
      invoiceId: invoice.id!,
      amount,
      date,
      note: noteParts.filter(Boolean).join(' — ').slice(0, 300) || undefined,
      createdAt: nowISO(),
    })) as number;
    return id;
  });
}

function methodLabel(method: 'cash' | 'card' | 'transfer'): string {
  return method === 'cash' ? 'نقدی' : method === 'card' ? 'کارت‌خوان' : 'انتقال بانکی';
}

/** حذف پرداختی که اشتباه ثبت شده — فقط با مجوز و با ثبت دلیل */
export async function deleteInvoicePayment(paymentId: number, reason: string): Promise<void> {
  if (reason.trim().length < 3) throw new Error('دلیل حذف پرداخت را با حداقل ۳ نویسه بنویسید.');
  await db.transaction('rw', [db.invoices, db.customerPayments], async () => {
    const payment = await db.customerPayments.get(paymentId);
    if (!payment) throw new Error('پرداخت پیدا نشد.');
    if (payment.invoiceId != null) {
      const invoice = await db.invoices.get(payment.invoiceId);
      if (invoice?.status === 'voided') throw new Error('فاکتور باطل‌شده قابل تغییر پرداخت نیست.');
    }
    await db.customerPayments.delete(paymentId);
  });
}

/** مانده‌ی فعلی فاکتور (برای نمایش در فرم پرداخت) */
export async function invoiceRemaining(invoiceId: number): Promise<number> {
  const invoice = await db.invoices.get(invoiceId);
  if (!invoice) throw new Error('فاکتور پیدا نشد.');
  const payments = await paymentsOfInvoice(invoiceId);
  return invoicePaymentState(invoice, payments).remaining;
}
