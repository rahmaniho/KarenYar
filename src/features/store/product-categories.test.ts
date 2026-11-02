import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/db';
import { exportBackup, importBackup } from '@/core/db/backup';
import { testProduct, clearTestData } from '@/tests/store-fixtures';
import { DEFAULT_PRODUCT_CATEGORIES } from '@/features/personal/categories';
import {
  ALL_CATEGORIES_FILTER,
  CATEGORY_COLORS,
  MAX_CATEGORY_NAME_LENGTH,
  PRODUCT_CATEGORIES_KEY,
  addCategory,
  categoryKey,
  deriveCategories,
  isCategoryList,
  normalizeCategoryName,
  readStoredCategories,
  registerCategory,
  removeCategory,
  sameCategory,
  updateCategory,
  validateCategoryName,
  withCategory,
  type ProductCategory,
} from './product-categories';

const cat = (id: string, name: string, color: string = CATEGORY_COLORS[0]): ProductCategory => ({
  id,
  name,
  color,
});

describe('نام دستهبندی (هر نام دلخواه)', () => {
  it('فقط فاصلهها نرمال میشوند و محتوای نام دستنخورده میماند', () => {
    expect(normalizeCategoryName('  قطعات   یدکی  ')).toBe('قطعات یدکی');
    expect(normalizeCategoryName('ماشین\u200cحساب')).toBe('ماشین\u200cحساب');
    expect(normalizeCategoryName('My Category 🚀')).toBe('My Category 🚀');
    expect(sameCategory('خواربار', ' خواربار ')).toBe(true);
    expect(sameCategory('لوازم جانبی', 'لوازم\u200cجانبی')).toBe(true);
    expect(sameCategory('My Category', 'my category')).toBe(true);
    expect(sameCategory('كالا', 'کالا')).toBe(true);
    expect(normalizeCategoryName('لوازم\u200cجانبی')).toBe('لوازم\u200cجانبی');
  });

  it('دستهای به نام all قابل ساخت است و با مقدار فیلتر «همه» تداخل ندارد', () => {
    const list = withCategory([cat('a', 'عمومی')], 'all');
    const all = list.find((c) => c.name === 'all')!;
    expect(all.id).not.toBe(ALL_CATEGORIES_FILTER);
    expect(all.id).not.toBe('all');
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
  });

  it('فهرست خراب/تکراری پاکسازی میشود و شناسهها یکتا میمانند', () => {
    const list = deriveCategories([
      cat('dup', 'عمومی'),
      cat('dup', 'لوازم', 'bad-color'),
      cat('x', '  '),
      cat('ok', 'My Category', CATEGORY_COLORS[2]),
      cat(ALL_CATEGORIES_FILTER, 'رزرو شده'),
    ]);
    expect(list.map((c) => c.name)).toEqual(['عمومی', 'لوازم', 'My Category', 'رزرو شده']);
    expect(new Set(list.map((c) => c.id)).size).toBe(4);
    expect(list.some((c) => c.id === ALL_CATEGORIES_FILTER)).toBe(false);
    expect(list[1].color).toBe(CATEGORY_COLORS[1]);
    expect(categoryKey('  محصولات   فصلی ')).toBe(categoryKey('محصولات فصلی'));
  });

  it('نام خالی و خیلی بلند رد میشود', () => {
    expect(() => validateCategoryName('   ')).toThrow('وارد کنید');
    expect(() => validateCategoryName('x'.repeat(MAX_CATEGORY_NAME_LENGTH + 1))).toThrow('حداکثر');
    expect(validateCategoryName('  محصولات فصلی  ')).toBe('محصولات فصلی');
  });

  it('withCategory نام تازه (حتی لاتین/اموجی) اضافه میکند و تکراری نسازد', () => {
    const list = [cat('a', 'عمومی')];
    const next = withCategory(list, 'My Category 🚀', CATEGORY_COLORS[2]);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ name: 'My Category 🚀', color: CATEGORY_COLORS[2] });
    expect(withCategory(next, 'my category 🚀')).toBe(next);
    expect(withCategory(next, 'عمومی', CATEGORY_COLORS[3])[0].color).toBe(CATEGORY_COLORS[3]);
  });
});

