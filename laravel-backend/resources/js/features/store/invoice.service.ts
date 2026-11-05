/**
 * عملیات یکپارچهٔ فروش در تراکنش IndexedDB. این لایه مرز اعتبارسنجی محلی است،
 * نه جایگزین احراز هویت یا اعتبارسنجی سروری. سندهای صادرشده تغییر مالی خاموش ندارند.
 */
import {
  db,
  nowISO,
  type Invoice,
  type InvoiceItem,
  type PaymentMethod,
  type Product,
} from '@/core/db/db';
import { decimalUnits, quantityAmount, sumMoney } from '@/core/currency/money';
import { startOfDay } from '@/core/jalali/jalali';
import {
  calculateInvoice,
  type InvoiceLineInput,
  type InvoicePricingInput,
  type InvoiceTotals,
} from './invoice-calc';

export type NewInvoiceItemInput = InvoiceLineInput;
export interface NewInvoiceInput extends InvoicePricingInput {
  customerName?: string;
  customerId?: number | null;
  isCredit?: boolean;
  paymentMethod?: PaymentMethod;
  cashTendered?: number;
  note?: string;
  terms?: string;
  internalNote?: string;
  date?: string;
  dueDate?: string;
  source?: 'pos' | 'invoice';
  checkoutKey?: string;
  heldSaleId?: number;
  /** فقط برای صدور اتمیک پیش‌نویس موجود */
  draftId?: number;
  expectedRevision?: number;
}
export type { InvoiceTotals } from './invoice-calc';

/** امضای عمومی قبلی حفظ شده است؛ اقلام جدید تخفیف ردیفی اختیاری دارند. */
export function calculateInvoiceTotals(
  items: Pick<InvoiceLineInput, 'qty' | 'unitPrice' | 'discountType' | 'discountValue'>[],
  discountType: 'percent' | 'amount',
  discountValue: number,
  taxPercent: number,
  extras: { shippingAmount?: number; otherAmount?: number } = {},
): InvoiceTotals {
  return calculateInvoice({
    items: items.map((item) => ({ ...item, productId: null, name: '' })),
    discountType,
    discountValue,
    taxPercent,
    ...extras,
  });
}

