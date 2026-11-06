import { db, nowISO, type PaymentMethod } from '@/core/db/db';
import { assertMoney } from '@/core/currency/money';

export interface RecordCustomerPaymentInput {
  customerId: number;
  amountToman: number;
  method?: Exclude<PaymentMethod, 'credit'>;
  reference?: string;
  note?: string;
  date?: string;
  paymentKey: string;
}

function signature(input: RecordCustomerPaymentInput): string {
  return JSON.stringify({
    customerId: input.customerId,
    amount: input.amountToman,
    method: input.method ?? 'cash',
    reference: input.reference?.trim() ?? '',
    note: input.note?.trim() ?? '',
    date: input.date ?? '',
  });
}

/**
 * دریافت عمومی از مشتری (بدون فاکتور مشخص) با کلید یکتا و رویداد مالی.
 * درآمد فروش قبلاً در زمان صدور فاکتور ثبت شده؛ این تابع فقط دریافتنی‌ها را کم می‌کند.
 */
export async function recordCustomerPayment(input: RecordCustomerPaymentInput): Promise<number> {
  if (!input.paymentKey?.trim()) throw new Error('کلید تلاش برای ثبت پرداخت لازم است.');
  const amount = assertMoney(input.amountToman, 'مبلغ پرداخت');
  if (amount <= 0) throw new Error('مبلغ پرداخت باید بزرگ‌تر از صفر باشد.');
  if (!Number.isSafeInteger(input.customerId) || input.customerId <= 0)
    throw new Error('مشتری معتبر نیست.');
  const requestSignature = signature(input);
  return db.transaction('rw', db.customerPayments, db.customers, db.financialEvents, async () => {
    const duplicate = await db.customerPayments
      .where('paymentKey')
      .equals(input.paymentKey)
      .first();
    if (duplicate) {
      if (duplicate.requestSignature && duplicate.requestSignature !== requestSignature)
        throw new Error('این کلید پرداخت قبلاً با مبلغ یا مشخصات دیگری ثبت شده است.');
      return duplicate.id!;
    }
    const customer = await db.customers.get(input.customerId);
    if (!customer) throw new Error('مشتری پیدا نشد.');
    const now = nowISO();
    const id = (await db.customerPayments.add({
      customerId: input.customerId,
      invoiceId: null,
      amount,
      date: input.date ?? now,
      kind: 'payment',
      method: input.method ?? 'cash',
      reference: input.reference?.trim() || undefined,
      note: input.note?.trim() || undefined,
      paymentKey: input.paymentKey,
      requestSignature,
      createdAt: now,
    })) as number;
    await db.financialEvents.add({
      action: 'customer_payment_received',
      customerId: input.customerId,
      amount,
      reason: `دریافت از مشتری «${customer.name}»`,
      paymentId: id,
      paymentKey: input.paymentKey,
      createdAt: now,
    });
    return id;
  });
}
