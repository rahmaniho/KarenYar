import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { exportBackup, importBackup, validateBackup } from './backup';

describe('پشتیبان‌گیری و بازیابی', () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.transactions.clear();
  });

  it('ساختار فایل نامعتبر رد می‌شود', () => {
    expect(() => validateBackup(null)).toThrow('معتبر نیست');
    expect(() => validateBackup({ format: 'other' })).toThrow('پشتیبان حساب‌یار');
    expect(() =>
      validateBackup({ format: 'karenyar-hesabyar-backup', version: 1, tables: {} }),
    ).toThrow('یافت نشد');
  });

  it('خروجی و بازیابی رفت‌وبرگشت داده‌ها را حفظ می‌کند', async () => {
    await db.products.add({
      name: 'کالای آزمایشی',
      category: 'عمومی',
      buyPrice: 1000,
      costPrice: 1100,
      sellPrice: 2000,
      stock: 3,
      unit: 'عدد',
      minStock: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.transactions.add({
      date: new Date().toISOString(),
      type: 'income',
      category: 'فروش',
      amount: 5000,
      createdAt: new Date().toISOString(),
    });

    const backup = await exportBackup();
    expect(backup.format).toBe('karenyar-hesabyar-backup');
    expect(backup.tables.products).toHaveLength(1);
    // لایسنس نباید در پشتیبان باشد
    expect(backup.tables).not.toHaveProperty('license');

    await db.products.clear();
    await db.transactions.clear();
    expect(await db.products.count()).toBe(0);

    await importBackup(backup);
    expect(await db.products.count()).toBe(1);
    expect(await db.transactions.count()).toBe(1);
    const [product] = await db.products.toArray();
    expect(product.name).toBe('کالای آزمایشی');
  });
});
