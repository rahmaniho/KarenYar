/**
 * تبدیل مبلغ تومان به حروف فارسی — برای درج «مبلغ به حروف» در فاکتور چاپی
 * (الزام رایج فاکتورهای رسمی و جلوگیری از دست‌کاری عدد)
 */

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];

const TEENS = [
  'ده',
  'یازده',
  'دوازده',
  'سیزده',
  'چهارده',
  'پانزده',
  'شانزده',
  'هفده',
  'هجده',
  'نوزده',
];

const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];

const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];

/** مقیاس‌های هزارتایی */
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد'];

function threeDigitsToWords(value: number): string {
  const parts: string[] = [];
  const hundred = Math.floor(value / 100);
  const remainder = value % 100;
  if (hundred) parts.push(HUNDREDS[hundred]);
  if (remainder >= 10 && remainder < 20) {
    parts.push(TEENS[remainder - 10]);
  } else {
    const ten = Math.floor(remainder / 10);
    const one = remainder % 10;
    if (ten) parts.push(TENS[ten]);
    if (one) parts.push(ONES[one]);
  }
  return parts.join(' و ');
}

/** عدد صحیح مثبت → حروف فارسی */
export function numberToPersianWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'صفر';
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    if (!group) continue;
    const words = threeDigitsToWords(group);
    parts.push(i > 0 ? `${words} ${SCALES[i] ?? ''}`.trim() : words);
  }
  return parts.join(' و ');
}

/** مبلغ تومان → «یک میلیون و دویست هزار تومان» (با پشتیبانی از اعشار ریالی) */
export function amountInWords(toman: number): string {
  const safe = Number.isFinite(toman) ? toman : 0;
  const negative = safe < 0;
  const absolute = Math.abs(safe);
  const integer = Math.floor(absolute);
  const fraction = Math.round((absolute - integer) * 100);
  const words = numberToPersianWords(integer);
  const fractionText = fraction > 0 ? ` و ${numberToPersianWords(fraction)} صدم` : '';
  return `${negative ? 'منفی ' : ''}${words}${fractionText}`;
}
