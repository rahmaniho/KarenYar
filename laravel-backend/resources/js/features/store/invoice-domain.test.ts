import { describe, expect, it } from 'vitest';
import type { CustomerPayment, Invoice } from '@/core/db/db';
import {
  daysUntilDue,
  invoiceDueDate,
  invoiceLifecycle,
  invoicePaymentState,
  invoiceStats,
  invoicesNeedingFollowUp,
  isOverdue,
  paymentTotalForInvoice,
  receivablesAging,
  validateInvoicePayment,
} from './invoice-domain';

const base = new Date('2025-06-01T09:00:00.000Z');

const invoice = (patch: Partial<Invoice> = {}): Invoice => ({
  id: 1,
  number: 1001,
  date: base.toISOString(),
  subtotal: 1_000_000,
  discountType: 'percent',
  discountValue: 0,
  discountAmount: 0,
  taxPercent: 10,
  taxAmount: 100_000,
  total: 1_100_000,
  status: 'completed',
  paymentMethod: 'cash',
  isCredit: false,
  createdAt: base.toISOString(),
  ...patch,
});

const payment = (patch: Partial<CustomerPayment> = {}): CustomerPayment => ({
  id: 1,
  customerId: 7,
  invoiceId: 1,
  amount: 500_000,
  date: base.toISOString(),
  createdAt: base.toISOString(),
  ...patch,
});

describe('وضعیت پرداخت فاکتور', () => {
  it('فاکتور نقدی هنگام صدور تسویه‌شده است', () => {
    const state = invoicePaymentState(invoice());
    expect(state.status).toBe('paid');
    expect(state.paid).toBe(1_100_000);
    expect(state.remaining).toBe(0);
  });

  it('فاکتور نسیه بدون پرداخت، پرداخت‌نشده است و مانده کامل دارد', () => {
    const state = invoicePaymentState(invoice({ isCredit: true, paymentMethod: 'credit' }));
    expect(state.status).toBe('unpaid');
    expect(state.paid).toBe(0);
    expect(state.remaining).toBe(1_100_000);
  });

  it('پرداخت جزئی، مانده‌ی واقعی را نشان می‌دهد', () => {
    const state = invoicePaymentState(invoice({ isCredit: true }), [payment({ amount: 400_000 })]);
    expect(state.status).toBe('partial');
    expect(state.paid).toBe(400_000);
    expect(state.remaining).toBe(700_000);
  });

  it('چند پرداخت جمع می‌شوند و تسویه کامل تشخیص داده می‌شود', () => {
    const state = invoicePaymentState(invoice({ isCredit: true }), [
      payment({ id: 1, amount: 600_000 }),
      payment({ id: 2, amount: 500_000 }),
    ]);
    expect(state.status).toBe('paid');
    expect(state.remaining).toBe(0);
    expect(state.overpaid).toBe(0);
  });

  it('اضافه‌پرداخت جدا محاسبه می‌شود', () => {
    const state = invoicePaymentState(invoice({ isCredit: true }), [
      payment({ amount: 1_300_000 }),
    ]);
    expect(state.status).toBe('overpaid');
    expect(state.overpaid).toBe(200_000);
    expect(state.remaining).toBe(0);
  });

  it('پرداخت‌های فاکتورهای دیگر در مانده‌ی این فاکتور حساب نمی‌شوند', () => {
    const payments = [payment({ id: 1, invoiceId: 2, amount: 900_000 })];
    expect(paymentTotalForInvoice(1, payments)).toBe(0);
    expect(invoicePaymentState(invoice({ isCredit: true }), payments).remaining).toBe(1_100_000);
  });

  it('فاکتور باطل‌شده نه پرداخت‌شده است و نه بدهکار', () => {
    const state = invoicePaymentState(invoice({ status: 'voided', isCredit: true }), [
      payment({ amount: 500_000 }),
    ]);
    expect(state.paid).toBe(0);
    expect(state.status).toBe('unpaid');
  });

  it('مبلغ نامعتبر در پرداخت‌ها نادیده گرفته می‌شود', () => {
    const payments = [payment({ amount: Number.NaN })];
    expect(paymentTotalForInvoice(1, payments)).toBe(0);
  });
});

