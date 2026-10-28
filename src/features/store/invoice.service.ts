/**
 * عملیات یکپارچه‌ی فروش: فاکتور، موجودی، گردش انبار و درآمد در یک تراکنش IndexedDB.
 * درآمد بر مبنای مبلغ فاکتور است؛ دریافت نسیه دوباره درآمد محسوب نمی‌شود.
 */
import { db, nowISO, type Invoice, type PaymentMethod, type SaleDraftItem } from '@/core/db/db';
import { applyDiscount, vatAmount } from '@/core/calc/finance';
import { roundMoney } from '@/core/currency/currency';

export type NewInvoiceItemInput = SaleDraftItem;

export interface NewInvoiceInput {
  customerName?: string;
  customerId?: number | null;
  isCredit?: boolean;
  items: NewInvoiceItemInput[];
  discountType: 'percent' | 'amount';
  discountValue: number;
  taxPercent: number;
  paymentMethod?: PaymentMethod;
  cashTendered?: number;
  note?: string;
  source?: 'pos' | 'invoice';
  checkoutKey?: string;
  /** سبد معلق فقط پس از ثبت موفق از دیتابیس حذف می‌شود. */
  heldSaleId?: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
}

export function calculateInvoiceTotals(
  items: Pick<NewInvoiceItemInput, 'qty' | 'unitPrice'>[],
  discountType: 'percent' | 'amount',
  discountValue: number,
  taxPercent: number,
): InvoiceTotals {
  const subtotal = roundMoney(items.reduce((sum, i) => sum + roundMoney(i.qty * i.unitPrice), 0));
  const { discountAmount } = applyDiscount(subtotal, discountType, discountValue);
  const taxableBase = subtotal - discountAmount;
  const taxAmount = vatAmount(taxableBase, Math.max(0, taxPercent));
  return { subtotal, discountAmount, taxableBase, taxAmount, total: taxableBase + taxAmount };
}

