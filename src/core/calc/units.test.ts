import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCY_RATES, convertCurrency, convertUnits } from './units';

describe('تبدیل واحد', () => {
  it('طول: کیلومتر و اینچ', () => {
    expect(convertUnits(1, 'length', 'km', 'm')).toBe(1000);
    expect(convertUnits(1, 'length', 'inch', 'cm')).toBeCloseTo(2.54, 10);
  });

  it('وزن: تن و پوند', () => {
    expect(convertUnits(2, 'weight', 'ton', 'kg')).toBe(2000);
    expect(convertUnits(1, 'weight', 'pound', 'g')).toBeCloseTo(453.59237, 5);
  });

  it('دما فرمولی است نه ضریبی', () => {
    expect(convertUnits(100, 'temperature', 'c', 'f')).toBe(212);
    expect(convertUnits(32, 'temperature', 'f', 'c')).toBe(0);
    expect(convertUnits(0, 'temperature', 'c', 'k')).toBeCloseTo(273.15, 10);
    expect(convertUnits(273.15, 'temperature', 'k', 'c')).toBeCloseTo(0, 10);
  });

  it('تبدیل رفت‌وبرگشت پایدار است', () => {
    const m = convertUnits(5, 'length', 'mile', 'm');
    expect(convertUnits(m, 'length', 'm', 'mile')).toBeCloseTo(5, 10);
  });

  it('واحد نامعتبر خطا می‌دهد', () => {
    expect(() => convertUnits(1, 'length', 'm', 'xyz')).toThrow();
  });
});

describe('تبدیل ارز با نرخ دستی', () => {
  it('دلار به تومان و برعکس', () => {
    expect(convertCurrency(2, 'USD', 'IRR-TMN', DEFAULT_CURRENCY_RATES)).toBe(186_000);
    expect(convertCurrency(93_000, 'IRR-TMN', 'USD', DEFAULT_CURRENCY_RATES)).toBe(1);
  });

  it('تبدیل دو ارز خارجی از مسیر تومان', () => {
    const eurInUsd = convertCurrency(1, 'EUR', 'USD', DEFAULT_CURRENCY_RATES);
    expect(eurInUsd).toBeCloseTo(101_000 / 93_000, 6);
  });
});
