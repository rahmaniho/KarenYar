/**
 * دریافت و برگشت وجه در تراکنش محلی. دریافت نسیه درآمد جدید نیست.
 * کلید یکتا فیلد مستقل دارد؛ اصلاح پرداخت، سند معکوس می‌سازد و سابقه را پاک نمی‌کند.
 */
import { db, nowISO, type CustomerPayment } from '@/core/db/db';
import { assertMoney } from '@/core/currency/money';
import { invoicePaymentState, validateInvoicePayment } from './invoice-domain';
import { PAYMENT_LABELS } from './payment';

type SettlementMethod = 'cash' | 'card' | 'transfer';
export interface RecordPaymentInput {
  invoiceId: number;
  amount: number;
  idempotencyKey?: string;
  method?: SettlementMethod;
  note?: string;
  reference?: string;
  date?: string;
}
export interface RefundPaymentInput extends RecordPaymentInput {
  reason: string;
}

export async function paymentsOfInvoice(invoiceId: number): Promise<CustomerPayment[]> {
  return db.customerPayments.where('invoiceId').equals(invoiceId).toArray();
}

function validateCommon(input: RecordPaymentInput) {
  assertMoney(input.amount, 'مبلغ پرداخت');
  if (input.amount <= 0) throw new Error('مبلغ باید بیشتر از صفر باشد.');
  if (!Number.isSafeInteger(input.invoiceId) || input.invoiceId <= 0)
    throw new Error('شناسهٔ فاکتور نامعتبر است.');
  const key = input.idempotencyKey?.trim();
  if (input.idempotencyKey !== undefined && (!key || key.length > 128))
    throw new Error('شناسهٔ درخواست پرداخت نامعتبر است.');
  const method = input.method ?? 'cash';
  if (!['cash', 'card', 'transfer'].includes(method)) throw new Error('روش پرداخت نامعتبر است.');
  const note = input.note?.trim();
  const reference = input.reference?.trim();
  if (note && note.length > 200) throw new Error('توضیح پرداخت حداکثر ۲۰۰ نویسه است.');
  if (reference && reference.length > 100) throw new Error('شماره پیگیری حداکثر ۱۰۰ نویسه است.');
  const date = input.date ?? nowISO();
  if (Number.isNaN(new Date(date).getTime())) throw new Error('تاریخ پرداخت معتبر نیست.');
  return { key, method, note, reference, date: new Date(date).toISOString() };
}

async function duplicateRequest(
  key: string | undefined,
  signature: string,
  invoiceId: number,
  amount: number,
): Promise<number | undefined> {
  if (!key) return undefined;
  const duplicate = await db.customerPayments.where('paymentKey').equals(key).first();
  if (duplicate) {
    if (duplicate.requestSignature !== signature)
      throw new Error('این کلید درخواست قبلاً با اطلاعات دیگری ثبت شده است.');
    return duplicate.id;
  }
  // فقط خواندن سوابق قدیمی که کلید در شرح بود؛ رکورد قدیمی بازنویسی نمی‌شود.
  const legacy = await db.customerPayments.where('invoiceId').equals(invoiceId).toArray();
  const old = legacy.find((payment) => payment.note?.split(' — ').includes(`#${key}`));
  if (old) {
    if (old.amount !== amount || old.kind === 'refund')
      throw new Error('کلید پرداخت قدیمی با مبلغ دیگری ثبت شده است.');
    return old.id;
  }
  return undefined;
}

export async function recordInvoicePayment(input: RecordPaymentInput): Promise<number> {
  const { key, method, note, reference, date } = validateCommon(input);
  const requestSignature = JSON.stringify({
    kind: 'payment',
    invoiceId: input.invoiceId,
    amount: input.amount,
    method,
    note: note ?? '',
    reference: reference ?? '',
    date: input.date ? date : '',
  });
  return db.transaction(
    'rw',
    [db.invoices, db.customerPayments, db.customers, db.financialEvents],
    async () => {
      const duplicate = await duplicateRequest(
        key,
        requestSignature,
        input.invoiceId,
        input.amount,
      );
      if (duplicate != null) return duplicate;
      const invoice = await db.invoices.get(input.invoiceId);
      if (!invoice) throw new Error('فاکتور پیدا نشد.');
      const existing = await paymentsOfInvoice(input.invoiceId);
      const check = validateInvoicePayment(invoice, input.amount, existing);
      if (!check.ok) throw new Error(check.message);
      if (invoice.customerId == null)
        throw new Error('برای ثبت پرداخت، فاکتور باید به یک مشتری ثبت‌شده تعلق داشته باشد.');
      const customer = await db.customers.get(invoice.customerId);
      if (!customer) throw new Error('مشتری این فاکتور پیدا نشد.');
      const createdAt = nowISO();
      const id = (await db.customerPayments.add({
        customerId: customer.id!,
        invoiceId: invoice.id!,
        amount: input.amount,
        date,
        note,
        reference,
        kind: 'payment',
        method,
        paymentKey: key,
        requestSignature: key ? requestSignature : undefined,
        createdAt,
      })) as number;
      await db.financialEvents.add({
        invoiceId: invoice.id!,
        paymentId: id,
        action: 'payment_recorded',
        amount: input.amount,
        reason: reference ? `پیگیری: ${reference}` : PAYMENT_LABELS[method],
        createdAt,
      });
      return id;
    },
  );
}

