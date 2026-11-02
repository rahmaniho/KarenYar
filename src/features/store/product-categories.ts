/**
 * دستهبندیهای قابل شخصیسازی کالاها در انبار.
 *
 * نام دسته همان `Product.category` (متن آزاد) باقی میماند؛ بنابراین هیچ تغییری در
 * اسکیمای Dexie، نسخهی دیتابیس، قالب پشتیبان یا ساختار فاکتورها لازم نیست.
 * تعریف دستهها (نام + رنگ) در جدول کلید/مقدار `settings` ذخیره میشود تا
 * پشتیبانگیری/بازیابی و پاککردن کامل دادهها خودکار شامل آنها باشد.
 *
 * اصل مهم: کاربر میتواند **هر نامی** برای دسته وارد کند؛ نامهای استفادهشده
 * توسط کالاهای قدیمی همیشه در فهرست نمایش داده میشوند (دادهای گم نمیشود).
 */
import { db, nowISO } from '@/core/db/db';
import { DEFAULT_PRODUCT_CATEGORIES } from '../personal/categories';

export const PRODUCT_CATEGORIES_KEY = 'product-categories';
export const DEFAULT_CATEGORY_NAME = 'عمومی';
export const MAX_CATEGORY_NAME_LENGTH = 60;
/** مقدار داخلی فیلتر «همه‌ی دستهها»؛ نام دستهها بهجای متن، با شناسه مقایسه میشوند */
export const ALL_CATEGORIES_FILTER = '__all_product_categories__';

export interface ProductCategory {
  id: string;
  name: string;
  /** رنگ دلخواه کاربر (hex) برای تشخیص سریع در انبار و فیلترها */
  color: string;
}

/** پالت هماهنگ با هویت کارن سافت (طلایی، آبی، سبز نئونی و ...) */
export const CATEGORY_COLORS = [
  '#D6B46A',
  '#38BDF8',
  '#39C88A',
  '#F59E0B',
  '#F472B6',
  '#A78BFA',
  '#F87171',
  '#64748B',
] as const;

export function categoryColor(index: number): string {
  return CATEGORY_COLORS[
    ((index % CATEGORY_COLORS.length) + CATEGORY_COLORS.length) % CATEGORY_COLORS.length
  ];
}

export function normalizeCategoryName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** کلید یکدست برای مقایسه: فاصلهها، نیمفاصله، ی/ک عربی و بزرگی/کوچکی حروف */
export function categoryKey(value: string): string {
  return normalizeCategoryName(value.replace(/\u200c/g, ' '))
    .replace(/[\u0649\u064a]/g, 'ی')
    .replace(/[\u0643\u06a9]/g, 'ک')
    .toLocaleLowerCase('fa');
}

export function sameCategory(a: string, b: string): boolean {
  return categoryKey(a) === categoryKey(b);
}

export function validateCategoryName(value: string): string {
  const name = normalizeCategoryName(value);
  if (!name) throw new Error('نام دستهبندی را وارد کنید.');
  if (name.length > MAX_CATEGORY_NAME_LENGTH)
    throw new Error(`نام دستهبندی حداکثر ${MAX_CATEGORY_NAME_LENGTH} نویسه باشد.`);
  return name;
}

function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isCategoryList(value: unknown): value is ProductCategory[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ProductCategory).id === 'string' &&
        typeof (item as ProductCategory).name === 'string' &&
        typeof (item as ProductCategory).color === 'string',
    )
  );
}

/** فهرست پیشفرض برای اولین استفاده (پس از شخصیسازی دیگر بازساخته نمیشود) */
export function seedCategories(usedNames: string[] = []): ProductCategory[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of [...DEFAULT_PRODUCT_CATEGORIES, ...usedNames]) {
    const name = normalizeCategoryName(raw);
    const key = categoryKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.map((name, index) => ({
    id: `seed-${index}`,
    name,
    color: categoryColor(index),
  }));
}

/** افزودن یک نام به فهرست در صورت نبودن — نام دلخواه، بدون محدودیت محتوا */
export function withCategory(
  list: ProductCategory[],
  name: string,
  color?: string,
): ProductCategory[] {
  const clean = normalizeCategoryName(name);
  if (!clean) return list;
  const found = list.find((c) => sameCategory(c.name, clean));
  if (found) {
    if (!color || found.color === color) return list;
    return list.map((c) => (c.id === found.id ? { ...c, color } : c));
  }
  return [
    ...list,
    { id: `used-${categoryKey(clean)}`, name: clean, color: color ?? categoryColor(list.length) },
  ];
}

/**
 * فهرست قابل نمایش: تعریفهای ذخیرهشده + نامهایی که کالاها استفاده میکنند.
 * اگر تاکنون شخصیسازی انجام نشده، فهرست پیشفرض ساخته میشود (فقط در حافظه؛
 * هنگام اولین تغییر ذخیره میگردد).
 */
