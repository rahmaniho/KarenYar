/** دسته‌بندی‌های پیش‌فرض تراکنش‌های شخصی (کاربر می‌تواند دسته‌ی تازه هم بسازد) */
export const DEFAULT_EXPENSE_CATEGORIES = [
  'خوراک و رستوران',
  'حمل‌ونقل',
  'مسکن و اجاره',
  'قبوض و شارژ',
  'درمان و سلامت',
  'پوشاک',
  'تفریح و سفر',
  'آموزش',
  'خرید و لوازم',
  'سایر هزینه‌ها',
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  'حقوق و دستمزد',
  'فروش و کسب‌وکار',
  'پاداش',
  'سرمایه‌گذاری',
  'سایر درآمدها',
] as const;

export const DEFAULT_PRODUCT_CATEGORIES = [
  'عمومی',
  'خواربار',
  'نوشیدنی',
  'بهداشتی',
  'پوشاک',
  'دیجیتال',
] as const;

export const PRODUCT_UNITS = [
  'عدد',
  'بسته',
  'کیلوگرم',
  'گرم',
  'لیتر',
  'متر',
  'جعبه',
  'کارتن',
] as const;

/** ادغام دسته‌های پیش‌فرض با دسته‌های ساخته‌شده‌ی کاربر (بدون تکرار) */
export function mergeCategories(defaults: readonly string[], used: string[]): string[] {
  return [...new Set([...defaults, ...used.filter(Boolean)])];
}
