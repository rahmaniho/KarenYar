/**
 * ابزار پول و اعداد فارسی
 * قاعده‌ی معماری: همه‌ی مبالغ در دیتابیس و محاسبات به «تومان» (عدد صحیح) نگهداری می‌شوند؛
 * واحد نمایشی (تومان/ریال) فقط در مرز UI تبدیل می‌شود تا هیچ‌وقت خطای تبدیل در داده رخ ندهد.
 */

export type CurrencyUnit = 'toman' | 'rial';

export const CURRENCY_LABELS: Record<CurrencyUnit, string> = {
  toman: 'تومان',
  rial: 'ریال',
};

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** ارقام انگلیسی → فارسی */
export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** ارقام فارسی/عربی → انگلیسی */
export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** گرد کردن مبلغ به نزدیک‌ترین تومان صحیح */
export function roundMoney(value: number): number {
  return Math.round(value);
}

/** تومان (واحد داخلی) → مقدار نمایشی بر اساس واحد انتخابی کاربر */
export function toDisplayAmount(tomanValue: number, unit: CurrencyUnit): number {
  return unit === 'rial' ? tomanValue * 10 : tomanValue;
}

/** مقدار واردشده در UI → تومان داخلی */
export function fromDisplayAmount(displayValue: number, unit: CurrencyUnit): number {
  return unit === 'rial' ? roundMoney(displayValue / 10) : roundMoney(displayValue);
}

const faNumberFormat = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const faDecimalFormat = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 });

/** قالب‌بندی عدد با جداکننده‌ی هزارگان و ارقام فارسی: ۱۲٬۵۰۰ */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return faNumberFormat.format(value);
}

/** قالب‌بندی عدد اعشاری (برای نرخ‌ها و نتایج ماشین‌حساب) */
export function formatDecimal(value: number, maxFraction = 2): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: maxFraction }).format(value);
}

/** قالب‌بندی مبلغ داخلی (تومان) برای نمایش، همراه با برچسب واحد */
export function formatMoney(
  tomanValue: number,
  unit: CurrencyUnit,
  options: { withUnit?: boolean } = {},
): string {
  const { withUnit = true } = options;
  const display = toDisplayAmount(tomanValue, unit);
  const formatted = faNumberFormat.format(display);
  return withUnit ? `${formatted} ${CURRENCY_LABELS[unit]}` : formatted;
}

/**
 * پارس ورودی مبلغ کاربر: ارقام فارسی/عربی، جداکننده‌های ٬ ، , و فاصله را می‌پذیرد.
 * ورودی نامعتبر → null
 */
export function parseAmountInput(raw: string): number | null {
  if (raw == null) return null;
  const cleaned = toEnDigits(String(raw))
    .replace(/[٬،,\s_]/g, '')
    .replace(/٫/g, '.')
    .trim();
  if (cleaned === '' || cleaned === '-') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** قالب‌بندی زنده‌ی ورودی مبلغ هنگام تایپ (جداکننده‌ی هزارگان فارسی) */
export function formatAmountInput(raw: string): string {
  const parsed = parseAmountInput(raw);
  if (parsed === null) return '';
  const negative = parsed < 0;
  const text = faNumberFormat.format(Math.abs(parsed));
  return negative ? `-${text}` : text;
}

export { faDecimalFormat };
