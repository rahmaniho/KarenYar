import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/db';
import { clearTestData, testProduct, testSale } from '@/tests/store-fixtures';
import { createInvoice, voidInvoice } from './invoice.service';
import {
  deleteInvoicePayment,
  recordInvoicePayment,
  refundInvoicePayment,
} from './invoice-payment.service';
import { invoicePaymentState } from './invoice-domain';
import { customerBalance } from './customers-calc';

beforeEach(clearTestData);

async function creditInvoice() {
  const productId = (await db.products.add(testProduct({ stock: 20 }))) as number;
  const customerId = (await db.customers.add({
    name: 'خریدار آزمایشی',
    createdAt: new Date().toISOString(),
  })) as number;
  const invoiceId = await createInvoice(
    testSale(productId, { customerId, paymentMethod: 'credit', discountValue: 0, taxPercent: 0 }),
  );
  return { productId, customerId, invoiceId };
}

describe('دریافت، تکرار درخواست و برگشت وجه', () => {
  it('پرداخت جزئی و چند پرداخت، مانده و حساب مشتری را درست می‌کنند', async () => {
    const { invoiceId, customerId } = await creditInvoice();
    await recordInvoicePayment({ invoiceId, amount: 50_000, method: 'cash', reference: 'REF-1' });
    await recordInvoicePayment({ invoiceId, amount: 150_000, method: 'transfer' });
    const state = invoicePaymentState(
      (await db.invoices.get(invoiceId))!,
      await db.customerPayments.toArray(),
    );
    expect(state).toMatchObject({ paid: 200_000, remaining: 0, status: 'paid' });
    expect(
      customerBalance(customerId, await db.invoices.toArray(), await db.customerPayments.toArray())
        .balance,
    ).toBe(0);
    expect(await db.transactions.count()).toBe(1);
    expect(await db.financialEvents.where('action').equals('payment_recorded').count()).toBe(2);
  });
  it('ارسال هم‌زمان یک کلید فقط یک دریافت می‌سازد و متن طولانی کلید را نمی‌برد', async () => {
    const { invoiceId } = await creditInvoice();
    const input = {
      invoiceId,
      amount: 10_000,
      idempotencyKey: 'stable-key',
      note: 'یادداشت'.repeat(20),
      reference: '۱۲۳۴۵',
    };
    const [a, b] = await Promise.all([recordInvoicePayment(input), recordInvoicePayment(input)]);
    expect(a).toBe(b);
    expect(await db.customerPayments.count()).toBe(1);
    expect((await db.customerPayments.get(a))?.paymentKey).toBe('stable-key');
    await expect(recordInvoicePayment({ ...input, amount: 11_000 })).rejects.toThrow(
      'اطلاعات دیگری',
    );
  });
  it('کلید یک پرداخت برای فاکتور دیگر استفاده نمی‌شود', async () => {
    const { invoiceId, productId, customerId } = await creditInvoice();
    const other = await createInvoice(testSale(productId, { customerId, paymentMethod: 'credit' }));
    await recordInvoicePayment({ invoiceId, amount: 1000, idempotencyKey: 'same-key' });
    await expect(
      recordInvoicePayment({ invoiceId: other, amount: 1000, idempotencyKey: 'same-key' }),
    ).rejects.toThrow('اطلاعات دیگری');
  });
  it('مبلغ کسری، اضافه‌پرداخت و پرداخت فاکتور نقدی رد می‌شوند', async () => {
    const { invoiceId, productId } = await creditInvoice();
    await expect(recordInvoicePayment({ invoiceId, amount: 1.5 })).rejects.toThrow('تومان صحیح');
    await expect(recordInvoicePayment({ invoiceId, amount: 200_001 })).rejects.toThrow('مانده');
    const cash = await createInvoice(testSale(productId, { paymentMethod: 'card' }));
    await expect(recordInvoicePayment({ invoiceId: cash, amount: 1000 })).rejects.toThrow('تسویه');
  });
  it('برگشت وجه، دریافت خالص و بدهی را اصلاح می‌کند؛ تکرار کلید بی‌اثر است', async () => {
    const { invoiceId, customerId } = await creditInvoice();
    await recordInvoicePayment({ invoiceId, amount: 200_000 });
    const input = {
      invoiceId,
      amount: 40_000,
      reason: 'برگشت وجه اضافی',
      idempotencyKey: 'refund-1',
    };
    const first = await refundInvoicePayment(input);
    expect(await refundInvoicePayment(input)).toBe(first);
    const state = invoicePaymentState(
      (await db.invoices.get(invoiceId))!,
      await db.customerPayments.toArray(),
    );
    expect(state).toMatchObject({
      received: 200_000,
      refunded: 40_000,
      paid: 160_000,
      remaining: 40_000,
    });
    expect(
      customerBalance(customerId, await db.invoices.toArray(), await db.customerPayments.toArray())
        .balance,
    ).toBe(40_000);
    await expect(
      refundInvoicePayment({ invoiceId, amount: 200_000, reason: 'برگشت بیش از دریافت' }),
    ).rejects.toThrow('بیشتر');
  });
  it('ابطال دریافت را پاک نمی‌کند و پس از ابطال می‌توان وجه را برگرداند', async () => {
    const { invoiceId, customerId } = await creditInvoice();
    await recordInvoicePayment({ invoiceId, amount: 200_000 });
    await voidInvoice(invoiceId, 'انصراف مشتری');
    expect(await db.customerPayments.count()).toBe(1);
    await refundInvoicePayment({
      invoiceId,
      amount: 200_000,
      reason: 'تسویه با مشتری پس از ابطال',
    });
    expect(
      customerBalance(customerId, await db.invoices.toArray(), await db.customerPayments.toArray())
        .balance,
    ).toBe(0);
    const state = invoicePaymentState(
      (await db.invoices.get(invoiceId))!,
      await db.customerPayments.toArray(),
    );
    expect(state).toMatchObject({ paid: 0, remaining: 0, refunded: 200_000 });
  });
  it('اصلاح پرداخت، سند معکوس می‌سازد و حذف فیزیکی/تکرار معکوس ندارد', async () => {
    const { invoiceId } = await creditInvoice();
    const id = await recordInvoicePayment({ invoiceId, amount: 50_000 });
    await deleteInvoicePayment(id, 'اشتباه در مبلغ');
    await deleteInvoicePayment(id, 'تلاش دوباره');
    expect(await db.customerPayments.count()).toBe(2);
    expect(await db.customerPayments.where('kind').equals('refund').count()).toBe(1);
    expect(
      invoicePaymentState((await db.invoices.get(invoiceId))!, await db.customerPayments.toArray())
        .remaining,
    ).toBe(200_000);
  });
});