export function deriveCategories(stored: unknown, usedNames: string[] = []): ProductCategory[] {
  const base = isCategoryList(stored) ? stored : seedCategories(usedNames);
  // پاکسازی تعریفهای ذخیرهشده: نام خالی/تکراری یا رنگ نامعتبر نباید فیلترها را خراب کند
  const cleanBase: ProductCategory[] = [];
  for (const entry of base) {
    const name = normalizeCategoryName(entry.name);
    if (!name || cleanBase.some((c) => sameCategory(c.name, name))) continue;
    cleanBase.push({
      id:
        !entry.id || entry.id === ALL_CATEGORIES_FILTER || cleanBase.some((c) => c.id === entry.id)
          ? `imported-${cleanBase.length}-${categoryKey(name)}`
          : entry.id,
      name,
      color: /^#[0-9a-f]{6}$/i.test(entry.color) ? entry.color : categoryColor(cleanBase.length),
    });
  }
  let list = cleanBase;
  for (const name of usedNames) list = withCategory(list, name);
  return list;
}

export async function readStoredCategories(): Promise<ProductCategory[] | null> {
  const row = await db.settings.get(PRODUCT_CATEGORIES_KEY);
  return isCategoryList(row?.value) ? row!.value : null;
}

export async function persistCategories(list: ProductCategory[]): Promise<void> {
  await db.settings.put({ key: PRODUCT_CATEGORIES_KEY, value: list });
}

/** ثبت نام تازهای که کاربر هنگام ورود کالا تایپ کرده است (هر نامی مجاز است) */
export async function registerCategory(name: string, color?: string): Promise<void> {
  const clean = normalizeCategoryName(name);
  if (!clean) return;
  await db.transaction('rw', db.settings, async () => {
    const stored = await readStoredCategories();
    const base = stored ?? seedCategories([clean]);
    const next = withCategory(base, clean, color);
    if (next !== base) await persistCategories(next);
    else if (!stored) await persistCategories(base);
  });
}

export async function addCategory(
  categories: ProductCategory[],
  rawName: string,
  color: string,
): Promise<void> {
  const name = validateCategoryName(rawName);
  if (categories.some((c) => sameCategory(c.name, name)))
    throw new Error('دستهای با این نام از قبل وجود دارد.');
  await persistCategories([
    ...categories,
    {
      id: newId(),
      name,
      color: CATEGORY_COLORS.includes(color as (typeof CATEGORY_COLORS)[number])
        ? color
        : categoryColor(categories.length),
    },
  ]);
}

/** تغییر نام و رنگ؛ نام تازه روی تمام کالاهای آن دسته هم اعمال میشود */
export async function updateCategory(
  categories: ProductCategory[],
  id: string,
  rawName: string,
  color: string,
): Promise<void> {
  const name = validateCategoryName(rawName);
  const target = categories.find((c) => c.id === id);
  if (!target) throw new Error('دستهبندی پیدا نشد.');
  if (categories.some((c) => c.id !== id && sameCategory(c.name, name)))
    throw new Error('دستهای با این نام از قبل وجود دارد.');
  const next = categories.map((c) => (c.id === id ? { ...c, name, color } : c));
  await db.transaction('rw', db.settings, db.products, async () => {
    if (!sameCategory(target.name, name)) {
      await db.products
        .toCollection()
        .filter((product) => sameCategory(product.category, target.name))
        .modify({ category: name, updatedAt: nowISO() });
    }
    await persistCategories(next);
  });
}

/**
 * حذف دسته؛ کالاهای آن به `fallbackName` منتقل میشوند تا هیچ کالای بدون
 * دستهبندی معتبر باقی نماند. دستهی مقصد در صورت نیاز ساخته میشود.
 */
export async function removeCategory(
  categories: ProductCategory[],
  id: string,
  fallbackName: string,
): Promise<void> {
  const target = categories.find((c) => c.id === id);
  if (!target) throw new Error('دستهبندی پیدا نشد.');
  const fallback = normalizeCategoryName(fallbackName) || DEFAULT_CATEGORY_NAME;
  const next = withCategory(
    categories.filter((c) => c.id !== id),
    fallback,
  );
  await db.transaction('rw', db.settings, db.products, async () => {
    if (!sameCategory(target.name, fallback)) {
      await db.products
        .toCollection()
        .filter((product) => sameCategory(product.category, target.name))
        .modify({ category: fallback, updatedAt: nowISO() });
    }
    await persistCategories(next);
  });
}

/** رنگ یک نام دسته (برای کالاهای قدیمی همیشه یک رنگ پیشفرض برمیگردد) */
export function colorForCategory(categories: ProductCategory[], name: string): string {
  return (
    categories.find((c) => sameCategory(c.name, name))?.color ??
    categoryColor(normalizeCategoryName(name).length)
  );
}