/** برگشت وجهِ دریافت‌شده؛ برگشت کالا/موجودی نیست و جدا از ابطال ثبت می‌شود. */
export async function refundInvoicePayment(input: RefundPaymentInput): Promise<number> {
  const { key, method, note, reference, date } = validateCommon(input);
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500)
    throw new Error('دلیل برگشت وجه باید بین ۳ و ۵۰۰ نویسه باشد.');
  const requestSignature = JSON.stringify({
    kind: 'refund',
    invoiceId: input.invoiceId,
    amount: input.amount,
    method,
    note: note ?? '',
    reference: reference ?? '',
    date: input.date ? date : '',
    reason,
  });
  return db.transaction(
    'rw',
    [db.invoices, db.customerPayments, db.customers, db.financialEvents],
    async () => {
      const duplicate = await duplicateRequest(
        key,
        requestSignature,
        input.invoiceId,
        input.amount,
      );
      if (duplicate != null) return duplicate;
      const invoice = await db.invoices.get(input.invoiceId);
      if (!invoice) throw new Error('فاکتور پیدا نشد.');
      if (invoice.status === 'draft') throw new Error('پیش‌نویس پرداخت یا برگشت وجه ندارد.');
      if (invoice.status !== 'voided' && !invoice.isCredit)
        throw new Error(
          'برای برگشت وجه فروش تسویه‌شده، ابتدا سند را با دلیل ابطال کنید؛ دریافت مشتری حفظ می‌شود.',
        );
      if (invoice.customerId == null || !(await db.customers.get(invoice.customerId)))
        throw new Error('برگشت وجه به مشتری ثبت‌شدهٔ فاکتور نیاز دارد.');
      const existing = await paymentsOfInvoice(invoice.id!);
      const state = invoicePaymentState(invoice, existing);
      const refundable = state.received - state.refunded;
      if (input.amount > refundable)
        throw new Error('مبلغ برگشت از دریافت خالص این فاکتور بیشتر است.');
      const createdAt = nowISO();
      const id = (await db.customerPayments.add({
        customerId: invoice.customerId,
        invoiceId: invoice.id!,
        amount: input.amount,
        date,
        note,
        reference,
        kind: 'refund',
        method,
        paymentKey: key,
        requestSignature: key ? requestSignature : undefined,
        reversalReason: reason,
        createdAt,
      })) as number;
      await db.financialEvents.add({
        invoiceId: invoice.id!,
        paymentId: id,
        action: 'refund_recorded',
        amount: input.amount,
        reason,
        createdAt,
      });
      return id;
    },
  );
}

/** سازگاری با API قبلی: به‌جای حذف مخرب، سند معکوسِ همان پرداخت ساخته می‌شود. */
export async function deleteInvoicePayment(paymentId: number, reason: string): Promise<void> {
  const trimmed = reason.trim();
  if (trimmed.length < 3 || trimmed.length > 500)
    throw new Error('دلیل اصلاح پرداخت باید بین ۳ و ۵۰۰ نویسه باشد.');
  await db.transaction('rw', [db.invoices, db.customerPayments, db.financialEvents], async () => {
    const payment = await db.customerPayments.get(paymentId);
    if (!payment || payment.invoiceId == null) throw new Error('پرداخت فاکتور پیدا نشد.');
    if (payment.kind === 'refund') throw new Error('سند برگشت وجه با حذف پرداخت اصلاح نمی‌شود.');
    const existing = await paymentsOfInvoice(payment.invoiceId);
    if (existing.some((row) => row.reversalOf === paymentId)) return;
    const invoice = await db.invoices.get(payment.invoiceId);
    if (!invoice || invoice.status === 'draft') throw new Error('سند مالی معتبر پیدا نشد.');
    const state = invoicePaymentState(invoice, existing);
    if (payment.amount > state.received - state.refunded)
      throw new Error(
        'این پرداخت قبلاً بخشی از وجهش برگشت خورده است؛ از برگشت وجه با مبلغ صحیح استفاده کنید.',
      );
    const createdAt = nowISO();
    const id = (await db.customerPayments.add({
      customerId: payment.customerId,
      invoiceId: payment.invoiceId,
      amount: payment.amount,
      date: createdAt,
      kind: 'refund',
      method: payment.method,
      reversalOf: paymentId,
      reversalReason: trimmed,
      paymentKey: `reversal-${paymentId}`,
      requestSignature: JSON.stringify({ kind: 'reversal', paymentId, reason: trimmed }),
      createdAt,
    })) as number;
    await db.financialEvents.add({
      invoiceId: payment.invoiceId,
      paymentId: id,
      action: 'payment_reversed',
      amount: payment.amount,
      reason: trimmed,
      createdAt,
    });
  });
}

export async function invoiceRemaining(invoiceId: number): Promise<number> {
  const invoice = await db.invoices.get(invoiceId);
  if (!invoice) throw new Error('فاکتور پیدا نشد.');
  return invoicePaymentState(invoice, await paymentsOfInvoice(invoiceId)).remaining;
}