describe('فهرست مشتقشده (سازگاری با کالاهای قدیمی)', () => {
  it('بدون تعریف ذخیرهشده، پیشفرضها و دستههای کالاها را نشان میدهد', () => {
    const list = deriveCategories(null, ['عمومی', 'قطعات یدکی', 'قطعات یدکی']);
    expect(list.map((c) => c.name)).toContain(DEFAULT_PRODUCT_CATEGORIES[0]);
    expect(list.map((c) => c.name)).toContain('قطعات یدکی');
    expect(new Set(list.map((c) => c.name)).size).toBe(list.length);
    expect(isCategoryList(list)).toBe(true);
  });

  it('دستههای حذفشده توسط کاربر دوباره ساخته نمیشوند، ولی دستههای کالاها حفظ میشوند', () => {
    const stored = [cat('a', 'فقط من', CATEGORY_COLORS[4])];
    const list = deriveCategories(stored, ['فقط من', 'دستهی قدیمی']);
    expect(list.map((c) => c.name)).toEqual(['فقط من', 'دستهی قدیمی']);
    expect(list[0].color).toBe(CATEGORY_COLORS[4]);
    expect(deriveCategories([], ['A']).map((c) => c.name)).toEqual(['A']);
  });
});

describe('دفتر دستهبندیها در دیتابیس', () => {
  beforeEach(clearTestData);

  it('ثبت نام دلخواه هنگام ورود کالا، تعریف قابل شخصیسازی میسازد', async () => {
    await registerCategory('قطعات یدکی 🚀');
    const stored = await readStoredCategories();
    expect(stored?.some((c) => c.name === 'قطعات یدکی 🚀')).toBe(true);
    await registerCategory('قطعات یدکی 🚀');
    expect((await readStoredCategories())?.filter((c) => c.name === 'قطعات یدکی 🚀')).toHaveLength(
      1,
    );
    const row = await db.settings.get(PRODUCT_CATEGORIES_KEY);
    expect(row?.key).toBe(PRODUCT_CATEGORIES_KEY);
  });

  it('افزودن دسته با نام تکراری یا خالی رد میشود', async () => {
    const list = deriveCategories(null, []);
    await addCategory(list, 'لوازم جانبی', CATEGORY_COLORS[1]);
    const stored = (await readStoredCategories()) ?? [];
    await expect(addCategory(stored, 'لوازم جانبی', CATEGORY_COLORS[2])).rejects.toThrow(
      'وجود دارد',
    );
    await expect(addCategory(stored, '   ', CATEGORY_COLORS[2])).rejects.toThrow('وارد کنید');
  });

  it('تغییر نام و رنگ، کالاهای همان دسته را هم بهروز میکند', async () => {
    await db.products.bulkAdd([
      testProduct({ name: 'کالا ۱', category: 'قدیمی' }),
      testProduct({ name: 'کالا ۲', category: 'قدیمی' }),
      testProduct({ name: 'کالا ۳', category: 'دیگر' }),
    ]);
    const list = deriveCategories(null, ['قدیمی', 'دیگر']);
    const target = list.find((c) => c.name === 'قدیمی')!;
    await updateCategory(list, target.id, 'تازه و شخصی', CATEGORY_COLORS[5]);
    const stored = await readStoredCategories();
    expect(stored?.find((c) => c.id === target.id)).toMatchObject({
      name: 'تازه و شخصی',
      color: CATEGORY_COLORS[5],
    });
    const products = await db.products.toArray();
    expect(products.filter((p) => p.category === 'تازه و شخصی')).toHaveLength(2);
    expect(products.find((p) => p.name === 'کالا ۳')?.category).toBe('دیگر');
  });

  it('حذف دسته، کالاها را به دستهی جایگزین منتقل میکند', async () => {
    await db.products.bulkAdd([
      testProduct({ name: 'کالا ۱', category: 'حذفی' }),
      testProduct({ name: 'کالا ۲', category: 'حذفی' }),
    ]);
    const list = deriveCategories(null, ['حذفی', 'عمومی']);
    const target = list.find((c) => c.name === 'حذفی')!;
    await removeCategory(list, target.id, 'عمومی');
    const stored = await readStoredCategories();
    expect(stored?.some((c) => c.name === 'حذفی')).toBe(false);
    expect(stored?.some((c) => c.name === 'عمومی')).toBe(true);
    expect((await db.products.toArray()).every((p) => p.category === 'عمومی')).toBe(true);
  });

  it('تعریف دستهها در پشتیبانگیری و بازیابی حفظ میشود', async () => {
    await registerCategory('دستهمخصوصمن');
    await db.products.add(testProduct({ name: 'کالای دستهدار', category: 'دستهمخصوصمن' }));
    const backup = await exportBackup();
    await clearTestData();
    await importBackup(backup);
    const stored = await readStoredCategories();
    expect(stored?.some((c) => c.name === 'دستهمخصوصمن')).toBe(true);
    expect((await db.products.toArray())[0]?.category).toBe('دستهمخصوصمن');
  });
});
