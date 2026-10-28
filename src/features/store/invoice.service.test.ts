import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db/db';
import { clearTestData, testProduct, testSale } from '@/tests/store-fixtures';
import { createInvoice, voidInvoice } from './invoice.service';
import { customerBalance } from './customers-calc';
import { salesTotals } from './store-calc';

beforeEach(clearTestData);
afterEach(() => vi.restoreAllMocks());

async function product(stock = 10) {
  return (await db.products.add(testProduct({ stock }))) as number;
}

describe('ثبت یکپارچهٔ فروش و درآمد', () => {
  it('فاکتور، مالیات، تخفیف، موجودی، قیمت تمام‌شده و درآمد را با هم ذخیره می‌کند', async () => {
    const productId = await product();
    const id = await createInvoice(testSale(productId));
    expect(await db.products.get(productId)).toMatchObject({ stock: 8 });
    expect(await db.invoices.get(id)).toMatchObject({
      number: 1,
      total: 198_000,
      taxAmount: 18_000,
      discountAmount: 20_000,
      status: 'completed',
      source: 'pos',
      paymentMethod: 'card',
    });
    expect(await db.invoiceItems.where('invoiceId').equals(id).first()).toMatchObject({
      unitCost: 60_000,
      qty: 2,
      total: 200_000,
    });
    expect(await db.transactions.toArray()).toEqual([
      expect.objectContaining({ invoiceId: id, source: 'sale', type: 'income', amount: 198_000 }),
    ]);
    expect(await db.stockMovements.toArray()).toEqual([
      expect.objectContaining({
        invoiceId: id,
        quantity: -2,
        stockBefore: 10,
        stockAfter: 8,
        type: 'sale',
      }),
    ]);
  });

  it('کمبود قلم دوم تمام تغییرات قلم اول را هم برمی‌گرداند', async () => {
    const first = await product();
    const second = (await db.products.add(
      testProduct({ name: 'کالای دوم', barcode: 'second', stock: 1 }),
    )) as number;
    await expect(
      createInvoice(
        testSale(first, {
          items: [
            { productId: first, name: 'اول', qty: 2, unitPrice: 100_000 },
            { productId: second, name: 'دوم', qty: 2, unitPrice: 100_000 },
          ],
        }),
      ),
    ).rejects.toThrow('کافی نیست');
    expect((await db.products.get(first))?.stock).toBe(10);
    expect(await db.invoices.count()).toBe(0);
    expect(await db.invoiceItems.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.stockMovements.count()).toBe(0);
  });

  it('ردیف‌های تکراری یک کالا نمی‌توانند بیش از موجودی بفروشند', async () => {
    const id = await product(3);
    await expect(
      createInvoice(
        testSale(id, {
          items: [
            { productId: id, name: 'الف', qty: 2, unitPrice: 1 },
            { productId: id, name: 'الف', qty: 2, unitPrice: 1 },
          ],
        }),
      ),
    ).rejects.toThrow('کافی نیست');
    expect((await db.products.get(id))?.stock).toBe(3);
    expect(await db.transactions.count()).toBe(0);
  });

  it('فروش هم‌زمان از دو صندوق یا تب از موجودی منفی جلوگیری می‌کند', async () => {
    const id = await product(3);
    const results = await Promise.allSettled([
      createInvoice(testSale(id, { checkoutKey: 'tab-a' })),
      createInvoice(testSale(id, { checkoutKey: 'tab-b' })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.products.get(id))?.stock).toBe(1);
    expect(await db.transactions.count()).toBe(1);
  });

  it('یک checkoutKey حتی در ثبت هم‌زمان فقط یک فروش و یک درآمد می‌سازد', async () => {
    const id = await product();
    const input = testSale(id, { checkoutKey: 'same-cart' });
    const [first, second] = await Promise.all([createInvoice(input), createInvoice(input)]);
    expect(first).toBe(second);
    expect((await db.products.get(id))?.stock).toBe(8);
    expect(await db.invoices.count()).toBe(1);
    expect(await db.transactions.count()).toBe(1);
    expect(await db.stockMovements.count()).toBe(1);
  });

  it('یک کلید قبلاً ثبت‌شده با سبد متفاوت را قبول نمی‌کند', async () => {
    const id = await product();
    await createInvoice(testSale(id, { checkoutKey: 'fixed' }));
    await expect(
      createInvoice(testSale(id, { checkoutKey: 'fixed', discountValue: 5 })),
    ).rejects.toThrow('اطلاعات دیگری');
    expect(await db.transactions.count()).toBe(1);
    expect((await db.products.get(id))?.stock).toBe(8);
  });

  it('خطای ثبت درآمد، فاکتور و موجودی را هم rollback می‌کند', async () => {
    const id = await product();
    vi.spyOn(db.transactions, 'add').mockRejectedValueOnce(new Error('دفتر مالی در دسترس نیست'));
    await expect(createInvoice(testSale(id))).rejects.toThrow('دفتر مالی');
    expect((await db.products.get(id))?.stock).toBe(10);
    expect(await db.invoices.count()).toBe(0);
    expect(await db.invoiceItems.count()).toBe(0);
    expect(await db.stockMovements.count()).toBe(0);
    expect(await db.settings.get('last-invoice-number')).toBeUndefined();
  });

  it('باقی پول نقد را نگه می‌دارد ولی مبلغ دریافتی اضافی را درآمد نمی‌داند', async () => {
    const id = await product();
    const invoiceId = await createInvoice(
      testSale(id, { paymentMethod: 'cash', cashTendered: 250_000 }),
    );
    expect(await db.invoices.get(invoiceId)).toMatchObject({
      cashTendered: 250_000,
      changeAmount: 52_000,
    });
    expect((await db.transactions.toArray())[0].amount).toBe(198_000);
  });

  it('در نسیه مشتری اجباری است و وصول بعدی دوباره درآمد ثبت نمی‌کند', async () => {
    const id = await product();
    await expect(createInvoice(testSale(id, { paymentMethod: 'credit' }))).rejects.toThrow('مشتری');
    const customerId = (await db.customers.add({
      name: 'مشتری نسیه',
      createdAt: new Date().toISOString(),
    })) as number;
    await createInvoice(testSale(id, { paymentMethod: 'credit', customerId }));
    await db.customerPayments.add({
      customerId,
      amount: 50_000,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    expect(
      customerBalance(customerId, await db.invoices.toArray(), await db.customerPayments.toArray())
        .balance,
    ).toBe(148_000);
    expect(await db.transactions.count()).toBe(1);
    expect((await db.transactions.toArray())[0].amount).toBe(198_000);
  });

  it('قلم دستی درآمد دارد ولی موجودی کالایی را تغییر نمی‌دهد', async () => {
    const id = await createInvoice(
      testSale(1, {
        items: [{ productId: null, name: 'خدمات نصب', qty: 1, unitPrice: 500_000 }],
        discountValue: 0,
        taxPercent: 0,
      }),
    );
    expect((await db.invoiceItems.where('invoiceId').equals(id).first())?.unitCost).toBe(0);
    expect(await db.stockMovements.count()).toBe(0);
    expect((await db.transactions.toArray())[0].amount).toBe(500_000);
  });

  it('شماره فاکتور پس از ابطال یا با وجود فاکتورهای قدیمی تکرار نمی‌شود', async () => {
    const id = await product();
    const first = await createInvoice(testSale(id));
    await voidInvoice(first, 'اشتباه در ثبت');
    const second = await createInvoice(testSale(id));
    expect((await db.invoices.get(second))?.number).toBe(2);
    await db.invoices.update(second, { number: 900 });
    const third = await createInvoice(testSale(id));
    expect((await db.invoices.get(third))?.number).toBe(901);
  });

  it('سبد معلق فقط پس از فروش موفق پاک می‌شود', async () => {
    const id = await product(1);
    const heldId = (await db.heldSales.add({
      items: [{ productId: id, name: 'کالا', qty: 2, unitPrice: 100_000 }],
      customerId: null,
      customerName: '',
      discountType: 'percent',
      discountValue: 0,
      taxPercent: 0,
      note: '',
      checkoutKey: 'held',
      label: 'مشتری',
      createdAt: new Date().toISOString(),
    })) as number;
    await expect(
      createInvoice(testSale(id, { checkoutKey: 'held', heldSaleId: heldId })),
    ).rejects.toThrow('کافی نیست');
    expect(await db.heldSales.get(heldId)).toBeDefined();
    await db.products.update(id, { stock: 5 });
    await createInvoice(testSale(id, { checkoutKey: 'held', heldSaleId: heldId }));
    expect(await db.heldSales.get(heldId)).toBeUndefined();
  });

  it.each([
    ['NaN تعداد', { items: [{ productId: null, name: 'الف', qty: NaN, unitPrice: 100 }] }],
    ['تعداد منفی', { items: [{ productId: null, name: 'الف', qty: -1, unitPrice: 100 }] }],
    ['قیمت نامتناهی', { items: [{ productId: null, name: 'الف', qty: 1, unitPrice: Infinity }] }],
    ['تخفیف بیش از صد', { discountValue: 101 }],
    ['تخفیف منفی', { discountValue: -1 }],
    ['مالیات نامعتبر', { taxPercent: NaN }],
    ['مالیات بیش از صد', { taxPercent: 101 }],
    ['سبد خالی', { items: [] }],
    ['وجه ناکافی', { paymentMethod: 'cash' as const, cashTendered: 1 }],
  ])('ورودی ناسالم «%s» قبل از تغییر داده رد می‌شود', async (_, patch) => {
    const id = await product();
    await expect(createInvoice(testSale(id, patch))).rejects.toThrow();
    expect((await db.products.get(id))?.stock).toBe(10);
    expect(await db.transactions.count()).toBe(0);
  });
});

describe('ابطال فروش با حفظ سوابق', () => {
  it('موجودی و درآمد را اصلاح و فاکتور و اقلام را حفظ می‌کند؛ تکرار ابطال بی‌اثر است', async () => {
    const id = await product();
    const invoiceId = await createInvoice(testSale(id));
    await voidInvoice(invoiceId, 'برگشت کالا توسط مشتری');
    await voidInvoice(invoiceId, 'فراخوانی دوباره');
    expect((await db.products.get(id))?.stock).toBe(10);
    expect(await db.invoices.get(invoiceId)).toMatchObject({
      status: 'voided',
      voidReason: 'برگشت کالا توسط مشتری',
    });
    expect(await db.invoiceItems.where('invoiceId').equals(invoiceId).count()).toBe(1);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.stockMovements.count()).toBe(2);
    expect(salesTotals(await db.invoices.toArray(), await db.invoiceItems.toArray()).revenue).toBe(
      0,
    );
  });

  it('دریافت قبلی نسیه را پاک نمی‌کند و بستانکاری مشتری را حفظ می‌کند', async () => {
    const id = await product();
    const customerId = (await db.customers.add({
      name: 'خریدار',
      createdAt: new Date().toISOString(),
    })) as number;
    const invoiceId = await createInvoice(testSale(id, { paymentMethod: 'credit', customerId }));
    await db.customerPayments.add({
      customerId,
      invoiceId,
      amount: 10_000,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    await voidInvoice(invoiceId, 'انصراف از خرید');
    expect(await db.customerPayments.count()).toBe(1);
    expect(
      customerBalance(customerId, await db.invoices.toArray(), await db.customerPayments.toArray())
        .balance,
    ).toBe(-10_000);
  });

  it('سبد باطل‌شده نمی‌تواند با همان کلید فروش تازه بسازد', async () => {
    const id = await product();
    const input = testSale(id, { checkoutKey: 'void-key' });
    const invoiceId = await createInvoice(input);
    await voidInvoice(invoiceId, 'انصراف از خرید');
    await expect(createInvoice(input)).rejects.toThrow('باطل شده');
    expect((await db.products.get(id))?.stock).toBe(10);
    expect(await db.transactions.count()).toBe(0);
  });
});

it('تخفیف صددرصدی، سرریز مبلغ اقلام را پنهان نمی‌کند', async () => {
  await expect(
    createInvoice({
      items: [{ productId: null, name: 'خدمات', qty: 2, unitPrice: Number.MAX_SAFE_INTEGER }],
      discountType: 'percent',
      discountValue: 100,
      taxPercent: 0,
    }),
  ).rejects.toThrow('بیش از حد');
  expect(await db.invoices.count()).toBe(0);
  expect(await db.transactions.count()).toBe(0);
});

it('تخفیف مبلغی با کسری تومان پذیرفته نمی‌شود', async () => {
  await expect(
    createInvoice({
      items: [{ productId: null, name: 'خدمات', qty: 1, unitPrice: 100 }],
      discountType: 'amount',
      discountValue: 1.5,
      taxPercent: 0,
    }),
  ).rejects.toThrow('تومان صحیح');
});
