import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/db';
import { clearTestData, testProduct, testSale } from '@/tests/store-fixtures';
import { createInvoice } from './invoice.service';
import { changeStock, deleteProduct, saveProduct } from './inventory.service';

beforeEach(clearTestData);

describe('گردش و موجودی انبار', () => {
  it('ثبت کالا، موجودی اولیه و اصلاح از فرم کالا را در تاریخچه نگه می‌دارد', async () => {
    const payload = testProduct();
    const id = await saveProduct(payload);
    expect(await db.stockMovements.toArray()).toEqual([
      expect.objectContaining({ type: 'opening', stockAfter: 10, quantity: 10 }),
    ]);
    await saveProduct({ ...payload, stock: 15 }, id, 10);
    expect((await db.products.get(id))?.stock).toBe(15);
    expect(await db.stockMovements.where('type').equals('adjustment').first()).toMatchObject({
      stockBefore: 10,
      stockAfter: 15,
      quantity: 5,
    });
  });

  it('ورود هم‌زمان کالا هیچ تغییر موجودی را گم نمی‌کند', async () => {
    const id = await saveProduct(testProduct());
    await Promise.all([
      changeStock(id, 3, 'restock', 'محموله اول'),
      changeStock(id, 4, 'restock', 'محموله دوم'),
    ]);
    expect((await db.products.get(id))?.stock).toBe(17);
    expect(await db.stockMovements.where('type').equals('restock').count()).toBe(2);
  });

  it('کسر بیش از موجودی و مقدار نامعتبر را رد می‌کند', async () => {
    const id = await saveProduct(testProduct());
    await expect(changeStock(id, -11, 'adjustment', 'اصلاح شمارش')).rejects.toThrow('منفی');
    await expect(changeStock(id, NaN, 'restock', 'ورود تستی')).rejects.toThrow('معتبر');
    await expect(changeStock(id, 1, 'restock', '')).rejects.toThrow('شرح');
    expect((await db.products.get(id))?.stock).toBe(10);
    expect(await db.stockMovements.count()).toBe(1);
  });

  it('ویرایش مشخصات با فرم قدیمی، موجودی کم‌شده توسط فروش را بازنویسی نمی‌کند', async () => {
    const payload = testProduct();
    const id = await saveProduct(payload);
    await createInvoice(testSale(id));
    await saveProduct({ ...payload, sellPrice: 120_000 }, id, 10);
    expect(await db.products.get(id)).toMatchObject({ stock: 8, sellPrice: 120_000 });
    await expect(saveProduct({ ...payload, stock: 15 }, id, 10)).rejects.toThrow('حین ویرایش');
    expect((await db.products.get(id))?.stock).toBe(8);
  });

  it('کالای دارای سابقه فروش حذف نمی‌شود', async () => {
    const id = await saveProduct(testProduct());
    await createInvoice(testSale(id));
    await expect(deleteProduct(id)).rejects.toThrow('سابقه');
    expect(await db.products.get(id)).toBeDefined();
  });

  it('بارکد تکراری حتی در ذخیره هم‌زمان پذیرفته نمی‌شود', async () => {
    const results = await Promise.allSettled([
      saveProduct(testProduct()),
      saveProduct(testProduct({ name: 'دوم' })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.products.count()).toBe(1);
  });

  it('گردش اعشاری بدون انباشت خطای شناور ثبت می‌شود', async () => {
    const id = await saveProduct(testProduct({ stock: 0.3, unit: 'کیلو' }));
    await changeStock(id, -0.1, 'adjustment', 'اصلاح وزن');
    expect((await db.products.get(id))?.stock).toBe(0.2);
  });
});

it('قیمت نامعتبر یا موجودی با بیش از شش رقم اعشار بدون هیچ تغییری رد می‌شود', async () => {
  await expect(saveProduct(testProduct({ shippingPerUnit: NaN }))).rejects.toThrow('معتبر');
  await expect(saveProduct(testProduct({ sellPrice: 1.5 }))).rejects.toThrow('تومان');
  await expect(saveProduct(testProduct({ stock: 0.0000001 }))).rejects.toThrow('شش رقم');
  expect(await db.products.count()).toBe(0);
  const id = await saveProduct(testProduct());
  await expect(changeStock(id, 0.1234567, 'restock', 'ورود با اعشار نامعتبر')).rejects.toThrow(
    'شش رقم',
  );
  expect((await db.products.get(id))?.stock).toBe(10);
});
