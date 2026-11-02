import { describe, expect, it } from 'vitest';
import type { CustomerPayment, Invoice } from '@/core/db/db';
import {
  dashboardRange,
  dashboardSnapshot,
  invoicesInRange,
  monthlyRevenueSeries,
  statusBreakdown,
} from './invoice-dashboard';

const now = new Date('2026-11-03T12:00:00.000Z');

const invoice = (patch: Partial<Invoice> = {}): Invoice => ({
  id: 1,
  number: 1001,
  date: '2026-11-01T09:00:00.000Z',
  subtotal: 1_000_000,
  discountType: 'percent',
  discountValue: 0,
  discountAmount: 0,
  taxPercent: 0,
  taxAmount: 0,
  total: 1_000_000,
  status: 'completed',
  paymentMethod: 'cash',
  createdAt: '2026-11-01T09:00:00.000Z',
  ...patch,
});

const payment = (patch: Partial<CustomerPayment> = {}): CustomerPayment => ({
  id: 1,
  customerId: 9,
  invoiceId: 2,
  amount: 400_000,
  date: '2026-11-02T09:00:00.000Z',
  createdAt: '2026-11-02T09:00:00.000Z',
  ...patch,
});

describe('داشبورد فاکتور', () => {
  it('بازه‌ی ۷ روز اخیر فقط فاکتورهای همان بازه را برمی‌گرداند', () => {
    const range = dashboardRange('7d', now)!;
    const scoped = invoicesInRange(
      [invoice({ id: 1, date: '2026-10-01T09:00:00.000Z', total: 500_000 }), invoice()],
      range,
    );
    expect(scoped).toHaveLength(1);
    expect(scoped[0].id).toBe(1);
  });

  it('فاکتور باطل‌شده از شاخص فروش حذف می‌شود', () => {
    const snapshot = dashboardSnapshot(
      [invoice(), invoice({ id: 3, number: 1003, status: 'voided' })],
      [],
      '30d',
      now,
    );
    expect(snapshot.stats.count).toBe(1);
    expect(snapshot.sales.value).toBe(1_000_000);
  });

  it('مقایسه با دوره‌ی قبل محاسبه می‌شود', () => {
    const snapshot = dashboardSnapshot(
      [
        invoice(), // ۱ Nov — دوره‌ی جاری
        invoice({ id: 2, number: 1002, date: '2026-10-24T09:00:00.000Z', total: 500_000 }),
      ],
      [],
      '7d',
      now,
    );
    expect(snapshot.sales.value).toBe(1_000_000);
    expect(snapshot.sales.previous).toBe(500_000);
    expect(snapshot.sales.changePercent).toBe(100);
  });

  it('وصول و مانده فقط از پرداخت‌های واقعی محاسبه می‌شوند', () => {
    const snapshot = dashboardSnapshot(
      [invoice({ id: 2, number: 1002, isCredit: true, paymentMethod: 'credit' })],
      [payment()],
      '30d',
      now,
    );
    expect(snapshot.collected.value).toBe(400_000);
    expect(snapshot.outstanding).toBe(600_000);
    expect(snapshot.draftLike).toBe(1);
  });

  it('ترکیب وضعیت، فاکتورهای معوق را جدا می‌شمارد', () => {
    const slices = statusBreakdown(
      [
        invoice({ id: 1 }),
        invoice({
          id: 2,
          isCredit: true,
          date: '2026-08-01T09:00:00.000Z',
          status: 'completed',
        }),
        invoice({ id: 3, status: 'voided' }),
      ],
      [],
      now,
    );
    const byKey = Object.fromEntries(slices.map((slice) => [slice.key, slice.count]));
    expect(byKey.paid).toBe(1);
    expect(byKey.overdue).toBe(1);
    expect(byKey.voided).toBe(1);
  });

  it('سری ماهانه شش نقطه دارد و ماه باطل‌ها را نمی‌شمارد', () => {
    const series = monthlyRevenueSeries([invoice(), invoice({ id: 4, status: 'voided' })], 6);
    expect(series).toHaveLength(6);
    expect(series[5].revenue).toBe(1_000_000);
    expect(series[5].invoiceCount).toBe(1);
  });
});
