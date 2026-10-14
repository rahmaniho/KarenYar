/**
 * داده‌های آزمایشی برای دمو و تست سریع — با برچسب «نمایشی» مشخص‌اند تا قابل تشخیص باشند.
 * همه‌ی مبالغ به تومان و عددها واقع‌گرایانه‌اند.
 */
import { db, type Product } from './db';
import { jalaliMonthKey } from '@/core/jalali/jalali';

const DEMO_PRODUCT_PREFIX = '[نمایشی]';

function makeProduct(
  partial: Partial<Product> &
    Pick<Product, 'name' | 'buyPrice' | 'sellPrice' | 'stock' | 'minStock'>,
): Omit<Product, 'id'> {
  const now = new Date().toISOString();
  return {
    barcode: '',
    category: 'عمومی',
    buyTaxPercent: 0,
    shippingPerUnit: 0,
    overheadPerUnit: 0,
    costPrice: partial.buyPrice,
    unit: 'عدد',
    createdAt: now,
    updatedAt: now,
    ...partial,
  } as Omit<Product, 'id'>;
}

const DEMO_PRODUCTS: Array<Omit<Product, 'id'>> = [
  makeProduct({
    name: `${DEMO_PRODUCT_PREFIX} گوشی شیائومی ردمی نوت ۱۳`,
    barcode: '6901234567890',
    category: 'کالای دیجیتال',
    buyPrice: 8000000,
    sellPrice: 9500000,
    stock: 12,
    minStock: 3,
  }),
  makeProduct({
    name: `${DEMO_PRODUCT_PREFIX} هندزفری بلوتوثی`,
    barcode: '8859123456789',
    category: 'لوازم جانبی',
    buyPrice: 450000,
    sellPrice: 750000,
    stock: 2,
    minStock: 5,
  }),
  makeProduct({
    name: `${DEMO_PRODUCT_PREFIX} کابل شارژ سریع USB-C`,
    barcode: '6905551234567',
    category: 'لوازم جانبی',
    buyPrice: 90000,
    sellPrice: 180000,
    stock: 45,
    minStock: 10,
  }),
  makeProduct({
    name: `${DEMO_PRODUCT_PREFIX} قاب محافظ سیلیکونی`,
    barcode: '6971234560012',
    category: 'لوازم جانبی',
    buyPrice: 60000,
    sellPrice: 150000,
    stock: 30,
    minStock: 8,
  }),
  makeProduct({
    name: `${DEMO_PRODUCT_PREFIX} پاوربانک ۲۰۰۰۰ شیائومی`,
    barcode: '6907778889990',
    category: 'کالای دیجیتال',
    buyPrice: 1100000,
    sellPrice: 1650000,
    stock: 8,
    minStock: 2,
  }),
];

