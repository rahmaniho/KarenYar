import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { seedDemoData } from './seed';
import { clearTestData } from '@/tests/store-fixtures';

describe('دادهٔ نمایشی کسب‌وکار', () => {
  beforeEach(clearTestData);

  it('فروش‌های نمونه درآمد متناظر و موجودی منطبق با گردش انبار دارند', async () => {
    expect(await seedDemoData()).toEqual({ products: 5, invoices: 5 });
    const invoices = await db.invoices.toArray();
    const income = await db.transactions.where('source').equals('sale').toArray();
    expect(income).toHaveLength(5);
    for (const invoice of invoices) {
      expect(invoice.status).toBe('completed');
      expect(income.filter((row) => row.invoiceId === invoice.id)).toEqual([
        expect.objectContaining({ type: 'income', amount: invoice.total }),
      ]);
    }
    for (const product of await db.products.toArray()) {
      const movements = await db.stockMovements.where('productId').equals(product.id!).toArray();
      expect(movements.some((row) => row.type === 'opening')).toBe(true);
      expect(movements.reduce((sum, row) => sum + row.quantity, 0)).toBe(product.stock);
      expect(product.stock).toBeGreaterThanOrEqual(0);
    }
  });
});
