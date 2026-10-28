import { expect, test, type Page } from '@playwright/test';

async function seedStore(page: Page, stock = 8) {
  await page.goto('/store/pos');
  await page.evaluate(async (initialStock) => {
    const modulePath = '/src/core/db/db.ts';
    const { db } = await import(modulePath);
    const now = new Date().toISOString();
    await db.products.add({
      id: 1,
      name: 'کالای تست صندوق',
      barcode: '6261234567890',
      category: 'عمومی',
      buyPrice: 60_000,
      buyTaxPercent: 0,
      shippingPerUnit: 0,
      overheadPerUnit: 0,
      costPrice: 60_000,
      sellPrice: 100_000,
      stock: initialStock,
      unit: 'عدد',
      minStock: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.customers.add({ id: 1, name: 'مشتری تست', phone: '09123456789', createdAt: now });
  }, stock);
  await expect(page.getByRole('button', { name: 'افزودن کالای تست صندوق به سبد' })).toBeVisible();
}

async function storeSnapshot(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/core/db/db.ts';
    const { db } = await import(modulePath);
    return {
      product: await db.products.get(1),
      invoices: await db.invoices.toArray(),
      transactions: await db.transactions.toArray(),
      movements: await db.stockMovements.toArray(),
      heldCount: await db.heldSales.count(),
    };
  });
}

