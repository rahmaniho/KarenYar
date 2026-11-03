import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

async function seed(page: Page) {
  await page.goto('/store/invoices/new');
  await page.evaluate(async () => {
    const modulePath = '/src/core/db/db.ts';
    const { db } = await import(modulePath);
    const now = new Date().toISOString();
    await db.products.add({
      id: 1,
      name: 'کالای آزمون فاکتور',
      barcode: '6261111111111',
      category: 'عمومی',
      buyPrice: 60000,
      buyTaxPercent: 0,
      shippingPerUnit: 0,
      overheadPerUnit: 0,
      costPrice: 60000,
      sellPrice: 100000,
      stock: 10,
      unit: 'عدد',
      minStock: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.customers.add({
      id: 1,
      name: 'مشتری آزمون فاکتور',
      phone: '09120000000',
      address: 'نشانی آزمون',
      createdAt: now,
    });
  });
  await expect(
    page.getByRole('button', { name: 'افزودن کالای آزمون فاکتور به فاکتور' }),
  ).toBeVisible();
}

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/core/db/db.ts';
    const { db } = await import(modulePath);
    return {
      invoices: await db.invoices.toArray(),
      items: await db.invoiceItems.toArray(),
      payments: await db.customerPayments.toArray(),
      transactions: await db.transactions.toArray(),
      product: await db.products.get(1),
      events: await db.financialEvents.toArray(),
    };
  });
}

test.describe('مرکز فاکتورها', () => {
  test.setTimeout(60_000);

  test('نسیه از فرم رسمی واقعاً نسیه ثبت می‌شود و پرداخت/برگشت وجه دارد', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'افزودن کالای آزمون فاکتور به فاکتور' }).click();
    await page.getByLabel('انتخاب مشتری').click();
    await page.getByRole('option', { name: /مشتری آزمون فاکتور/ }).click();
    await page.getByLabel('روش تسویه').click();
    await page.getByRole('option', { name: 'نسیه', exact: true }).click();
    await page.getByLabel('درصد', { exact: true }).fill('0');
    await page.getByLabel('مالیات بر ارزش افزوده (٪)').fill('0');
    await page.getByRole('button', { name: 'صدور فاکتور', exact: true }).click();
    await page.getByRole('button', { name: 'تأیید و صدور' }).click();
    await expect(page.getByRole('heading', { name: /فاکتور شماره/ })).toBeVisible();
    let data = await snapshot(page);
    expect(data.invoices[0]).toMatchObject({
      isCredit: true,
      paymentMethod: 'credit',
      total: 100000,
      status: 'completed',
    });
    expect(data.product?.stock).toBe(9);
    await page.getByRole('button', { name: 'ثبت پرداخت', exact: true }).click();
    await page.getByLabel('مبلغ پرداخت', { exact: true }).fill('40000');
    await page.getByLabel('شماره پیگیری', { exact: true }).fill('REF-400');
    await page.getByRole('button', { name: 'ثبت پرداخت', exact: true }).last().click();
    await expect(page.getByText('REF-400').first()).toBeVisible();
    data = await snapshot(page);
    expect(data.payments).toHaveLength(1);
    expect(data.payments[0]).toMatchObject({
      amount: 40000,
      kind: 'payment',
      reference: 'REF-400',
    });
    await page.getByRole('button', { name: 'برگشت وجه', exact: true }).click();
    await page.getByLabel('مبلغ برگشت وجه').fill('10000');
    await page.getByLabel('دلیل برگشت *').fill('برگشت بخشی از وجه دریافتی');
    await page.getByRole('button', { name: 'ثبت برگشت وجه' }).click();
    await expect(page.getByText('برگشت وجه —', { exact: false }).first()).toBeVisible();
    data = await snapshot(page);
    expect(data.payments.filter((p: { kind?: string }) => p.kind === 'refund')).toHaveLength(1);
    expect(data.transactions).toHaveLength(1);
  });

  test('پیش‌نویس اثر مالی ندارد، ویرایش می‌شود و کپی سند مستقل است', async ({ page }) => {
    await seed(page);
    await page.getByLabel('نام قلم دستی').fill('خدمات مشاوره');
    await page.getByLabel('قیمت قلم دستی').fill('250000');
    await page.getByRole('button', { name: 'افزودن', exact: true }).click();
    await page.getByRole('button', { name: 'ذخیره پیش‌نویس' }).click();
    await expect(page.getByRole('heading', { name: /ویرایش پیش‌نویس/ })).toBeVisible();
    let data = await snapshot(page);
    expect(data.invoices[0].status).toBe('draft');
    expect(data.transactions).toHaveLength(0);
    expect(data.product?.stock).toBe(10);
    await page.getByLabel('تعداد', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'صدور فاکتور', exact: true }).click();
    await page.getByRole('button', { name: 'تأیید و صدور' }).click();
    await expect(page.getByRole('heading', { name: /فاکتور شماره/ })).toBeVisible();
    data = await snapshot(page);
    expect(data.invoices[0]).toMatchObject({ status: 'completed', total: 550000 });
    expect(data.transactions).toHaveLength(1);
    await page.getByRole('button', { name: 'کپی به پیش‌نویس' }).click();
    await expect(page.getByRole('heading', { name: /ویرایش پیش‌نویس/ })).toBeVisible();
    data = await snapshot(page);
    expect(data.invoices).toHaveLength(2);
    expect(data.invoices[1].status).toBe('draft');
    expect(data.transactions).toHaveLength(1);
  });

  test('تغییر واحد نمایش مبلغ داخلی فاکتور را عوض نمی‌کند', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'افزودن کالای آزمون فاکتور به فاکتور' }).click();
    await page.evaluate(async () => {
      const modulePath = '/src/store/settings-store.ts';
      const { useSettingsStore } = await import(modulePath);
      useSettingsStore.setState({ currencyUnit: 'rial', invoiceTaxPercent: 0 });
    });
    await page.getByLabel('مالیات بر ارزش افزوده (٪)').fill('0');
    await expect(page.getByLabel('قیمت واحد کالای آزمون فاکتور')).toHaveValue('۱٬۰۰۰٬۰۰۰');
    await page.evaluate(async () => {
      const modulePath = '/src/store/settings-store.ts';
      const { useSettingsStore } = await import(modulePath);
      useSettingsStore.setState({ currencyUnit: 'toman' });
    });
    await expect(page.getByLabel('قیمت واحد کالای آزمون فاکتور')).toHaveValue('۱۰۰٬۰۰۰');
    await page.getByRole('button', { name: 'صدور فاکتور', exact: true }).click();
    await page.getByRole('button', { name: 'تأیید و صدور' }).click();
    await expect(page.getByRole('heading', { name: /فاکتور شماره/ })).toBeVisible();
    expect((await snapshot(page)).invoices[0].total).toBe(100000);
  });

  test('فهرست موبایل از عرض صفحه بیرون نمی‌زند و فیلتر مبلغ در URL می‌ماند', async ({ page }) => {
    await seed(page);
    await page.goto('/store/invoices/issued');
    await page.getByRole('button', { name: /فیلترها/ }).click();
    await page.getByLabel('حداقل مبلغ').fill('۱۰۰۰');
    await expect(page).toHaveURL(/min=/);
    await page.reload();
    await expect(page.getByLabel('حداقل مبلغ')).toHaveValue('۱۰۰۰');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

test('ورودی کسر ریال ثبت نمی‌شود و پیش‌نویس یادداشت داخلی را چاپ نمی‌کند', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const settingsPath = '/src/store/settings-store.ts';
    const { useSettingsStore } = await import(settingsPath);
    useSettingsStore.setState({ currencyUnit: 'rial' });
  });
  await page.getByLabel('نام قلم دستی').fill('خدمت آزمون');
  await page.getByLabel('قیمت قلم دستی').fill('15');
  await expect(page.getByRole('alert').filter({ hasText: 'مضرب' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'افزودن', exact: true })).toBeDisabled();
  await page.evaluate(async () => {
    const servicePath = '/src/features/store/invoice.service.ts';
    const { saveInvoiceDraft } = await import(servicePath);
    await saveInvoiceDraft({
      items: [{ productId: null, name: 'خدمت', qty: 1, unitPrice: 1000 }],
      discountType: 'percent',
      discountValue: 0,
      taxPercent: 0,
      internalNote: 'محرمانه داخلی نباید چاپ شود',
    });
  });
  const data = await snapshot(page);
  await page.goto(`/store/invoices/${data.invoices[0].id}`);
  await expect(page.locator('.print-area')).toContainText('پیش‌نویس');
  await expect(page.locator('.print-area')).not.toContainText('محرمانه داخلی نباید چاپ شود');
});

