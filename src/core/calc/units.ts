/**
 * تبدیل واحدها و ارز — Pure Functions
 * واحدهای خطی با ضریب نسبت به واحد پایه تبدیل می‌شوند؛ دما فرمول اختصاصی دارد.
 */

export interface UnitDef {
  id: string;
  label: string;
  /** ضریب تبدیل به واحد پایه (برای واحدهای خطی) */
  toBase: number;
}

export interface UnitCategory {
  id: string;
  label: string;
  kind: 'linear' | 'temperature';
  units: UnitDef[];
}

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    label: 'طول',
    kind: 'linear',
    units: [
      { id: 'mm', label: 'میلی‌متر', toBase: 0.001 },
      { id: 'cm', label: 'سانتی‌متر', toBase: 0.01 },
      { id: 'm', label: 'متر', toBase: 1 },
      { id: 'km', label: 'کیلومتر', toBase: 1000 },
      { id: 'inch', label: 'اینچ', toBase: 0.0254 },
      { id: 'foot', label: 'فوت', toBase: 0.3048 },
      { id: 'yard', label: 'یارد', toBase: 0.9144 },
      { id: 'mile', label: 'مایل', toBase: 1609.344 },
    ],
  },
  {
    id: 'weight',
    label: 'وزن',
    kind: 'linear',
    units: [
      { id: 'g', label: 'گرم', toBase: 1 },
      { id: 'kg', label: 'کیلوگرم', toBase: 1000 },
      { id: 'ton', label: 'تن', toBase: 1_000_000 },
      { id: 'pound', label: 'پوند', toBase: 453.59237 },
      { id: 'ounce', label: 'اونس', toBase: 28.349523125 },
    ],
  },
  {
    id: 'area',
    label: 'سطح',
    kind: 'linear',
    units: [
      { id: 'cm2', label: 'سانتی‌متر مربع', toBase: 0.0001 },
      { id: 'm2', label: 'متر مربع', toBase: 1 },
      { id: 'hectare', label: 'هکتار', toBase: 10_000 },
      { id: 'km2', label: 'کیلومتر مربع', toBase: 1_000_000 },
    ],
  },
  {
    id: 'volume',
    label: 'حجم',
    kind: 'linear',
    units: [
      { id: 'ml', label: 'میلی‌لیتر', toBase: 0.001 },
      { id: 'l', label: 'لیتر', toBase: 1 },
      { id: 'm3', label: 'متر مکعب', toBase: 1000 },
      { id: 'gallon', label: 'گالن (آمریکا)', toBase: 3.785411784 },
    ],
  },
  {
    id: 'temperature',
    label: 'دما',
    kind: 'temperature',
    units: [
      { id: 'c', label: 'سلسیوس (°C)', toBase: 1 },
      { id: 'f', label: 'فارنهایت (°F)', toBase: 1 },
      { id: 'k', label: 'کلوین (K)', toBase: 1 },
    ],
  },
];

function temperatureToCelsius(value: number, from: string): number {
  if (from === 'f') return ((value - 32) * 5) / 9;
  if (from === 'k') return value - 273.15;
  return value;
}
function celsiusToTemperature(celsius: number, to: string): number {
  if (to === 'f') return (celsius * 9) / 5 + 32;
  if (to === 'k') return celsius + 273.15;
  return celsius;
}

export function convertUnits(
  value: number,
  categoryId: string,
  fromId: string,
  toId: string,
): number {
  const category = UNIT_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) throw new Error('دسته‌ی واحد یافت نشد');
  const from = category.units.find((u) => u.id === fromId);
  const to = category.units.find((u) => u.id === toId);
  if (!from || !to) throw new Error('واحد نامعتبر است');
  if (category.kind === 'temperature') {
    return celsiusToTemperature(temperatureToCelsius(value, fromId), toId);
  }
  return (value * from.toBase) / to.toBase;
}

// ————— تبدیل ارز با نرخ دستی —————

export interface CurrencyRate {
  code: string;
  label: string;
  /** نرخ برابری نسبت به تومان */
  rateToToman: number;
}

/** نرخ‌های پیش‌فرض — صرفاً نمونه و کاملاً قابل ویرایش دستی در ماشین‌حساب/تنظیمات */
export const DEFAULT_CURRENCY_RATES: CurrencyRate[] = [
  { code: 'IRR-TMN', label: 'تومان ایران', rateToToman: 1 },
  { code: 'USD', label: 'دلار آمریکا', rateToToman: 93_000 },
  { code: 'EUR', label: 'یورو', rateToToman: 101_000 },
  { code: 'GBP', label: 'پوند انگلیس', rateToToman: 121_000 },
  { code: 'AED', label: 'درهم امارات', rateToToman: 25_300 },
  { code: 'TRY', label: 'لیر ترکیه', rateToToman: 2_700 },
];

export function convertCurrency(
  value: number,
  fromCode: string,
  toCode: string,
  rates: CurrencyRate[],
): number {
  const from = rates.find((r) => r.code === fromCode);
  const to = rates.find((r) => r.code === toCode);
  if (!from || !to || to.rateToToman === 0) throw new Error('ارز نامعتبر است');
  return (value * from.rateToToman) / to.rateToToman;
}
