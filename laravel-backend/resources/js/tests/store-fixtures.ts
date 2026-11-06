import { db, type Product } from '@/core/db/db';
import type { NewInvoiceInput } from '@/features/store/invoice.service';

export const testProduct = (patch: Partial<Product> = {}): Omit<Product, 'id'> => ({
  name: 'کالای آزمایشی',
  barcode: '626000000001',
  category: 'عمومی',
  buyPrice: 60_000,
  buyTaxPercent: 0,
  shippingPerUnit: 0,
  overheadPerUnit: 0,
  costPrice: 60_000,
  sellPrice: 100_000,
  stock: 10,
  unit: 'عدد',
  minStock: 2,
  createdAt: '2026-10-01T12:00:00Z',
  updatedAt: '2026-10-01T12:00:00Z',
  ...patch,
});

export async function clearTestData() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}

export const testSale = (
  productId: number,
  patch: Partial<NewInvoiceInput> = {},
): NewInvoiceInput => ({
  items: [{ productId, name: 'کالای آزمایشی', qty: 2, unitPrice: 100_000 }],
  discountType: 'percent',
  discountValue: 10,
  taxPercent: 10,
  paymentMethod: 'card',
  source: 'pos',
  ...patch,
});
