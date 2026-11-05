import { useCallback, useMemo } from 'react';
import { useLiveQuery } from '@/core/db/use-live-query';
import { db, type KeyValueRow, type Product } from '@/core/db/db';
import {
  PRODUCT_CATEGORIES_KEY,
  addCategory,
  deriveCategories,
  normalizeCategoryName,
  registerCategory,
  removeCategory,
  updateCategory,
} from './product-categories';

/**
 * تنها منبع دستهبندیها برای صفحات کالاها و انبار.
 * نامهای استفادهشده توسط کالاها همیشه در فهرستاند، حتی اگر تعریفی ذخیره نشده باشد.
 * هیچ نوشتنی هنگام رندر انجام نمیشود؛ فقط اقدامات کاربر مینویسند.
 */
export function useProductCategories(products: Product[]) {
  const row = useLiveQuery<KeyValueRow | undefined>(
    () => db.settings.get(PRODUCT_CATEGORIES_KEY),
    [],
  );

  const usedNames = useMemo(
    () => [...new Set(products.map((p) => normalizeCategoryName(p.category)).filter(Boolean))],
    [products],
  );

  const categories = useMemo(
    () => deriveCategories(row?.value, usedNames),
    [row?.value, usedNames],
  );

  const add = useCallback(
    (name: string, color: string) => addCategory(categories, name, color),
    [categories],
  );
  const update = useCallback(
    (id: string, name: string, color: string) => updateCategory(categories, id, name, color),
    [categories],
  );
  const remove = useCallback(
    (id: string, fallback: string) => removeCategory(categories, id, fallback),
    [categories],
  );
  const register = useCallback((name: string) => registerCategory(name), []);

  return { categories, usedNames, add, update, remove, register };
}