test.describe('صندوق فروش یکپارچه', () => {
  test.setTimeout(60_000);
  test('فروش نقدی، باقی پول، کسر موجودی، دفتر درآمد و هزینه کسب‌وکار', async ({ page }) => {
    await seedStore(page);
    const add = page.getByRole('button', { name: 'افزودن کالای تست صندوق به سبد' });
    await add.click();
    await add.click();
    await page.getByLabel('تخفیف', { exact: true }).fill('10');
    await page.getByRole('button', { name: /تسویه و ثبت فروش/ }).click();
    await page.getByRole('button', { name: 'نقدی', exact: true }).click();
    await page.getByLabel(/وجه نقد دریافتی/).fill('250000');
    await expect(page.getByText('۵۲٬۰۰۰ تومان', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'تأیید و ثبت نهایی فروش' }).click();
    await expect(page.getByRole('heading', { name: 'فروش با موفقیت ثبت شد' })).toBeVisible();
    const snapshot = await storeSnapshot(page);
    expect(snapshot.product.stock).toBe(6);
    expect(snapshot.invoices).toHaveLength(1);
    expect(snapshot.invoices[0].changeAmount).toBe(52_000);
    expect(snapshot.transactions).toHaveLength(1);
    expect(snapshot.transactions[0]).toMatchObject({
      source: 'sale',
      amount: 198_000,
      type: 'income',
    });
    expect(snapshot.movements[0]).toMatchObject({ stockBefore: 8, stockAfter: 6, quantity: -2 });
    await page.getByRole('button', { name: 'شروع فروش بعدی' }).click();
    await page.getByRole('link', { name: 'گردش انبار', exact: true }).click();
    await expect(page.getByRole('cell', { name: '۶ عدد', exact: true })).toBeVisible();
    const menuButton = page.getByRole('button', { name: 'باز کردن منو' });
    if (await menuButton.isVisible()) await menuButton.click();
    await page.getByRole('link', { name: 'دفتر مالی کسب‌وکار', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'دفتر مالی کسب‌وکار' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'فاکتور ←' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'ویرایش تراکنش' })).toHaveCount(0);
    await page.getByRole('button', { name: 'تراکنش جدید', exact: true }).click();
    await page.getByLabel(/دسته‌بندی/).fill('اجاره فروشگاه');
    await page.getByLabel(/مبلغ/).fill('10000');
    await page.getByRole('button', { name: 'ثبت تراکنش', exact: true }).click();
    await expect(
      page.getByText('اجاره فروشگاه', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    expect((await storeSnapshot(page)).transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'business', type: 'expense', amount: 10_000 }),
      ]),
    );
  });

  test('سبد معلق و پیش‌نویس با بازخوانی می‌مانند و موجودی زنده کنترل می‌شود', async ({ page }) => {
    await seedStore(page, 2);
    await page.getByRole('button', { name: 'افزودن کالای تست صندوق به سبد' }).click();
    await page.getByRole('button', { name: 'نگه‌داشتن سبد', exact: true }).click();
    await expect.poll(async () => (await storeSnapshot(page)).heldCount).toBe(1);
    expect((await storeSnapshot(page)).transactions).toHaveLength(0);
    expect((await storeSnapshot(page)).product.stock).toBe(2);
    await page.reload();
    await page.getByRole('button', { name: /سبدهای معلق/ }).click();
    await page.getByRole('button', { name: 'بازیابی', exact: true }).click();
    await expect(page.getByLabel('تعداد کالای تست صندوق', { exact: true })).toHaveValue('1');
    await page.reload();
    await expect(page.getByLabel('تعداد کالای تست صندوق', { exact: true })).toHaveValue('1');
    await page.evaluate(async () => {
      const modulePath = '/src/core/db/db.ts';
      const { db } = await import(modulePath);
      await db.products.update(1, { stock: 0 });
    });
    await expect(page.getByRole('button', { name: /تسویه و ثبت فروش/ })).toBeDisabled();
    await page.evaluate(async () => {
      const modulePath = '/src/core/db/db.ts';
      const { db } = await import(modulePath);
      await db.products.update(1, { stock: 2 });
    });
    await page.getByRole('button', { name: /تسویه و ثبت فروش/ }).click();
    await page.getByRole('button', { name: 'تأیید و ثبت نهایی فروش' }).click();
    await expect(page.getByRole('heading', { name: 'فروش با موفقیت ثبت شد' })).toBeVisible();
    expect((await storeSnapshot(page)).heldCount).toBe(0);
    expect((await storeSnapshot(page)).product.stock).toBe(1);
  });

  test('نسیه به مشتری نیاز دارد و ابطال، موجودی و درآمد را برمی‌گرداند', async ({ page }) => {
    await seedStore(page, 2);
    await page.getByRole('button', { name: 'افزودن کالای تست صندوق به سبد' }).click();
    await page.getByRole('button', { name: /تسویه و ثبت فروش/ }).click();
    await page.getByRole('button', { name: 'نسیه', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تأیید و ثبت نهایی فروش' })).toBeDisabled();
    await page.getByRole('dialog').getByLabel('مشتری فروش').click();
    await page.getByRole('option', { name: /مشتری تست/ }).click();
    await page.getByRole('button', { name: 'تأیید و ثبت نهایی فروش' }).click();
    await expect(page.getByRole('heading', { name: 'فروش با موفقیت ثبت شد' })).toBeVisible();
    const { invoices } = await storeSnapshot(page);
    expect(invoices[0]).toMatchObject({ isCredit: true, customerId: 1, total: 110_000 });
    await page.getByRole('link', { name: /مشاهده و چاپ رسید/ }).click();
    await page.getByRole('button', { name: 'ابطال فروش' }).click();
    await page.getByLabel('دلیل ابطال').fill('انصراف مشتری و برگشت کامل کالا');
    await page.getByRole('button', { name: 'تأیید ابطال و برگشت موجودی' }).click();
    await expect(page.getByText('باطل‌شده — این سند فروش معتبر نیست')).toBeVisible();
    const snapshot = await storeSnapshot(page);
    expect(snapshot.product.stock).toBe(2);
    expect(snapshot.invoices[0].status).toBe('voided');
    expect(snapshot.transactions).toHaveLength(0);
    expect(snapshot.movements).toHaveLength(2);
  });

  test('کالای وزنی با موجودی کمتر از یک، با تایپ اعشاری فروخته و در رسید درست نمایش داده می‌شود', async ({
    page,
  }) => {
    await seedStore(page, 0.75);
    await page.getByRole('button', { name: 'افزودن کالای تست صندوق به سبد' }).click();
    const quantity = page.getByLabel('تعداد کالای تست صندوق', { exact: true });
    await expect(quantity).toHaveValue('0.75');
    if ((page.viewportSize()?.width ?? 1440) < 1280) {
      await page.getByRole('button', { name: 'مشاهده سبد و تسویه' }).click();
      await expect
        .poll(async () => {
          const top = await page
            .locator('#pos-cart')
            .evaluate((element) => element.getBoundingClientRect().top);
          return top >= 64 && top < 200;
        })
        .toBe(true);
    }
    await quantity.fill('');
    await quantity.pressSequentially('0.25');
    await expect(quantity).toHaveValue('0.25');
    await page.getByRole('button', { name: /تسویه و ثبت فروش/ }).click();
    await page.getByRole('button', { name: 'تأیید و ثبت نهایی فروش' }).click();
    await expect(page.getByRole('heading', { name: 'فروش با موفقیت ثبت شد' })).toBeVisible();
    const snapshot = await storeSnapshot(page);
    expect(snapshot.product.stock).toBe(0.5);
    expect(snapshot.transactions[0].amount).toBe(27_500);
    await page.getByRole('link', { name: /مشاهده و چاپ رسید/ }).click();
    await expect(page.getByRole('cell', { name: '۰٫۲۵', exact: true })).toBeVisible();
  });

  test('عرض صندوق از صفحه بیرون نمی‌زند و ورودی بارکد با Enter کالا اضافه می‌کند', async ({
    page,
  }) => {
    await seedStore(page);
    await page.getByLabel('جستجوی کالای صندوق').fill('۶۲۶۱۲۳۴۵۶۷۸۹۰');
    await page.getByLabel('جستجوی کالای صندوق').press('Enter');
    await expect(page.getByLabel('تعداد کالای تست صندوق', { exact: true })).toHaveValue('1');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