describe('سررسید و مطالعه‌ی چرخه‌ی عمر', () => {
  it('سررسید پیش‌فرض ۳۰ روز پس از صدور است', () => {
    const due = invoiceDueDate(invoice());
    expect(daysUntilDue(invoice(), new Date('2025-06-01T00:00:00.000Z'))).toBe(30);
    expect(isOverdue(invoice({ isCredit: true }), new Date('2025-06-15T00:00:00.000Z'))).toBe(
      false,
    );
    expect(isOverdue(invoice({ isCredit: true }), new Date('2025-07-05T00:00:00.000Z'))).toBe(true);
    expect(due.toISOString().slice(0, 10)).toBe('2025-07-01');
  });

  it('سررسید ذخیره‌شده بر پیش‌فرض اولویت دارد', () => {
    const custom = invoice({ isCredit: true, dueDate: '2025-06-10T00:00:00.000Z' });
    expect(isOverdue(custom, new Date('2025-06-11T00:00:00.000Z'))).toBe(true);
  });

  it('فاکتور نقدی هرگز سررسیدگذشته حساب نمی‌شود', () => {
    expect(invoiceLifecycle(invoice({ isCredit: false }), [], new Date('2026-01-01'))).toBe('paid');
  });

  it('چرخه‌ی عمر برای نسیه‌ی سررسیدگذشته، overdue است', () => {
    const credit = invoice({ isCredit: true });
    expect(invoiceLifecycle(credit, [], new Date('2025-08-01'))).toBe('overdue');
    expect(invoiceLifecycle(credit, [payment({ amount: 600_000 })], new Date('2025-08-01'))).toBe(
      'overdue',
    );
  });
});

describe('اعتبارسنجی پرداخت', () => {
  it('پرداخت بیش از مانده رد می‌شود', () => {
    const result = validateInvoicePayment(invoice({ isCredit: true }), 1_200_000);
    expect(result.ok).toBe(false);
  });

  it('پرداخت روی فاکتور تسویه‌شده رد می‌شود', () => {
    const result = validateInvoicePayment(invoice(), 1000);
    expect(result.ok).toBe(false);
  });

  it('پرداخت صفر یا اعشاری رد می‌شود', () => {
    expect(validateInvoicePayment(invoice({ isCredit: true }), 0).ok).toBe(false);
    expect(validateInvoicePayment(invoice({ isCredit: true }), 1000.5).ok).toBe(false);
  });

  it('پرداخت معتبر پذیرفته می‌شود', () => {
    const result = validateInvoicePayment(invoice({ isCredit: true }), 1_100_000);
    expect(result).toEqual({ ok: true, amount: 1_100_000 });
  });

  it('فاکتور باطل‌شده قابل پرداخت نیست', () => {
    const result = validateInvoicePayment(invoice({ isCredit: true, status: 'voided' }), 1000);
    expect(result.ok).toBe(false);
  });
});

describe('آمار و مطالبات', () => {
  const now = new Date('2025-08-01T00:00:00.000Z');

  it('فاکتور باطل از فروش و وصول حذف می‌شود', () => {
    const stats = invoiceStats(
      [invoice({ id: 1 }), invoice({ id: 2, status: 'voided', total: 5_000_000 })],
      [],
      now,
    );
    expect(stats.count).toBe(1);
    expect(stats.voidedCount).toBe(1);
    expect(stats.total).toBe(1_100_000);
    expect(stats.collected).toBe(1_100_000);
    expect(stats.outstanding).toBe(0);
  });

  it('مطالبات سررسیدگذشته و پرداخت جزئی درست جمع می‌شوند', () => {
    const stats = invoiceStats(
      [
        invoice({ id: 1, isCredit: true, total: 1_000_000 }),
        invoice({ id: 2, isCredit: true, total: 2_000_000 }),
        invoice({ id: 3 }),
      ],
      [payment({ id: 5, invoiceId: 2, amount: 500_000 })],
      now,
    );
    expect(stats.outstanding).toBe(2_500_000);
    expect(stats.overdue).toBe(2_500_000);
    expect(stats.overdueCount).toBe(2);
    expect(stats.partialCount).toBe(1);
    expect(stats.unpaidCount).toBe(1);
  });

  it('تحلیل سنی مطالبات بر پایه‌ی سررسید است', () => {
    const aging = receivablesAging(
      [
        // سررسیدها با فرض ۳۰ روز: ۹ Aug (سررسیدنشده)، ۲۲ Jul (۱۰ روز)، ۱۹ Jun (۴۳ روز)، ۳۱ Jan (۱۸۳ روز)
        invoice({ id: 1, isCredit: true, date: new Date('2025-07-10').toISOString() }),
        invoice({ id: 2, isCredit: true, date: new Date('2025-06-22').toISOString() }),
        invoice({ id: 3, isCredit: true, date: new Date('2025-05-20').toISOString() }),
        invoice({ id: 4, isCredit: true, date: new Date('2025-01-01').toISOString() }),
      ],
      [],
      now,
    );
    expect(aging.current).toBe(1_100_000);
    expect(aging.d30).toBe(1_100_000);
    expect(aging.d60).toBe(1_100_000);
    expect(aging.d90).toBe(1_100_000);
  });

  it('فهرست پیگیری فقط مانده‌دارها را بر اساس نزدیک‌ترین سررسید مرتب می‌کند', () => {
    const list = invoicesNeedingFollowUp(
      [
        invoice({ id: 1, number: 1, isCredit: true, date: new Date('2025-06-20').toISOString() }),
        invoice({ id: 2, number: 2, isCredit: true, date: new Date('2025-01-01').toISOString() }),
        invoice({ id: 3, number: 3 }),
      ],
      [],
      5,
    );
    expect(list.map((i) => i.number)).toEqual([2, 1]);
  });
});