export function roundStock(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function validId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} نامعتبر است.`);
}

function text(value: string | undefined, max: number, label: string): string | undefined {
  const result = value?.trim();
  if (result && result.length > max) throw new Error(`${label} حداکثر ${max} نویسه است.`);
  return result || undefined;
}

export function resolveInvoiceDates(
  input: Pick<NewInvoiceInput, 'date' | 'dueDate' | 'isCredit' | 'paymentMethod'>,
  now = nowISO(),
) {
  const date = input.date ?? now;
  const issued = new Date(date);
  if (Number.isNaN(issued.getTime())) throw new Error('تاریخ صدور معتبر نیست.');
  const credit = input.paymentMethod ? input.paymentMethod === 'credit' : !!input.isCredit;
  const dueDate =
    input.dueDate ??
    (credit ? new Date(issued.getTime() + 30 * 86_400_000).toISOString() : undefined);
  if (dueDate) {
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) throw new Error('تاریخ سررسید معتبر نیست.');
    if (startOfDay(due).getTime() < startOfDay(issued).getTime())
      throw new Error('سررسید نمی‌تواند پیش از تاریخ صدور باشد.');
  }
  return { date: issued.toISOString(), dueDate };
}

/** اعتبارسنجی مستقل از فرم؛ هیچ NaN/Infinity، کسر تومان یا سرریز خاموش پذیرفته نمی‌شود. */
export function validateInvoice(input: NewInvoiceInput, allowEmpty = false): InvoiceTotals {
  if (!Array.isArray(input.items) || (!allowEmpty && input.items.length === 0))
    throw new Error('فاکتور خالی است؛ حداقل یک قلم اضافه کنید.');
  if (input.items.length > 500) throw new Error('تعداد اقلام فاکتور بیش از حد مجاز است.');
  for (const item of input.items) {
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 200)
      throw new Error('نام هر قلم باید بین ۱ و ۲۰۰ نویسه باشد.');
    const units = decimalUnits(item.qty, 'تعداد');
    if (units <= 0n || units > 1_000_000_000_000n)
      throw new Error(`تعداد «${item.name}» باید بیشتر از صفر و حداکثر یک میلیون باشد.`);
    quantityAmount(item.qty, item.unitPrice);
    if (item.productId != null) validId(item.productId, 'شناسهٔ کالا');
    text(item.unit, 32, 'واحد کالا');
  }
  text(input.customerName, 200, 'نام خریدار');
  text(input.note, 2000, 'یادداشت فاکتور');
  text(input.terms, 1000, 'شرایط پرداخت');
  text(input.internalNote, 2000, 'یادداشت داخلی');
  if (input.customerId != null) validId(input.customerId, 'شناسهٔ مشتری');
  if (
    input.checkoutKey !== undefined &&
    (typeof input.checkoutKey !== 'string' ||
      !input.checkoutKey.trim() ||
      input.checkoutKey.length > 128)
  )
    throw new Error('شناسهٔ سبد فروش نامعتبر است.');
  resolveInvoiceDates(input);
  const totals = calculateInvoice(input);
  if (
    !Object.entries(totals)
      .filter(([, value]) => typeof value === 'number')
      .every(([, value]) => Number.isSafeInteger(value) && (value as number) >= 0)
  )
    throw new Error('جمع فاکتور بیش از حد مجاز است.');
  return totals;
}

function paymentTerms(input: NewInvoiceInput, totals: InvoiceTotals, draft: boolean) {
  const method = input.paymentMethod ?? (input.isCredit ? 'credit' : 'cash');
  if (!['cash', 'card', 'transfer', 'credit'].includes(method))
    throw new Error('روش پرداخت نامعتبر است.');
  if (input.isCredit !== undefined && input.isCredit !== (method === 'credit'))
    throw new Error('نوع فروش با روش تسویه هم‌خوان نیست.');
  const isCredit = method === 'credit';
  if (!draft) {
    if (isCredit && input.customerId == null)
      throw new Error('برای فروش نسیه، یک مشتری ثبت‌شده انتخاب کنید.');
    if (input.cashTendered !== undefined && method !== 'cash')
      throw new Error('وجه نقد دریافتی فقط برای روش نقدی ثبت می‌شود.');
  }
  const tendered = method === 'cash' ? (input.cashTendered ?? totals.total) : undefined;
  if (
    !draft &&
    tendered !== undefined &&
    (!Number.isSafeInteger(tendered) || tendered < totals.total)
  )
    throw new Error('مبلغ نقد دریافتی از مبلغ فاکتور کمتر است یا معتبر نیست.');
  return { method, isCredit, tendered };
}

function signature(input: NewInvoiceInput, method: PaymentMethod, tendered?: number): string {
  return JSON.stringify({
    items: input.items.map((item) => ({
      productId: item.productId,
      name: item.name.trim(),
      qty: item.qty,
      unitPrice: item.unitPrice,
      discountType: item.discountType ?? 'percent',
      discountValue: item.discountValue ?? 0,
    })),
    customerId: input.customerId ?? null,
    customerName: input.customerId == null ? (input.customerName?.trim() ?? '') : undefined,
    discountType: input.discountType,
    discountValue: input.discountValue,
    taxPercent: input.taxPercent,
    shippingAmount: input.shippingAmount ?? 0,
    otherAmount: input.otherAmount ?? 0,
    method,
    tendered,
    note: input.note?.trim() ?? '',
    terms: input.terms?.trim() ?? '',
    internalNote: input.internalNote?.trim() ?? '',
    date: input.date ?? '',
    dueDate: input.dueDate ?? '',
  });
}

const issueTables = () => [
  db.products,
  db.invoices,
  db.invoiceItems,
  db.transactions,
  db.customers,
  db.stockMovements,
  db.settings,
  db.heldSales,
  db.financialEvents,
];

async function nextInvoiceNumber(): Promise<number> {
  const last = await db.invoices.orderBy('number').last();
  const counter = await db.settings.get('last-invoice-number');
  const previous =
    typeof counter?.value === 'number' && Number.isSafeInteger(counter.value) ? counter.value : 0;
  const number = Math.max(last?.number ?? 0, previous) + 1;
  if (!Number.isSafeInteger(number)) throw new Error('شمارهٔ فاکتور از حد مجاز گذشته است.');
  return number;
}

export async function createInvoice(input: NewInvoiceInput): Promise<number> {
  const totals = validateInvoice(input);
  const { method, isCredit, tendered } = paymentTerms(input, totals, false);
  const checkoutSignature = signature(input, method, tendered);
  if (input.draftId != null) {
    validId(input.draftId, 'شناسهٔ پیش‌نویس');
    if (input.expectedRevision == null) throw new Error('نسخهٔ پیش‌نویس برای صدور لازم است.');
  }
  return db.transaction('rw', issueTables(), async () => {
    let draft: Invoice | undefined;
    if (input.draftId != null) {
      draft = await db.invoices.get(input.draftId);
      if (!draft) throw new Error('پیش‌نویس پیدا نشد.');
      if (input.checkoutKey && input.checkoutKey !== draft.checkoutKey)
        throw new Error('شناسهٔ پیش‌نویس با سبد فروش هم‌خوان نیست.');
    }
    const key = input.checkoutKey ?? draft?.checkoutKey;
    const existing = key ? await db.invoices.where('checkoutKey').equals(key).first() : undefined;
    if (existing && existing.id !== draft?.id) {
      if (existing.status === 'draft')
        throw new Error('این سبد پیش‌نویس ذخیره‌شده دارد؛ همان پیش‌نویس را باز و صادر کنید.');
      if (existing.status === 'voided')
        throw new Error('این سبد قبلاً ثبت و باطل شده است؛ سبد جدید شروع کنید.');
      if (existing.checkoutSignature !== checkoutSignature)
        throw new Error('این سبد قبلاً با اطلاعات دیگری ثبت شده است؛ فاکتور قبلی را بررسی کنید.');
      return existing.id!;
    }
    if (draft) {
      if (draft.status === 'completed') {
        if (draft.checkoutSignature === checkoutSignature) return draft.id!;
        throw new Error('این پیش‌نویس قبلاً صادر شده است؛ فهرست را تازه کنید.');
      }
      if (draft.status !== 'draft') throw new Error('این سند قابل صدور نیست.');
      if ((draft.revision ?? 1) !== input.expectedRevision)
        throw new Error('پیش‌نویس در پنجرهٔ دیگری تغییر کرده است؛ آن را دوباره باز کنید.');
    }
    const customer =
      input.customerId != null ? await db.customers.get(input.customerId) : undefined;
    if (input.customerId != null && !customer) throw new Error('مشتری انتخاب‌شده دیگر وجود ندارد.');
    const now = nowISO();
    const dates = resolveInvoiceDates(input, draft?.date ?? now);
    const products = new Map<number, Product | undefined>();
    const quantities = new Map<number, bigint>();
    for (const item of input.items) {
      if (item.productId == null) continue;
      if (!products.has(item.productId))
        products.set(item.productId, await db.products.get(item.productId));
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0n) + decimalUnits(item.qty),
      );
    }
    for (const [productId, units] of quantities) {
      const product = products.get(productId);
      if (!product) throw new Error('یکی از کالاهای فاکتور یافت نشد.');
      if (!Number.isFinite(product.stock) || decimalUnits(product.stock, 'موجودی') < units)
        throw new Error(
          `موجودی «${product.name}» کافی نیست (موجودی فعلی: ${product.stock} ${product.unit}).`,
        );
      const quantity = Number(units) / 1_000_000;
      quantityAmount(quantity, product.costPrice);
      const stockAfter = Number(decimalUnits(product.stock) - units) / 1_000_000;
      await db.products.update(productId, { stock: roundStock(stockAfter), updatedAt: now });
    }
    const savedItems: Array<Omit<InvoiceItem, 'invoiceId'>> = totals.lines.map((line) => {
      const product = line.productId != null ? products.get(line.productId) : undefined;
      return {
        productId: line.productId,
        name: product?.name ?? line.name.trim(),
        qty: line.qty,
        unitPrice: line.unitPrice,
        unit: product?.unit ?? line.unit,
        unitCost: product?.costPrice ?? 0,
        total: line.grossTotal,
        discountType: line.discountType,
        discountValue: line.discountValue,
        discountAmount: line.discountAmount,
      };
    });
    const number = draft?.number ?? (await nextInvoiceNumber());
    const row: Invoice = {
      ...(draft ?? {}),
      id: draft?.id,
      number,
      ...dates,
      customerName: customer?.name ?? text(input.customerName, 200, 'نام خریدار'),
      customerId: customer?.id ?? null,
      customerPhone: customer?.phone,
      customerAddress: customer?.address,
      isCredit,
      subtotal: totals.subtotal,
      discountType: input.discountType,
      discountValue: input.discountValue,
      discountAmount: totals.discountAmount,
      taxPercent: input.taxPercent,
      taxAmount: totals.taxAmount,
      shippingAmount: totals.shippingAmount,
      otherAmount: totals.otherAmount,
      total: totals.total,
      status: 'completed',
      source: input.source ?? draft?.source ?? 'invoice',
      paymentMethod: method,
      cashTendered: tendered,
      changeAmount: tendered !== undefined ? tendered - totals.total : 0,
      note: text(input.note, 2000, 'یادداشت'),
      terms: text(input.terms, 1000, 'شرایط پرداخت'),
      internalNote: text(input.internalNote, 2000, 'یادداشت داخلی'),
      checkoutKey: key,
      checkoutSignature: key ? checkoutSignature : undefined,
      createdAt: draft?.createdAt ?? now,
      issuedAt: now,
      updatedAt: now,
      revision: (draft?.revision ?? 0) + 1,
    };
    const invoiceId = (await db.invoices.put(row)) as number;
    await db.settings.put({ key: 'last-invoice-number', value: number });
    if (draft) await db.invoiceItems.where('invoiceId').equals(invoiceId).delete();
    await db.invoiceItems.bulkAdd(savedItems.map((item) => ({ ...item, invoiceId })));
    // ستون total در سوابق قدیمی مبلغ قبل از تخفیف کل است؛ مقدار خالص فقط در محاسبات استفاده می‌شود.
    // تخفیف ردیف در فیلد مستقل ذخیره شده و subtotal سند جمع ردیف‌های خالص است.
    for (const [productId, units] of quantities) {
      const product = products.get(productId)!;
      const quantity = Number(units) / 1_000_000;
      await db.stockMovements.add({
        productId,
        productName: product.name,
        invoiceId,
        type: 'sale',
        quantity: -roundStock(quantity),
        stockBefore: product.stock,
        stockAfter: roundStock(Number(decimalUnits(product.stock) - units) / 1_000_000),
        note: `فروش فاکتور ${number}`,
        createdAt: now,
      });
    }
    await db.transactions.add({
      date: dates.date,
      type: 'income',
      category: 'فروش فروشگاه',
      amount: totals.total,
      description: `فاکتور ${number}${isCredit ? ' — نسیه' : ''}${customer ? ` — ${customer.name}` : ''}`,
      source: 'sale',
      invoiceId,
      createdAt: now,
    });
    await db.financialEvents.add({
      invoiceId,
      action: 'issued',
      amount: totals.total,
      createdAt: now,
    });
    if (input.heldSaleId != null) {
      const held = await db.heldSales.get(input.heldSaleId);
      if (held?.checkoutKey === key) await db.heldSales.delete(input.heldSaleId);
    }
    return invoiceId;
  });
}

/** پیش‌نویس شماره رزرو می‌کند، ولی موجودی، درآمد و بدهی نمی‌سازد. */
export async function saveInvoiceDraft(
  input: NewInvoiceInput,
  id?: number,
  expectedRevision?: number,
): Promise<number> {
  const totals = validateInvoice(input, true);
  const { method, isCredit, tendered } = paymentTerms(input, totals, true);
  const checkoutSignature = signature(input, method, tendered);
  if (id != null) {
    validId(id, 'شناسهٔ پیش‌نویس');
    if (
      expectedRevision == null ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision <= 0
    )
      throw new Error('نسخهٔ پیش‌نویس برای ویرایش لازم است.');
  }
  return db.transaction(
    'rw',
    [db.invoices, db.invoiceItems, db.customers, db.settings, db.financialEvents],
    async () => {
      const existing = id != null ? await db.invoices.get(id) : undefined;
      if (id != null && !existing) throw new Error('پیش‌نویس پیدا نشد.');
      if (existing && existing.status !== 'draft')
        throw new Error('فقط پیش‌نویس قابل ویرایش است؛ سند صادرشده را ابطال و کپی کنید.');
      if (existing && (existing.revision ?? 1) !== expectedRevision)
        throw new Error('پیش‌نویس در پنجرهٔ دیگری تغییر کرده است؛ فرم را دوباره باز کنید.');
      const key = input.checkoutKey?.trim() || existing?.checkoutKey || crypto.randomUUID();
      if (existing && existing.checkoutKey !== key)
        throw new Error('شناسهٔ پیش‌نویس تغییر نمی‌کند.');
      const duplicate = await db.invoices.where('checkoutKey').equals(key).first();
      if (duplicate && duplicate.id !== id)
        throw new Error('این سبد قبلاً ذخیره شده است؛ همان سند را باز کنید.');
      if (input.customerId != null && !(await db.customers.get(input.customerId)))
        throw new Error('مشتری انتخاب‌شده دیگر وجود ندارد.');
      const customer =
        input.customerId != null ? await db.customers.get(input.customerId) : undefined;
      const now = nowISO();
      const dates = resolveInvoiceDates(input, existing?.date ?? now);
      const number = existing?.number ?? (await nextInvoiceNumber());
      const revision = (existing?.revision ?? 0) + 1;
      const invoiceId = (await db.invoices.put({
        ...(existing ?? {}),
        id,
        number,
        ...dates,
        customerName: customer?.name ?? text(input.customerName, 200, 'نام خریدار'),
        customerId: customer?.id ?? null,
        customerPhone: customer?.phone,
        customerAddress: customer?.address,
        isCredit,
        subtotal: totals.subtotal,
        discountType: input.discountType,
        discountValue: input.discountValue,
        discountAmount: totals.discountAmount,
        taxPercent: input.taxPercent,
        taxAmount: totals.taxAmount,
        shippingAmount: totals.shippingAmount,
        otherAmount: totals.otherAmount,
        total: totals.total,
        status: 'draft',
        source: input.source ?? existing?.source ?? 'invoice',
        paymentMethod: method,
        cashTendered: tendered,
        changeAmount: tendered !== undefined ? Math.max(0, tendered - totals.total) : 0,
        note: text(input.note, 2000, 'یادداشت'),
        terms: text(input.terms, 1000, 'شرایط پرداخت'),
        internalNote: text(input.internalNote, 2000, 'یادداشت داخلی'),
        checkoutKey: key,
        checkoutSignature,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        revision,
      })) as number;
      await db.settings.put({ key: 'last-invoice-number', value: number });
      await db.invoiceItems.where('invoiceId').equals(invoiceId).delete();
      await db.invoiceItems.bulkAdd(
        totals.lines.map((line) => ({
          invoiceId,
          productId: line.productId,
          name: line.name.trim(),
          qty: line.qty,
          unitPrice: line.unitPrice,
          unit: line.unit,
          unitCost: 0,
          total: line.grossTotal,
          discountType: line.discountType,
          discountValue: line.discountValue,
          discountAmount: line.discountAmount,
        })),
      );
      await db.financialEvents.add({
        invoiceId,
        action: 'draft_saved',
        amount: totals.total,
        createdAt: now,
      });
      return invoiceId;
    },
  );
}

export async function issueInvoice(id: number, expectedRevision: number): Promise<number> {
  const draft = await db.invoices.get(id);
  if (!draft) throw new Error('پیش‌نویس پیدا نشد.');
  if (draft.status === 'completed' && (draft.revision ?? 1) === expectedRevision + 1) return id;
  if (draft.status !== 'draft') throw new Error('این سند پیش‌نویس نیست.');
  const items = await db.invoiceItems.where('invoiceId').equals(id).toArray();
  return createInvoice({
    draftId: id,
    expectedRevision,
    checkoutKey: draft.checkoutKey,
    items: items.map((item) => ({
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      unit: item.unit,
      discountType: item.discountType,
      discountValue: item.discountValue,
    })),
    customerId: draft.customerId,
    customerName: draft.customerName,
    paymentMethod: draft.paymentMethod,
    cashTendered: draft.cashTendered,
    discountType: draft.discountType,
    discountValue: draft.discountValue,
    taxPercent: draft.taxPercent,
    shippingAmount: draft.shippingAmount,
    otherAmount: draft.otherAmount,
    date: draft.date,
    dueDate: draft.dueDate,
    note: draft.note,
    terms: draft.terms,
    internalNote: draft.internalNote,
    source: draft.source,
  });
}

/** کپی، پیش‌نویس تازه است؛ شماره، کلید تسویه، پرداخت و اثر انباری کپی نمی‌شوند. */
export async function copyInvoiceToDraft(id: number): Promise<number> {
  const invoice = await db.invoices.get(id);
  if (!invoice) throw new Error('فاکتور پیدا نشد.');
  const items = await db.invoiceItems.where('invoiceId').equals(id).toArray();
  return saveInvoiceDraft({
    items: items.map((item) => ({
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      unit: item.unit,
      discountType: item.discountType,
      discountValue: item.discountValue,
    })),
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    paymentMethod: invoice.paymentMethod,
    discountType: invoice.discountType,
    discountValue: invoice.discountValue,
    taxPercent: invoice.taxPercent,
    shippingAmount: invoice.shippingAmount,
    otherAmount: invoice.otherAmount,
    note: invoice.note,
    terms: invoice.terms,
    internalNote: invoice.internalNote,
    checkoutKey: crypto.randomUUID(),
    source: 'invoice',
  });
}

export async function discardInvoiceDraft(id: number, expectedRevision: number): Promise<void> {
  await db.transaction('rw', [db.invoices, db.invoiceItems, db.financialEvents], async () => {
    const draft = await db.invoices.get(id);
    if (!draft || draft.status !== 'draft') throw new Error('فقط پیش‌نویس قابل حذف است.');
    if ((draft.revision ?? 1) !== expectedRevision)
      throw new Error('پیش‌نویس تغییر کرده است؛ دوباره باز کنید.');
    await db.invoiceItems.where('invoiceId').equals(id).delete();
    await db.invoices.delete(id);
    await db.financialEvents.add({
      invoiceId: id,
      action: 'draft_discarded',
      reason: `حذف پیش‌نویس ${draft.number}`,
      createdAt: nowISO(),
    });
  });
}

/** ابطال با حفظ اصل سند و دریافت‌ها؛ دریافت قبلی به بستانکاری مشتری تبدیل می‌شود. */
export async function voidInvoice(invoiceId: number, reason: string): Promise<void> {
  const trimmed = reason.trim();
  if (trimmed.length < 3 || trimmed.length > 500)
    throw new Error('دلیل ابطال باید بین ۳ و ۵۰۰ نویسه باشد.');
  await db.transaction(
    'rw',
    [
      db.products,
      db.invoices,
      db.invoiceItems,
      db.transactions,
      db.stockMovements,
      db.customerPayments,
      db.financialEvents,
    ],
    async () => {
      const invoice = await db.invoices.get(invoiceId);
      if (!invoice) throw new Error('فاکتور پیدا نشد.');
      if (invoice.status === 'voided') return;
      if (invoice.status === 'draft')
        throw new Error('پیش‌نویس اثر مالی ندارد؛ از حذف پیش‌نویس استفاده کنید.');
      const now = nowISO();
      const items = await db.invoiceItems.where('invoiceId').equals(invoiceId).toArray();
      const quantities = new Map<number, bigint>();
      for (const item of items)
        if (item.productId != null)
          quantities.set(
            item.productId,
            (quantities.get(item.productId) ?? 0n) + decimalUnits(item.qty, 'تعداد'),
          );
      for (const [productId, units] of quantities) {
        const product = await db.products.get(productId);
        if (!product)
          throw new Error(
            `برای برگشت موجودی، کالای «${items.find((item) => item.productId === productId)?.name}» باید در انبار وجود داشته باشد.`,
          );
        const afterUnits = decimalUnits(product.stock, 'موجودی') + units;
        if (afterUnits > 1_000_000_000_000_000n)
          throw new Error('موجودی برگشتی از حد مجاز بیشتر است.');
        const stockAfter = roundStock(Number(afterUnits) / 1_000_000);
        await db.products.update(productId, { stock: stockAfter, updatedAt: now });
        await db.stockMovements.add({
          productId,
          productName: product.name,
          invoiceId,
          type: 'void',
          quantity: Number(units) / 1_000_000,
          stockBefore: product.stock,
          stockAfter,
          note: trimmed,
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
        voidReason: trimmed,
        updatedAt: now,
        revision: (invoice.revision ?? 1) + 1,
      });
      await db.financialEvents.add({
        invoiceId,
        action: 'voided',
        amount: invoice.total,
        reason: trimmed,
        createdAt: now,
      });
    },
  );
}

/** سازگاری با فراخوانی قبلی؛ سند مالی صادرشده حذف فیزیکی نمی‌شود. */
export async function deleteInvoice(invoiceId: number): Promise<void> {
  await voidInvoice(invoiceId, 'ابطال فاکتور توسط کاربر');
}

/** جمع ایمن برای گزارش‌ها؛ فاکتور خراب موجودی یا درآمد را پنهان نمی‌کند. */
export function safeInvoiceTotal(invoices: Invoice[]): number {
  return sumMoney(
    invoices
      .filter((invoice) => invoice.status !== 'voided' && invoice.status !== 'draft')
      .map((invoice) => invoice.total),
  );
}
