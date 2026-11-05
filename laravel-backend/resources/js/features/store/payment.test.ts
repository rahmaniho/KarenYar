import { describe, expect, it } from 'vitest';
import type { Invoice } from '@/core/db/db';
import { cashChange, normalizeSearch, settlementBreakdown } from './payment';
import { dailySalesSeries, salesTotals, todaySales, topProducts } from './store-calc';

const invoice = (patch: Partial<Invoice> = {}): Invoice => ({
  id: 1,
  number: 1,
  date: '2026-10-28T12:00:00',
  subtotal: 100,
  discountType: 'amount',
  discountValue: 0,
  discountAmount: 0,
  taxPercent: 0,
  taxAmount: 0,
  total: 100,
  createdAt: '',
  ...patch,
});

describe('پرداخت و گزارش صندوق', () => {
  it('وجه نقد مازاد فقط باقی پول است', () => {
    expect(cashChange(100, 150)).toBe(50);
    expect(cashChange(100, 50)).toBe(0);
  });
  it('جستجوی بارکد و نام ارقام و حروف فارسی و عربی را یکسان می‌کند', () => {
    expect(normalizeSearch(' كالا ۱۲٣ ')).toBe('کالا 123');
  });
  it('فاکتورهای قدیمی و باطل‌شده در گزارش تسویه درست تفسیر می‌شوند', () => {
    const summary = settlementBreakdown([
      invoice(),
      invoice({ id: 2, isCredit: true }),
      invoice({ id: 3, paymentMethod: 'card' }),
      invoice({ id: 4, paymentMethod: 'cash', status: 'voided' }),
    ]);
    expect(summary.find((s) => s.method === 'cash')).toMatchObject({ total: 100, count: 1 });
    expect(summary.find((s) => s.method === 'credit')?.total).toBe(100);
  });
  it('فروش امروز شامل فردا یا فاکتور باطل‌شده نیست', () => {
    expect(
      todaySales(
        [
          invoice(),
          invoice({ id: 2, date: '2026-10-29T12:00:00' }),
          invoice({ id: 3, status: 'voided' }),
        ],
        new Date('2026-10-28T18:00:00'),
      ),
    ).toBe(100);
  });
  it('ابطال از مجموع، سری روزانه و پرفروش‌ترین کالاها کنار گذاشته می‌شود', () => {
    const active = invoice();
    const voided = invoice({ id: 2, status: 'voided' });
    const items = [1, 2].map((id) => ({
      invoiceId: id,
      productId: 1,
      name: 'کالا',
      qty: 1,
      unitPrice: 100,
      unitCost: 60,
      total: 100,
    }));
    expect(salesTotals([active, voided], items)).toMatchObject({
      revenue: 100,
      invoiceCount: 1,
      grossProfit: 40,
    });
    expect(topProducts(items, [active, voided])[0].qty).toBe(1);
    expect(dailySalesSeries([active, voided], '1405-08').reduce((sum, p) => sum + p.total, 0)).toBe(
      100,
    );
  });
});