test('PDF برداری برای سند چندصفحه‌ای ساخته می‌شود', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const servicePath = '/src/features/store/invoice.service.ts';
    const pdfPath = '/src/features/store/invoice-pdf.ts';
    const dbPath = '/src/core/db/db.ts';
    const settingsPath = '/src/store/settings-store.ts';
    const { createInvoice } = await import(servicePath);
    const { buildInvoicePdf } = await import(pdfPath);
    const { db } = await import(dbPath);
    const { useSettingsStore } = await import(settingsPath);
    const id = await createInvoice({
      items: Array.from({ length: 120 }, (_, i) => ({
        productId: null,
        name: `خدمت ردیف ${i + 1}`,
        qty: 1,
        unitPrice: 1000,
      })),
      discountType: 'percent',
      discountValue: 0,
      taxPercent: 0,
      paymentMethod: 'card',
    });
    const invoice = await db.invoices.get(id);
    const items = await db.invoiceItems.where('invoiceId').equals(id).toArray();
    const s = useSettingsStore.getState();
    const blob = await buildInvoicePdf({
      invoice: invoice!,
      items,
      settings: {
        shopName: s.shopName,
        shopPhone: s.shopPhone,
        shopAddress: s.shopAddress,
        currencyUnit: s.currencyUnit,
        invoiceFooterNote: s.invoiceFooterNote,
        invoiceShowLogo: s.invoiceShowLogo,
      },
    });
    return { size: blob.size, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
  });
  expect(result.size).toBeGreaterThan(10000);
  const pdf = await PDFDocument.load(new Uint8Array(result.bytes));
  expect(pdf.getPageCount()).toBeGreaterThan(1);
});
