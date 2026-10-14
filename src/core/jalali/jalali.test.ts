import { describe, expect, it } from 'vitest';
import {
  addJalaliMonths,
  dateToJalali,
  daysInJalaliMonth,
  diffJalali,
  formatJalaliLong,
  formatJalaliNumeric,
  jalaliMonthKey,
  jalaliMonthLabel,
  jalaliMonthRange,
  jalaliToDate,
  parseJalaliDateString,
  toJalaliInputString,
} from './jalali';

describe('تبدیل میلادی ↔ شمسی', () => {
  it('نوروز ۱۴۰۳ برابر ۲۰ مارس ۲۰۲۴ است', () => {
    expect(dateToJalali(new Date(2024, 2, 20))).toEqual({ jy: 1403, jm: 1, jd: 1 });
  });

  it('نوروز ۱۴۰۴ برابر ۲۱ مارس ۲۰۲۵ است (۱۴۰۳ کبیسه)', () => {
    expect(dateToJalali(new Date(2025, 2, 21))).toEqual({ jy: 1404, jm: 1, jd: 1 });
  });

  it('تبدیل رفت‌وبرگشت پایدار است', () => {
    const j = { jy: 1404, jm: 7, jd: 14 };
    expect(dateToJalali(jalaliToDate(j))).toEqual(j);
  });

  it('اسفند ۱۴۰۳ سی روز و اسفند ۱۴۰۴ بیست‌ونه روز دارد', () => {
    expect(daysInJalaliMonth(1403, 12)).toBe(30);
    expect(daysInJalaliMonth(1404, 12)).toBe(29);
  });
});

describe('قالب‌بندی تاریخ شمسی', () => {
  it('قالب عددی با ارقام فارسی است', () => {
    expect(formatJalaliNumeric(new Date(2025, 9, 6))).toBe('۱۴۰۴/۰۷/۱۴');
  });

  it('قالب طولانی نام ماه را نشان می‌دهد', () => {
    expect(formatJalaliLong(new Date(2025, 9, 6))).toBe('۱۴ مهر ۱۴۰۴');
  });
});

describe('کلید ماه شمسی', () => {
  it('کلید ماه ساخته می‌شود', () => {
    expect(jalaliMonthKey(new Date(2025, 9, 6))).toBe('1404-07');
  });

  it('برچسب ماه فارسی است', () => {
    expect(jalaliMonthLabel('1404-07')).toBe('مهر ۱۴۰۴');
  });

  it('جابه‌جایی ماه از مرز سال عبور می‌کند', () => {
    expect(addJalaliMonths('1404-11', 3)).toBe('1405-02');
    expect(addJalaliMonths('1404-01', -1)).toBe('1403-12');
  });

  it('بازه‌ی ماه مهر ۱۴۰۴ درست است', () => {
    const { start, end } = jalaliMonthRange('1404-07');
    expect(start).toEqual(new Date(2025, 8, 23));
    expect(end).toEqual(new Date(2025, 9, 23));
  });
});

describe('تفاضل تاریخ (تاریخ‌شمار)', () => {
  it('یک سال کامل دقیق محاسبه می‌شود', () => {
    const from = jalaliToDate({ jy: 1403, jm: 1, jd: 1 });
    const to = jalaliToDate({ jy: 1404, jm: 1, jd: 1 });
    const diff = diffJalali(from, to);
    expect(diff.years).toBe(1);
    expect(diff.months).toBe(0);
    expect(diff.days).toBe(0);
    expect(diff.totalDays).toBe(366); // ۱۴۰۳ کبیسه
  });

  it('تفاضل ماه و روز با قرض‌گرفتن از ماه قبل درست است', () => {
    const from = jalaliToDate({ jy: 1404, jm: 3, jd: 20 });
    const to = jalaliToDate({ jy: 1404, jm: 7, jd: 10 });
    const diff = diffJalali(from, to);
    expect(diff).toMatchObject({ years: 0, months: 3, days: 21 });
  });
});

describe('پارس تاریخ شمسی', () => {
  it('رشته‌ی معتبر خوانده می‌شود و برگشت‌پذیر است', () => {
    const date = parseJalaliDateString('1404-07-14');
    expect(date).not.toBeNull();
    expect(toJalaliInputString(date!)).toBe('1404-07-14');
  });

  it('تاریخ ناموجود (۳۰ اسفند سال غیرکبیسه) رد می‌شود', () => {
    expect(parseJalaliDateString('1404-12-30')).toBeNull();
    expect(parseJalaliDateString('1404-13-01')).toBeNull();
    expect(parseJalaliDateString('سلام')).toBeNull();
  });
});
