import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { exportBackup, importBackup, validateBackup, type BackupData } from './backup';
import { clearTestData, testProduct, testSale } from '@/tests/store-fixtures';
import { createInvoice, voidInvoice } from '@/features/store/invoice.service';
import { saveProduct } from '@/features/store/inventory.service';

describe('پشتیبان‌گیری و بازیابی', () => {
  beforeEach(clearTestData);

  it('ساختار یا نسخهٔ نامعتبر رد می‌شود', () => {
    expect(() => validateBackup(null)).toThrow('معتبر نیست');
    expect(() => validateBackup({ format: 'other' })).toThrow('پشتیبان حساب‌یار');
    expect(() =>
      validateBackup({ format: 'karenyar-hesabyar-backup', version: 1, tables: {} }),
    ).toThrow('یافت نشد');
    expect(() =>
      validateBackup({ format: 'karenyar-hesabyar-backup', version: 999, tables: {} }),
    ).toThrow('نسخه');
  });

  it('خروجی و بازیابی رفت‌وبرگشت داده‌های قبلی را حفظ می‌کند', async () => {
    await db.products.add(testProduct({ name: 'کالای آزمایشی', stock: 3 }));
    await db.transactions.add({
      date: '2026-10-01',
      type: 'income',
      category: 'فروش',
      amount: 5000,
      createdAt: '2026-10-01T12:00:00Z',
    });
    const backup = await exportBackup();
    expect(backup.format).toBe('karenyar-hesabyar-backup');
    expect(backup.version).toBe(2);
    expect(backup.tables.products).toHaveLength(1);
    expect(backup.tables).not.toHaveProperty('license');
    await clearTestData();
    await importBackup(backup);
    expect((await exportBackup()).tables).toEqual(backup.tables);
  });

  it('فروش، ابطال، درآمد، گردش انبار، سبد معلق و کلید جلوگیری از تکرار حفظ می‌شوند', async () => {
    const productId = await saveProduct(testProduct());
    const sale = testSale(productId, { checkoutKey: 'backup-active-sale' });
    const invoiceId = await createInvoice(sale);
    const voidedId = await createInvoice(testSale(productId, { checkoutKey: 'backup-voided' }));
    await voidInvoice(voidedId, 'ابطال پیش از پشتیبان‌گیری');
    await db.heldSales.add({
      items: sale.items,
      discountType: 'percent',
      discountValue: 0,
      taxPercent: 10,
      customerId: null,
      customerName: '',
      note: 'سبد نگه‌داشته‌شده',
      checkoutKey: 'backup-held-sale',
      label: 'مشتری گذری',
      createdAt: '2026-10-01T12:00:00Z',
    });
    const backup = await exportBackup();
    expect(backup.tables.stockMovements).toHaveLength(4);
    expect(backup.tables.heldSales).toHaveLength(1);
    await clearTestData();
    await db.license.put({ key: 'local-test-license', value: 'must-not-be-replaced' });
    await importBackup(backup);
    expect((await exportBackup()).tables).toEqual(backup.tables);
    expect((await db.license.get('local-test-license'))?.value).toBe('must-not-be-replaced');
    expect(await createInvoice(sale)).toBe(invoiceId);
    expect(await db.transactions.where('source').equals('sale').count()).toBe(1);
    expect((await db.products.get(productId))?.stock).toBe(8);
    expect((await db.invoices.get(voidedId))?.status).toBe('voided');
  });

  it('پشتیبان نسخهٔ یک بدون جدول‌های تازه بازیابی می‌شود؛ موجودی مبنا دارد ولی درآمد تکراری ندارد', async () => {
    const productId = (await db.products.add(testProduct())) as number;
    await createInvoice(testSale(productId));
    await db.transactions.clear();
    await db.transactions.add({
      type: 'income',
      category: 'فروش دستی قدیمی',
      amount: 198_000,
      date: '2026-10-01',
      createdAt: '2026-10-01T12:00:00Z',
    });
    const backup = await exportBackup();
    const tables: Record<string, unknown[]> = { ...backup.tables };
    for (const name of ['customers', 'customerPayments', 'stockMovements', 'heldSales'])
      delete tables[name];
    const legacy = { ...backup, version: 1, tables };
    const validated = validateBackup(legacy);
    expect(legacy.tables).not.toHaveProperty('heldSales');
    expect(validated.tables.heldSales).toEqual([]);
    await importBackup(validated);
    expect((await db.products.get(productId))?.stock).toBe(8);
    expect(await db.invoices.count()).toBe(1);
    expect(await db.transactions.count()).toBe(1);
    expect(await db.transactions.where('source').equals('sale').count()).toBe(0);
    expect(await db.stockMovements.toArray()).toEqual([
      expect.objectContaining({
        productId,
        type: 'opening',
        stockBefore: 0,
        stockAfter: 8,
        quantity: 8,
      }),
    ]);
    expect(await db.heldSales.count()).toBe(0);
  });

  it('جدول خراب قدیمی و جدول حذف‌شدهٔ نسخهٔ جدید بی‌صدا پاک نمی‌شوند', async () => {
    const backup = await exportBackup();
    const tables: Record<string, unknown> = { ...backup.tables };
    delete tables.stockMovements;
    expect(() => validateBackup({ ...backup, tables })).toThrow('stockMovements');
    expect(() =>
      validateBackup({ ...backup, version: 1, tables: { ...tables, stockMovements: {} } }),
    ).toThrow('stockMovements');
  });

  it('شکست بازیابی پس از نوشتن چند جدول، تمام داده‌های فعلی را برمی‌گرداند', async () => {
    const productId = await saveProduct(testProduct());
    await createInvoice(testSale(productId, { checkoutKey: 'before-failed-restore' }));
    const before = await exportBackup();
    const broken = JSON.parse(JSON.stringify(before)) as BackupData;
    const income = (await db.transactions.toArray())[0]!;
    broken.tables.transactions.push({ ...income, id: 999_999 });
    await expect(importBackup(broken)).rejects.toThrow();
    expect((await exportBackup()).tables).toEqual(before.tables);
  });
});
