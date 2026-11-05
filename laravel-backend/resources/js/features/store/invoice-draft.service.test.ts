import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/db';
import { clearTestData, testProduct, testSale } from '@/tests/store-fixtures';
import {
  copyInvoiceToDraft,
  createInvoice,
  discardInvoiceDraft,
  issueInvoice,
  saveInvoiceDraft,
} from './invoice.service';
import { recordInvoicePayment } from './invoice-payment.service';

beforeEach(clearTestData);

describe('پیش‌نویس، ویرایش و صدور', () => {
  it('پیش‌نویس خالی هم ذخیره می‌شود ولی هیچ اثر مالی یا انباری ندارد', async () => {
    const productId = (await db.products.add(testProduct())) as number;
    const id = await saveInvoiceDraft({
      items: [],
      discountType: 'percent',
      discountValue: 0,
      taxPercent: 0,
    });
    expect(await db.invoices.get(id)).toMatchObject({ status: 'draft', number: 1 });
    expect((await db.products.get(productId))?.stock).toBe(10);
    expect(await db.transactions.count()).toBe(0);
    await expect(issueInvoice(id, 1)).rejects.toThrow('خالی');
  });
  it('ویرایش هم‌زمان با نسخهٔ قدیمی رد می‌شود و صدور فقط یک‌بار اثر دارد', async () => {
    const productId = (await db.products.add(testProduct({ stock: 5 }))) as number;
    const input = testSale(productId, { discountValue: 0, taxPercent: 0 });
    const id = await saveInvoiceDraft(input);
    const updated = await saveInvoiceDraft(
      { ...input, items: [{ ...input.items[0], qty: 1 }] },
      id,
      1,
    );
    expect(updated).toBe(id);
    await expect(saveInvoiceDraft(input, id, 1)).rejects.toThrow('تغییر کرده');
    expect(await issueInvoice(id, 2)).toBe(id);
    expect(await issueInvoice(id, 2)).toBe(id);
    expect((await db.products.get(productId))?.stock).toBe(4);
    expect(await db.transactions.count()).toBe(1);
    expect(await db.invoiceItems.count()).toBe(1);
    expect(await db.invoices.get(id)).toMatchObject({
      status: 'completed',
      number: 1,
      total: 100_000,
    });
  });
  it('کمبود موجودی هنگام صدور، پیش‌نویس را از بین نمی‌برد', async () => {
    const productId = (await db.products.add(testProduct({ stock: 1 }))) as number;
    const id = await saveInvoiceDraft(testSale(productId));
    await expect(issueInvoice(id, 1)).rejects.toThrow('کافی نیست');
    expect(await db.invoices.get(id)).toMatchObject({ status: 'draft', revision: 1 });
    expect(await db.transactions.count()).toBe(0);
    expect((await db.products.get(productId))?.stock).toBe(1);
  });
  it('کپی سند، پیش‌نویس مستقل بدون پرداخت و با شمارهٔ تازه است', async () => {
    const productId = (await db.products.add(testProduct())) as number;
    const customerId = (await db.customers.add({
      name: 'خریدار',
      createdAt: new Date().toISOString(),
    })) as number;
    const id = await createInvoice(testSale(productId, { customerId, paymentMethod: 'credit' }));
    await recordInvoicePayment({ invoiceId: id, amount: 1000 });
    const copy = await copyInvoiceToDraft(id);
    expect(copy).not.toBe(id);
    const draft = await db.invoices.get(copy);
    expect(draft).toMatchObject({ status: 'draft', number: 2, total: 198_000 });
    expect(draft?.checkoutKey).not.toBe((await db.invoices.get(id))?.checkoutKey);
    expect(await db.customerPayments.where('invoiceId').equals(copy).count()).toBe(0);
    expect(await db.transactions.count()).toBe(1);
  });
  it('حذف پیش‌نویس رویداد دارد ولی سند صادرشده را حذف نمی‌کند', async () => {
    const id = await saveInvoiceDraft({
      items: [],
      discountType: 'percent',
      discountValue: 0,
      taxPercent: 0,
    });
    await discardInvoiceDraft(id, 1);
    expect(await db.invoices.get(id)).toBeUndefined();
    expect(await db.financialEvents.where('action').equals('draft_discarded').count()).toBe(1);
    const productId = (await db.products.add(testProduct())) as number;
    const issued = await createInvoice(testSale(productId));
    await expect(discardInvoiceDraft(issued, 1)).rejects.toThrow('فقط پیش‌نویس');
  });
});
