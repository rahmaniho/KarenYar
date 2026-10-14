import { describe, expect, it } from 'vitest';
import type { Invoice, InvoiceItem } from '@/core/db/db';
import {
  dailySalesSeries,
  lowStockProducts,
  monthlySalesSeries,
  salesTotals,
  topProducts,
} from './store-calc';
import { calculateInvoiceTotals } from './invoice.service';

const invoice = (partial: Partial<Invoice>): Invoice => ({
  number: 1,
  date: new Date(2025, 9, 6).toISOString(), // ۱۴ مهر ۱۴۰۴
  subtotal: 0,
  discountType: 'percent',
  discountValue: 0,
  discountAmount: 0,
  taxPercent: 0,
  taxAmount: 0,
  total: 0,
  createdAt: new Date().toISOString(),
  ...partial,
});
const item = (partial: Partial<InvoiceItem>): InvoiceItem => ({
  invoiceId: 1,
  productId: 1,
  name: 'کالا',
  qty: 1,
  unitPrice: 1000,
  unitCost: 800,
  total: 1000,
  ...partial,
});

describe('جمع‌های فاکتور', () => {
  it('مالیات بعد از تخفیف اعمال می‌شود', () => {
    const totals = calculateInvoiceTotals([{ qty: 2, unitPrice: 100_000 }], 'percent', 10, 10);
    expect(totals.subtotal).toBe(200_000);
    expect(totals.discountAmount).toBe(20_000);
    expect(totals.taxAmount).toBe(18_000);
    expect(totals.total).toBe(198_000);
  });
});

describe('گزارش فروش', () => {
  it('مجموع فروش و سود ناخالص درست است', () => {
    const inv = invoice({ id: 1, subtotal: 3000, total: 3000 });
    const totals = salesTotals(
      [inv],
      [item({ qty: 3, unitPrice: 1000, unitCost: 700, total: 3000 })],
    );
    expect(totals.revenue).toBe(3000);
    expect(totals.netRevenue).toBe(3000);
    expect(totals.cost).toBe(2100);
    expect(totals.grossProfit).toBe(900);
    expect(totals.invoiceCount).toBe(1);
  });

  it('سود ناخالص تخفیف فاکتور را کم می‌کند و مالیات جزو فروش خالص نیست', () => {
    // فاکتور ۱۰هزارتومانی با ۲۰٪ تخفیف و ۱۰٪ مالیات: فروش خالص ۸۰۰۰، سود = ۸۰۰۰ − بهای تمام‌شده
    const inv = invoice({
      id: 1,
      subtotal: 10_000,
      discountAmount: 2_000,
      taxPercent: 10,
      taxAmount: 800,
      total: 8_800,
    });
    const totals = salesTotals(
      [inv],
      [item({ qty: 10, unitPrice: 1000, unitCost: 800, total: 10_000 })],
    );
    expect(totals.revenue).toBe(8_800);
    expect(totals.netRevenue).toBe(8_000);
    expect(totals.cost).toBe(8_000);
    expect(totals.grossProfit).toBe(0);
  });

  it('مالیات منفی در محاسبه‌ی فاکتور صفر در نظر گرفته می‌شود', () => {
    const totals = calculateInvoiceTotals([{ qty: 1, unitPrice: 1000 }], 'percent', 0, -10);
    expect(totals.taxAmount).toBe(0);
    expect(totals.total).toBe(1000);
  });

  it('سری روزانه‌ی مهر ۱۴۰۴ سی نقطه دارد و فروش روز ۱۴ را می‌شمارد', () => {
    const inv = invoice({ id: 1, total: 5000, date: new Date(2025, 9, 6).toISOString() });
    const daily = dailySalesSeries([inv], '1404-07');
    expect(daily).toHaveLength(30);
    expect(daily[13].total).toBe(5000);
    expect(daily[0].total).toBe(0);
  });

  it('سری ماهانه ۶ نقطه برمی‌گرداند', () => {
    expect(monthlySalesSeries([], 6)).toHaveLength(6);
  });

  it('کالاهای پرفروش مرتب برمی‌گردند', () => {
    const tops = topProducts([
      item({ name: 'الف', qty: 1, total: 100 }),
      item({ name: 'ب', qty: 5, total: 500 }),
      item({ name: 'الف', qty: 2, total: 200 }),
    ]);
    expect(tops[0]).toMatchObject({ name: 'ب', revenue: 500 });
    expect(tops[1]).toMatchObject({ name: 'الف', qty: 3, revenue: 300 });
  });

  it('کم‌موجودها تشخیص داده می‌شوند', () => {
    const low = lowStockProducts([
      {
        name: 'الف',
        category: 'x',
        buyPrice: 1,
        buyTaxPercent: 0,
        shippingPerUnit: 0,
        overheadPerUnit: 0,
        costPrice: 1,
        sellPrice: 2,
        stock: 2,
        unit: 'عدد',
        minStock: 5,
        createdAt: '',
        updatedAt: '',
      },
      {
        name: 'ب',
        category: 'x',
        buyPrice: 1,
        buyTaxPercent: 0,
        shippingPerUnit: 0,
        overheadPerUnit: 0,
        costPrice: 1,
        sellPrice: 2,
        stock: 50,
        unit: 'عدد',
        minStock: 5,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    expect(low.map((p) => p.name)).toEqual(['الف']);
  });
});
