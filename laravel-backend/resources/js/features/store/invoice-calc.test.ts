import { describe, expect, it } from 'vitest';
import { allocateInvoiceDiscount, calculateInvoice } from './invoice-calc';

const line = { productId: null, name: 'خدمت', qty: 1, unitPrice: 1000 };
describe('محاسبه و تخصیص تخفیف فاکتور', () => {
  it('ترتیب تخفیف ردیف، تخفیف کل، مالیات و هزینهٔ جانبی ثابت است', () => {
    const totals = calculateInvoice({
      items: [
        { ...line, discountType: 'percent', discountValue: 10 },
        { ...line, unitPrice: 500 },
      ],
      discountType: 'amount',
      discountValue: 150,
      taxPercent: 10,
      shippingAmount: 20,
      otherAmount: 5,
    });
    expect(totals).toMatchObject({
      grossSubtotal: 1500,
      lineDiscountAmount: 100,
      subtotal: 1400,
      discountAmount: 150,
      taxableBase: 1250,
      taxAmount: 125,
      total: 1400,
    });
    expect(totals.lines[0]).toMatchObject({ discountAmount: 100, total: 900 });
  });
  it('جمع تخفیف تخصیص‌یافته دقیقاً برابر تخفیف سند است', () => {
    const items = [{ total: 1 }, { total: 1 }, { total: 1 }];
    const shares = allocateInvoiceDiscount({ subtotal: 3, discountAmount: 2 }, items);
    expect(shares).toEqual([1, 1, 0]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(2);
  });
  it('فاکتور صددرصد تخفیف، مبلغ صفر دارد و مالیات ندارد', () => {
    expect(
      calculateInvoice({
        items: [line],
        discountType: 'percent',
        discountValue: 100,
        taxPercent: 10,
      }).total,
    ).toBe(0);
  });
  it('تخفیف بیش از مبلغ و هزینهٔ اعشاری رد می‌شود', () => {
    expect(() =>
      calculateInvoice({
        items: [line],
        discountType: 'amount',
        discountValue: 1001,
        taxPercent: 0,
      }),
    ).toThrow('بیشتر');
    expect(() =>
      calculateInvoice({
        items: [line],
        discountType: 'percent',
        discountValue: 0,
        taxPercent: 0,
        shippingAmount: 0.5,
      }),
    ).toThrow('تومان صحیح');
  });
  it('۵۰۰ ردیف با سرریز خاموش پذیرفته نمی‌شود', () => {
    expect(() =>
      calculateInvoice({
        items: Array.from({ length: 500 }, () => ({ ...line, unitPrice: Number.MAX_SAFE_INTEGER })),
        discountType: 'percent',
        discountValue: 0,
        taxPercent: 0,
      }),
    ).toThrow('ایمن');
  });
});