const DEMO_CUSTOMERS = [
  { name: '[نمایشی] محمد رضایی', phone: '09123456789', address: 'تهران، خیابان ولیعصر' },
  { name: '[نمایشی] سارا محمدی', phone: '09351234567', address: 'اصفهان، چهارباغ' },
];

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export async function seedDemoData(): Promise<{ products: number; invoices: number }> {
  const now = new Date().toISOString();
  let invoiceCount = 0;

  await db.transaction(
    'rw',
    [
      db.products,
      db.customers,
      db.invoices,
      db.invoiceItems,
      db.customerPayments,
      db.transactions,
      db.budgets,
      db.debts,
      db.employees,
    ],
    async () => {
      const productIds: number[] = [];
      for (const product of DEMO_PRODUCTS) {
        productIds.push((await db.products.add(product)) as number);
      }

      const customerIds: number[] = [];
      for (const customer of DEMO_CUSTOMERS) {
        customerIds.push((await db.customers.add({ ...customer, createdAt: now })) as number);
      }

      const sales: Array<{
        productIdx: number;
        qty: number;
        day: number;
        customerIdx: number | null;
        credit: boolean;
      }> = [
        { productIdx: 0, qty: 1, day: 2, customerIdx: 0, credit: false },
        { productIdx: 2, qty: 3, day: 4, customerIdx: null, credit: false },
        { productIdx: 4, qty: 2, day: 1, customerIdx: 0, credit: true },
        { productIdx: 1, qty: 1, day: 9, customerIdx: 1, credit: true },
        { productIdx: 3, qty: 5, day: 6, customerIdx: null, credit: false },
      ];
      let nextNumber = ((await db.invoices.orderBy('number').last())?.number ?? 1000) + 1;

      for (const sale of sales) {
        const product = await db.products.get(productIds[sale.productIdx] as number);
        if (!product || product.id === undefined) continue;
        const qty = Math.min(sale.qty, product.stock);
        if (qty <= 0) continue;
        const lineTotal = qty * product.sellPrice;
        const invoiceId = (await db.invoices.add({
          number: nextNumber++,
          date: daysAgo(sale.day),
          customerId: sale.customerIdx !== null ? (customerIds[sale.customerIdx] as number) : null,
          customerName:
            sale.customerIdx !== null ? DEMO_CUSTOMERS[sale.customerIdx]?.name : undefined,
          isCredit: sale.credit,
          subtotal: lineTotal,
          discountType: 'amount',
          discountValue: 0,
          discountAmount: 0,
          taxPercent: 0,
          taxAmount: 0,
          total: lineTotal,
          createdAt: now,
        })) as number;
        await db.invoiceItems.add({
          invoiceId,
          productId: product.id,
          name: product.name,
          qty,
          unitPrice: product.sellPrice,
          unitCost: product.costPrice,
          total: lineTotal,
        });
        await db.products.update(product.id, { stock: product.stock - qty, updatedAt: now });
        invoiceCount++;
      }

      await db.customerPayments.add({
        customerId: customerIds[0] as number,
        invoiceId: null,
        amount: 1000000,
        date: daysAgo(0),
        note: '[نمایشی] پرداخت بخشی از بدهی',
        createdAt: now,
      });

      await db.transactions.bulkAdd([
        {
          type: 'income',
          category: 'حقوق',
          amount: 18000000,
          date: daysAgo(3),
          description: '[نمایشی] حقوق ماهانه',
          createdAt: now,
        },
        {
          type: 'expense',
          category: 'خوراک',
          amount: 2500000,
          date: daysAgo(2),
          description: '[نمایشی] خرید سوپرمارکت',
          createdAt: now,
        },
        {
          type: 'expense',
          category: 'حمل‌ونقل',
          amount: 800000,
          date: daysAgo(5),
          description: '[نمایشی] بنزین و اسنپ',
          createdAt: now,
        },
      ]);

      // بودجه‌ی همین ماه که عمداً از سقف رد شده تا هشدار نمایش داده شود
      await db.budgets.add({
        month: jalaliMonthKey(new Date()),
        category: 'خوراک',
        limit: 2000000,
      });

      // بدهی‌ای که سررسیدش گذشته (برای هشدار)
      await db.debts.add({
        title: '[نمایشی] قسط وام مسکن',
        kind: 'installment',
        amount: 50000000,
        paidAmount: 12500000,
        installmentsCount: 20,
        installmentAmount: 2500000,
        paidInstallments: 5,
        dueDate: daysAgo(6),
        description: 'دموی هشدار سررسید',
        createdAt: now,
      });

      await db.employees.bulkAdd([
        {
          name: 'علی کریمی [نمایشی]',
          position: 'فروشنده',
          baseSalary: 16625550, // حداقل مزد ماهانه‌ی ۱۴۰۵
          children: 1,
          married: true,
          seniorityYears: 3,
          createdAt: now,
        },
        {
          name: 'مریم احمدی [نمایشی]',
          position: 'حسابدار',
          baseSalary: 32000000,
          children: 2,
          married: true,
          seniorityYears: 6,
          createdAt: now,
        },
      ]);
    },
  );

  return { products: DEMO_PRODUCTS.length, invoices: invoiceCount };
}

export { DEMO_PRODUCT_PREFIX };
