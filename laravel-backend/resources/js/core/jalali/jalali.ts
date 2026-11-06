/**
 * ابزار تاریخ شمسی (جلالی) بر پایه‌ی jalaali-js
 * تاریخ‌ها در دیتابیس به‌صورت ISO میلادی ذخیره می‌شوند و فقط در لایه‌ی نمایش/گزارش شمسی‌اند.
 */
import { toJalaali, toGregorian, jalaaliMonthLength, isValidJalaaliDate } from 'jalaali-js';
import { toFaDigits } from '../currency/currency';

export interface JalaliDate {
  jy: number;
  jm: number; // ۱ تا ۱۲
  jd: number;
}

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

export const JALALI_WEEKDAYS = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
  'شنبه',
] as const;

export function dateToJalali(date: Date): JalaliDate {
  const { jy, jm, jd } = toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return { jy, jm, jd };
}

export function jalaliToDate(j: JalaliDate): Date {
  const { gy, gm, gd } = toGregorian(j.jy, j.jm, j.jd);
  return new Date(gy, gm - 1, gd);
}

export function todayJalali(): JalaliDate {
  return dateToJalali(new Date());
}

export function isValidJalali(j: JalaliDate): boolean {
  return isValidJalaaliDate(j.jy, j.jm, j.jd);
}

export function daysInJalaliMonth(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** «۱۴۰۴/۰۷/۱۴» */
export function formatJalaliNumeric(date: Date): string {
  const { jy, jm, jd } = dateToJalali(date);
  return toFaDigits(`${jy}/${pad2(jm)}/${pad2(jd)}`);
}

/** «۱۴ مهر ۱۴۰۴» */
export function formatJalaliLong(date: Date): string {
  const { jy, jm, jd } = dateToJalali(date);
  return toFaDigits(`${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`);
}

/** «چهارشنبه ۱۴ مهر ۱۴۰۴» */
export function formatJalaliFull(date: Date): string {
  return `${JALALI_WEEKDAYS[date.getDay()]} ${formatJalaliLong(date)}`;
}

export function formatJalaliISO(iso: string): string {
  return formatJalaliNumeric(new Date(iso));
}

export function formatJalaliLongISO(iso: string): string {
  return formatJalaliLong(new Date(iso));
}

/** کلید ماه شمسی برای گروه‌بندی/بودجه: «1404-07» (ارقام انگلیسی برای پایداری کلید) */
export function jalaliMonthKey(date: Date): string {
  const { jy, jm } = dateToJalali(date);
  return `${jy}-${pad2(jm)}`;
}

export function jalaliMonthKeyOf(jy: number, jm: number): string {
  return `${jy}-${pad2(jm)}`;
}

export function currentJalaliMonthKey(): string {
  return jalaliMonthKey(new Date());
}

/** «مهر ۱۴۰۴» از روی کلید ماه */
export function jalaliMonthLabel(key: string): string {
  const [jy, jm] = key.split('-').map(Number);
  if (!jy || !jm || jm < 1 || jm > 12) return key;
  return toFaDigits(`${JALALI_MONTHS[jm - 1]} ${jy}`);
}

/** جابه‌جایی کلید ماه به‌اندازه‌ی n ماه (مثبت/منفی) */
export function addJalaliMonths(key: string, n: number): string {
  const [jy, jm] = key.split('-').map(Number);
  const total = jy * 12 + (jm - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return jalaliMonthKeyOf(ny, nm);
}

/** بازه‌ی میلادی [start, end) یک ماه شمسی — برای کوئری‌های دیتابیس */
export function jalaliMonthRange(key: string): { start: Date; end: Date } {
  const [jy, jm] = key.split('-').map(Number);
  const start = jalaliToDate({ jy, jm, jd: 1 });
  const nextKey = addJalaliMonths(key, 1);
  const [ny, nm] = nextKey.split('-').map(Number);
  const end = jalaliToDate({ jy: ny, jm: nm, jd: 1 });
  return { start, end };
}

/** افزودن n ماه شمسی به یک تاریخ میلادی (با سقف روز ماه مقصد) — مثلاً سررسید قسط بعد */
export function addJalaliMonthsToDate(date: Date, n: number): Date {
  const j = dateToJalali(date);
  const total = j.jy * 12 + (j.jm - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(j.jd, jalaaliMonthLength(ny, nm));
  return jalaliToDate({ jy: ny, jm: nm, jd: nd });
}

/** اختلاف دو تاریخ به روز */
export function daysDiff(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export interface JalaliDiff {
  years: number;
  months: number;
  days: number;
  totalDays: number;
}

/** تفاضل دو تاریخ شمسی به‌صورت سال/ماه/روز + مجموع روزها (برای «تاریخ‌شمار») — اگر تاریخ دوم زودتر باشد، همه‌ی اجزا منفی برمی‌گردند */
export function diffJalali(from: Date, to: Date): JalaliDiff {
  const totalDays = daysDiff(from, to);
  if (totalDays < 0) {
    const positive = diffJalali(to, from);
    return {
      years: -positive.years || 0,
      months: -positive.months || 0,
      days: -positive.days || 0,
      totalDays,
    };
  }
  const a = dateToJalali(from);
  const b = dateToJalali(to);
  let years = b.jy - a.jy;
  let months = b.jm - a.jm;
  let days = b.jd - a.jd;
  if (days < 0) {
    months -= 1;
    // تعداد روزهای ماه قبل از ماه مقصد
    const prevMonth = b.jm === 1 ? { jy: b.jy - 1, jm: 12 } : { jy: b.jy, jm: b.jm - 1 };
    days += jalaaliMonthLength(prevMonth.jy, prevMonth.jm);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days, totalDays };
}

/** تجزیه‌ی رشته‌ی «1404-07-14» شمسی به Date میلادی — ورودی نامعتبر → null */
export function parseJalaliDateString(value: string): Date | null {
  const parts = value.split(/[-/]/).map((p) => Number(p.trim()));
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p) || p <= 0)) return null;
  const j: JalaliDate = { jy: parts[0], jm: parts[1], jd: parts[2] };
  if (!isValidJalali(j)) return null;
  return jalaliToDate(j);
}

/** Date میلادی → رشته‌ی ورودی شمسی «1404-07-14» (برای فیلدهای فرم) */
export function toJalaliInputString(date: Date): string {
  const { jy, jm, jd } = dateToJalali(date);
  return `${jy}-${pad2(jm)}-${pad2(jd)}`;
}
