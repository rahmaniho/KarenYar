import { describe, expect, it } from 'vitest';
import { decimalUnits, percentageAmount, quantityAmount, sumMoney } from './money';
import { fromDisplayAmountExact } from './currency';

describe('پول با حساب صحیح مقیاس‌دار', () => {
  it.each([
    [0.1, 3, 0],
    [0.5, 1, 1],
    [0.000001, 1_000_000, 1],
    [0.07, 100, 7],
    [1.005, 1000, 1005],
    [2.5, 999, 2498],
    [1.234567, 1_000_000, 1_234_567],
  ])('%s × %s تومان = %s تومان', (qty, price, expected) => {
    expect(quantityAmount(qty, price)).toBe(expected);
  });
  it('درصد نیم به بالا فقط یک بار گرد می‌شود', () => {
    expect(percentageAmount(5, 10)).toBe(1);
    expect(percentageAmount(1, 0.000001)).toBe(0);
    expect(percentageAmount(500_000_000, 10)).toBe(50_000_000);
  });
  it('سرریز جمع و مقدار ناسالم را رد می‌کند', () => {
    expect(() => sumMoney([Number.MAX_SAFE_INTEGER, 1])).toThrow('ایمن');
    expect(() => quantityAmount(1.0000001, 100)).toThrow('اعشار');
    expect(() => quantityAmount(1, 0.5)).toThrow('تومان صحیح');
    expect(() => decimalUnits(-1)).toThrow('معتبر نیست');
    expect(() => decimalUnits(1e-7)).toThrow();
    expect(() => percentageAmount(100, -1)).toThrow();
  });
  it('ریال کسری بی‌صدا به تومان گرد نمی‌شود', () => {
    expect(fromDisplayAmountExact(1250, 'rial')).toBe(125);
    expect(() => fromDisplayAmountExact(1251, 'rial')).toThrow('مضرب');
    expect(() => fromDisplayAmountExact(1.5, 'toman')).toThrow('صحیح');
    expect(() => fromDisplayAmountExact(Number.MAX_SAFE_INTEGER, 'toman')).not.toThrow();
  });
});
