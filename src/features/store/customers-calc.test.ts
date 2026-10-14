import { describe, expect, it } from 'vitest';
import type { CustomerPayment, Invoice } from '@/core/db/db';
import { customerBalance, customerStatement, totalReceivables } from './customers-calc';

const inv = (partial: Partial<Invoice>): Invoice => ({
  number: 1,
  date: '2025-10-01T00:00:00.000Z',
  subtotal: 0,
  discountType: 'percent',
  discountValue: 0,
  discountAmount: 0,
  taxPercent: 0,
  taxAmount: 0,
  total: 0,
  createdAt: '2025-10-01T00:00:00.000Z',
  customerId: 1,
  isCredit: true,
  ...partial,
});
const pay = (partial: Partial<CustomerPayment>): CustomerPayment => ({
  customerId: 1,
  amount: 0,
  date: '2025-10-02T00:00:00.000Z',
  createdAt: '2025-10-02T00:00:00.000Z',
  ...partial,
});

describe('مانده حساب مشتری', () => {
  it('فقط فروش نسیه‌ی همان مشتری حساب می‌شود', () => {
    const balance = customerBalance(
      1,
      [
        inv({ total: 1000 }),
        inv({ total: 500, isCredit: false }), // نقدی — حساب نمی‌شود
        inv({ total: 700, customerId: 2 }), // مشتری دیگر
      ],
      [pay({ amount: 300 }), pay({ amount: 100, customerId: 2 })],
    );
    expect(balance).toEqual({
      creditTotal: 1000,
      paidTotal: 300,
      balance: 700,
      creditInvoiceCount: 1,
    });
  });

  it('مطالبات کل فقط مانده‌های مثبت را جمع می‌کند', () => {
    const total = totalReceivables(
      [inv({ total: 1000, customerId: 1 }), inv({ total: 400, customerId: 2 })],
      [pay({ amount: 1500, customerId: 1 }), pay({ amount: 100, customerId: 2 })],
    );
    expect(total).toBe(300); // مشتری ۱ اضافه‌پرداخت دارد؛ فقط ۳۰۰ مشتری ۲
  });

  it('صورت‌حساب مانده‌ی جاری را درست نگه می‌دارد', () => {
    const rows = customerStatement(
      1,
      [inv({ id: 5, number: 3, total: 1000, date: '2025-10-01T00:00:00.000Z' })],
      [pay({ id: 9, amount: 400, date: '2025-10-03T00:00:00.000Z', note: 'کارت‌به‌کارت' })],
    );
    expect(rows.map((r) => [r.kind, r.runningBalance])).toEqual([
      ['invoice', 1000],
      ['payment', 600],
    ]);
  });
});
