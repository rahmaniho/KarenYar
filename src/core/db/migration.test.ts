import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { HesabyarDB } from './db';
import { testProduct } from '@/tests/store-fixtures';

it('ارتقای نسخه ۲، کالا و فاکتور و درآمد دستی قبلی را بدون دوباره‌شماری حفظ می‌کند', async () => {
  const name = `migration-${Date.now()}-${Math.random()}`;
  const legacy = new Dexie(name);
  legacy.version(2).stores({
    products: '++id, name, barcode, category, stock',
    invoices: '++id, date, number, total, customerId',
    invoiceItems: '++id, invoiceId, productId',
    transactions: '++id, date, type, category, amount',
    budgets: '++id, month, category',
    debts: '++id, dueDate',
    employees: '++id, name',
    payrolls: '++id, employeeId, month',
    settings: 'key',
    license: 'key',
    customers: '++id, name, phone',
    customerPayments: '++id, customerId, invoiceId, date',
  });
  await legacy.table('products').add(testProduct({ id: 1, stock: 7 }));
  await legacy.table('invoices').add({ number: 1, date: '2026-01-01', total: 100_000 });
  await legacy.table('transactions').add({
    type: 'income',
    category: 'فروش ثبت‌شده توسط کاربر',
    amount: 100_000,
    date: '2026-01-01',
    createdAt: '2026-01-01',
  });
  legacy.close();
  const upgraded = new HesabyarDB(name);
  try {
    await upgraded.open();
    expect(upgraded.verno).toBe(3);
    expect((await upgraded.products.get(1))?.stock).toBe(7);
    expect(await upgraded.invoices.count()).toBe(1);
    expect(await upgraded.transactions.count()).toBe(1);
    expect(await upgraded.stockMovements.toArray()).toEqual([
      expect.objectContaining({ type: 'opening', quantity: 7, stockAfter: 7 }),
    ]);
    expect(await upgraded.heldSales.count()).toBe(0);
  } finally {
    await upgraded.delete();
  }
});