export function roundStock(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** اعتبارسنجی مستقل از فرم؛ هیچ NaN/Infinity یا مقدار منفی به دفتر مالی راه ندارد. */
function validateInvoice(input: NewInvoiceInput): InvoiceTotals {
  if (input.items.length === 0) throw new Error('فاکتور خالی است؛ حداقل یک قلم اضافه کنید.');
  if (input.items.length > 500) throw new Error('تعداد اقلام فاکتور بیش از حد مجاز است.');
  for (const item of input.items) {
    if (!item.name.trim()) throw new Error('نام قلم فاکتور را وارد کنید.');
    if (!Number.isFinite(item.qty) || item.qty <= 0 || item.qty > 1_000_000) {
      throw new Error(`تعداد «${item.name}» باید عددی معتبر و بیشتر از صفر باشد.`);
    }
    if (Math.abs(roundStock(item.qty) - item.qty) > 1e-10)
      throw new Error('تعداد کالا حداکثر شش رقم اعشار می‌تواند داشته باشد.');
    if (!Number.isSafeInteger(item.unitPrice) || item.unitPrice < 0) {
      throw new Error(`قیمت «${item.name}» نامعتبر است.`);
    }
    if (item.productId != null && (!Number.isSafeInteger(item.productId) || item.productId <= 0)) {
      throw new Error('شناسه‌ی کالا نامعتبر است.');
    }
  }
  if (
    !['percent', 'amount'].includes(input.discountType) ||
    !Number.isFinite(input.discountValue) ||
    input.discountValue < 0
  ) {
    throw new Error('تخفیف فاکتور نامعتبر است.');
  }
  if (!Number.isFinite(input.taxPercent) || input.taxPercent < 0 || input.taxPercent > 100) {
    throw new Error('مالیات باید بین صفر و صد درصد باشد.');
  }
  const totals = calculateInvoiceTotals(
    input.items,
    input.discountType,
    input.discountValue,
    input.taxPercent,
  );
  if (
    (input.discountType === 'percent' && input.discountValue > 100) ||
    (input.discountType === 'amount' && input.discountValue > totals.subtotal)
  ) {
    throw new Error('تخفیف نباید از مبلغ فروش بیشتر باشد.');
  }
  if (!Object.values(totals).every((value) => Number.isSafeInteger(value) && value >= 0))
    throw new Error('جمع فاکتور بیش از حد مجاز است.');
  if (input.discountType === 'amount' && !Number.isSafeInteger(input.discountValue))
    throw new Error('مبلغ تخفیف باید به تومان صحیح باشد.');
  if (
    input.checkoutKey !== undefined &&
    (!input.checkoutKey.trim() || input.checkoutKey.length > 128)
  ) {
    throw new Error('شناسه‌ی سبد فروش نامعتبر است.');
  }
  return totals;
}

export async function createInvoice(input: NewInvoiceInput): Promise<number> {
  const totals = validateInvoice(input);
  const method = input.paymentMethod ?? (input.isCredit ? 'credit' : 'cash');
  if (!['cash', 'card', 'transfer', 'credit'].includes(method))
    throw new Error('روش پرداخت نامعتبر است.');
  if (input.isCredit && method !== 'credit')
    throw new Error('روش پرداخت فروش نسیه را انتخاب کنید.');
  const isCredit = method === 'credit';
  if (isCredit && !input.customerId)
    throw new Error('برای فروش نسیه، یک مشتری ثبت‌شده انتخاب کنید.');
  const tendered = method === 'cash' ? (input.cashTendered ?? totals.total) : undefined;
  if (tendered !== undefined && (!Number.isSafeInteger(tendered) || tendered < totals.total)) {
    throw new Error('مبلغ نقد دریافتی از مبلغ فاکتور کمتر است یا معتبر نیست.');
  }

  const checkoutSignature = JSON.stringify({
    items: input.items.map((item) => ({
      productId: item.productId,
      name: item.productId == null ? item.name.trim() : undefined,
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
    customerId: input.customerId ?? null,
    customerName: input.customerId == null ? (input.customerName?.trim() ?? '') : undefined,
    discountType: input.discountType,
    discountValue: input.discountValue,
    taxPercent: input.taxPercent,
    method,
    tendered,
    note: input.note?.trim() ?? '',
  });

  return db.transaction(
    'rw',
    [
      db.products,
      db.invoices,
      db.invoiceItems,
      db.transactions,
      db.customers,
      db.stockMovements,
      db.settings,
      db.heldSales,
    ],
    async () => {
      // در دو تب یا با کلیک مجدد، یک سبد فقط یک بار فروخته و درآمدش ثبت می‌شود.
      if (input.checkoutKey) {
        const existing = await db.invoices.where('checkoutKey').equals(input.checkoutKey).first();
        if (existing?.id != null) {
          if (existing.status === 'voided')
            throw new Error('این سبد قبلاً ثبت و باطل شده است؛ سبد را خالی و فروش تازه شروع کنید.');
          if (existing.checkoutSignature && existing.checkoutSignature !== checkoutSignature)
            throw new Error(
              'این سبد قبلاً با اطلاعات دیگری ثبت شده است؛ فاکتور قبلی را بررسی و سبد جدید شروع کنید.',
            );
          return existing.id;
        }
      }
      const customer =
        input.customerId != null ? await db.customers.get(input.customerId) : undefined;
      if (input.customerId != null && !customer)
        throw new Error('مشتری انتخاب‌شده دیگر وجود ندارد.');

      const savedItems: Array<NewInvoiceItemInput & { unitCost: number }> = [];
      const now = nowISO();
      for (const item of input.items) {
        if (item.productId == null) {
          savedItems.push({ ...item, name: item.name.trim(), unitCost: 0 });
          continue;
        }
        const product = await db.products.get(item.productId);
        if (!product) throw new Error(`کالای «${item.name}» یافت نشد.`);
        if (!Number.isFinite(product.stock) || roundStock(product.stock - item.qty) < 0) {
          throw new Error(
            `موجودی «${product.name}» کافی نیست (موجودی فعلی: ${product.stock} ${product.unit}).`,
          );
        }
        if (
          !Number.isSafeInteger(product.costPrice) ||
          product.costPrice < 0 ||
          !Number.isSafeInteger(roundMoney(product.costPrice * item.qty))
        )
          throw new Error(`قیمت تمام‌شده‌ی «${product.name}» معتبر نیست.`);
        const stockAfter = roundStock(product.stock - item.qty);
        await db.products.update(product.id!, { stock: stockAfter, updatedAt: now });
        savedItems.push({ ...item, name: product.name, unitCost: product.costPrice });
        // invoiceId پس از ساخت فاکتور روی گردش‌های این فروش درج می‌شود.
      }

      const last = await db.invoices.orderBy('number').last();
      const counter = await db.settings.get('last-invoice-number');
      const previous =
        typeof counter?.value === 'number' && Number.isSafeInteger(counter.value)
          ? counter.value
          : 0;
      const number = Math.max(last?.number ?? 0, previous) + 1;
      if (!Number.isSafeInteger(number)) throw new Error('شماره‌ی فاکتور از حد مجاز گذشته است.');
      const invoiceId = (await db.invoices.add({
        number,
        date: now,
        customerName: customer?.name ?? (input.customerName?.trim() || undefined),
        customerId: customer?.id ?? null,
        isCredit,
        subtotal: totals.subtotal,
        discountType: input.discountType,
        discountValue: input.discountValue,
        discountAmount: totals.discountAmount,
        taxPercent: input.taxPercent,
        taxAmount: totals.taxAmount,
        total: totals.total,
        status: 'completed',
        source: input.source ?? 'invoice',
        paymentMethod: method,
        cashTendered: tendered,
        changeAmount: tendered !== undefined ? tendered - totals.total : 0,
        note: input.note?.trim() || undefined,
        checkoutKey: input.checkoutKey,
        checkoutSignature: input.checkoutKey ? checkoutSignature : undefined,
        createdAt: now,
      } satisfies Omit<Invoice, 'id'>)) as number;
      await db.settings.put({ key: 'last-invoice-number', value: number });
      await db.invoiceItems.bulkAdd(
        savedItems.map((item) => ({
          invoiceId,
          productId: item.productId,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          total: roundMoney(item.qty * item.unitPrice),
        })),
      );
      // بازیابی before/after از مقدار نهایی، حتی اگر یک کالا در چند ردیف آمده باشد.
      const stockChanges = new Map<number, { name: string; quantity: number }>();
      for (const item of savedItems) {
        if (item.productId == null) continue;
        const previous = stockChanges.get(item.productId)?.quantity ?? 0;
        stockChanges.set(item.productId, {
          name: item.name,
          quantity: roundStock(previous + item.qty),
        });
      }
      for (const [productId, change] of stockChanges) {
        const product = (await db.products.get(productId))!;
        await db.stockMovements.add({
          productId,
          productName: change.name,
          invoiceId,
          type: 'sale',
          quantity: -change.quantity,
          stockBefore: roundStock(product.stock + change.quantity),
          stockAfter: product.stock,
          note: `فروش فاکتور ${number}`,
          createdAt: now,
        });
      }
      await db.transactions.add({
        date: now,
        type: 'income',
        category: 'فروش فروشگاه',
        amount: totals.total,
        description: `فاکتور ${number}${isCredit ? ' — نسیه' : ''}${customer ? ` — ${customer.name}` : ''}`,
        source: 'sale',
        invoiceId,
        createdAt: now,
      });
      if (input.heldSaleId != null) {
        const held = await db.heldSales.get(input.heldSaleId);
        if (held?.checkoutKey === input.checkoutKey) await db.heldSales.delete(input.heldSaleId);
      }
      return invoiceId;
    },
  );
}

/** ابطال کامل با حفظ سند؛ فراخوانی تکراری موجودی را دوباره زیاد نمی‌کند. */
export async function voidInvoice(invoiceId: number, reason: string): Promise<void> {
  if (reason.trim().length < 3) throw new Error('دلیل ابطال را با حداقل ۳ نویسه بنویسید.');
  await db.transaction(
    'rw',
    [db.products, db.invoices, db.invoiceItems, db.transactions, db.stockMovements],
    async () => {
      const invoice = await db.invoices.get(invoiceId);
      if (!invoice) throw new Error('فاکتور پیدا نشد.');
      if (invoice.status === 'voided') return;
      const now = nowISO();
      const items = await db.invoiceItems.where('invoiceId').equals(invoiceId).toArray();
      for (const item of items) {
        if (item.productId == null) continue;
        const product = await db.products.get(item.productId);
        if (!product)
          throw new Error(`برای برگشت موجودی، کالای «${item.name}» باید در انبار وجود داشته باشد.`);
        const stockAfter = roundStock(product.stock + item.qty);
        if (
          !Number.isFinite(product.stock) ||
          product.stock < 0 ||
          !Number.isFinite(item.qty) ||
          item.qty <= 0 ||
          !Number.isSafeInteger(Math.ceil(stockAfter))
        )
          throw new Error(`موجودی یا مقدار برگشت «${product.name}» معتبر نیست.`);
        await db.products.update(product.id!, { stock: stockAfter, updatedAt: now });
        await db.stockMovements.add({
          productId: product.id!,
          productName: product.name,
          invoiceId,
          type: 'void',
          quantity: item.qty,
          stockBefore: product.stock,
          stockAfter,
          note: reason.trim(),
          createdAt: now,
        });
      }
      await db.transactions
        .where('invoiceId')
        .equals(invoiceId)
        .filter((t) => t.source === 'sale')
        .delete();
      await db.invoices.update(invoiceId, {
        status: 'voided',
        voidedAt: now,
        voidReason: reason.trim(),
      });
      // دریافت‌های قبلی مشتری حذف نمی‌شوند؛ در فروش نسیه به بستانکاری حساب او تبدیل می‌شوند.
    },
  );
}

/** سازگاری با فراخوانی‌های قبلی؛ سند مالی دیگر به‌صورت مخرب حذف نمی‌شود. */
export async function deleteInvoice(invoiceId: number): Promise<void> {
  await voidInvoice(invoiceId, 'ابطال فاکتور توسط کاربر');
}
