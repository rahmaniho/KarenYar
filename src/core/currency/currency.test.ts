import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  formatNumber,
  fromDisplayAmount,
  parseAmountInput,
  toDisplayAmount,
  toEnDigits,
  toFaDigits,
} from './currency';

describe('ابزار ارقام فارسی', () => {
  it('ارقام انگلیسی را فارسی می‌کند', () => {
    expect(toFaDigits('1404-07-15')).toBe('۱۴۰۴-۰۷-۱۵');
    expect(toFaDigits(2500)).toBe('۲۵۰۰');
  });

  it('ارقام فارسی و عربی را انگلیسی می‌کند', () => {
    expect(toEnDigits('۱۲۳۴۵')).toBe('12345');
    expect(toEnDigits('١٢٣')).toBe('123');
    expect(toEnDigits('مبلغ ۵۰۰ تومان')).toBe('مبلغ 500 تومان');
  });
});

describe('تبدیل واحد پول', () => {
  it('تومان به ریال ده برابر می‌شود', () => {
    expect(toDisplayAmount(1500, 'rial')).toBe(15000);
    expect(toDisplayAmount(1500, 'toman')).toBe(1500);
  });

  it('ریالِ واردشده به تومان داخلی تبدیل و گرد می‌شود', () => {
    expect(fromDisplayAmount(15000, 'rial')).toBe(1500);
    expect(fromDisplayAmount(15005, 'rial')).toBe(1501); // گرد به نزدیک‌ترین تومان
  });
});

describe('قالب‌بندی مبلغ', () => {
  it('مبلغ تومانی با جداکننده و برچسب نمایش داده می‌شود', () => {
    expect(formatMoney(12500, 'toman')).toBe('۱۲٬۵۰۰ تومان');
  });

  it('مبلغ ریالی ده برابر نمایش داده می‌شود', () => {
    expect(formatMoney(12500, 'rial')).toBe('۱۲۵٬۰۰۰ ریال');
  });

  it('بدون برچسب واحد هم کار می‌کند', () => {
    expect(formatMoney(1000, 'toman', { withUnit: false })).toBe('۱٬۰۰۰');
  });

  it('عدد ساده فارسی قالب‌بندی می‌شود', () => {
    expect(formatNumber(1234567)).toBe('۱٬۲۳۴٬۵۶۷');
  });
});

describe('پارس ورودی مبلغ', () => {
  it('ارقام فارسی با جداکننده را می‌خواند', () => {
    expect(parseAmountInput('۱۲٬۵۰۰')).toBe(12500);
  });

  it('جداکننده‌ی انگلیسی و فاصله را قبول می‌کند', () => {
    expect(parseAmountInput('1,234,500')).toBe(1234500);
    expect(parseAmountInput(' 2500 ')).toBe(2500);
  });

  it('ورودی نامعتبر null برمی‌گرداند', () => {
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('')).toBeNull();
  });
});
