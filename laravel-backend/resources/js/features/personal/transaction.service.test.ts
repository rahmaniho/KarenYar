import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from '@/core/db/db';
import { clearTestData, testProduct, testSale } from '@/tests/store-fixtures';
import { createInvoice } from '@/features/store/invoice.service';
import { deleteManualTransaction, saveManualTransaction } from './transaction.service';

beforeEach(clearTestData);
const input = {
  type: 'expense' as const,
  category: 'اجاره',
  amount: 10_000,
  date: '2026-10-28',
  source: 'business' as const,
};

it('درآمد خودکار فروش از فرم تراکنش قابل حذف یا ویرایش نیست', async () => {
  const productId = (await db.products.add(testProduct())) as number;
  await createInvoice(testSale(productId));
  const transaction = (await db.transactions.toArray())[0];
  await expect(deleteManualTransaction(transaction.id!)).rejects.toThrow('فاکتور');
  await expect(saveManualTransaction(input, transaction.id!)).rejects.toThrow('فاکتور');
  expect((await db.transactions.get(transaction.id!))?.amount).toBe(198_000);
});

it('هزینه کسب‌وکار به‌صورت مستقل ایجاد، ویرایش و حذف می‌شود', async () => {
  await saveManualTransaction(input);
  const transaction = (await db.transactions.toArray())[0];
  expect(transaction.source).toBe('business');
  await saveManualTransaction({ ...input, amount: 20_000 }, transaction.id);
  expect((await db.transactions.get(transaction.id!))?.amount).toBe(20_000);
  await deleteManualTransaction(transaction.id!);
  expect(await db.transactions.count()).toBe(0);
});

it('مبلغ نامتناهی و تاریخ نامعتبر در دفتر مالی پذیرفته نمی‌شود', async () => {
  await expect(saveManualTransaction({ ...input, amount: Infinity })).rejects.toThrow('معتبر');
  await expect(saveManualTransaction({ ...input, date: 'invalid' })).rejects.toThrow('معتبر');
});

it('ویرایش هزینه کسب‌وکار از دفتر سراسری، منشأ کسب‌وکار را حفظ می‌کند', async () => {
  await saveManualTransaction(input);
  const row = (await db.transactions.toArray())[0];
  await saveManualTransaction({ ...input, source: 'manual', amount: 12_000 }, row.id);
  expect(await db.transactions.get(row.id!)).toMatchObject({ source: 'business', amount: 12_000 });
});
