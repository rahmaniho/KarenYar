/**
 * سرویس فاکتور — ساخت و حذف فاکتور به‌صورت تراکنشی همراه با به‌روزرسانی موجودی انبار
 */
import { db, nowISO, type Invoice } from '@/core/db/db';
import { applyDiscount, vatAmount } from '@/core/calc/finance';
import { roundMoney } from '@/core/currency/currency';

export interface NewInvoiceItemInput {
  productId: number | null;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface NewInvoiceInput {
  customerName?: string;
  items: NewInvoiceItemInput[];
  discountType: 'percent' | 'amount';
  /** مقدار تخفیف به تومان (در حالت مبلغی) یا درصد (در حالت درصدی) — تومان داخلی */
  discountValue: number;
  taxPercent: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
}

/** محاسبه‌ی جمع‌های فاکتور (مالیات روی مبلغ بعد از تخفیف) */
export function calculateInvoiceTotals(
  items: Pick<NewInvoiceItemInput, 'qty' | 'unitPrice'>[],
  discountType: 'percent' | 'amount',
  discountValue: number,
  taxPercent: number,
): InvoiceTotals {
  const subtotal = roundMoney(items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0));
  const { discountAmount } = applyDiscount(subtotal, discountType, discountValue);
  const taxableBase = subtotal - discountAmount;
  const taxAmount = vatAmount(taxableBase, taxPercent);
  return {
    subtotal,
    discountAmount,
    taxableBase,
    taxAmount,
    total: taxableBase + taxAmount,
  };
}

/** ساخت فاکتور جدید؛ موجودی کالاها در همان تراکنش کم می‌شود. خطاها پیام فارسی دارند. */
export async function createInvoice(input: NewInvoiceInput): Promise<number> {
  if (input.items.length === 0) throw new Error('فاکتور خالی است؛ حداقل یک قلم اضافه کنید.');
  for (const item of input.items) {
    if (item.qty <= 0) throw new Error(`تعداد «${item.name}» باید بیشتر از صفر باشد.`);
    if (item.unitPrice < 0) throw new Error(`قیمت «${item.name}» نامعتبر است.`);
  }

  return db.transaction('rw', db.products, db.invoices, db.invoiceItems, async () => {
    // بررسی و کسر موجودی
    const costByItem: number[] = [];
    for (const item of input.items) {
      if (item.productId == null) {
        costByItem.push(0);
        continue;
      }
      const product = await db.products.get(item.productId);
      if (!product) throw new Error(`کالای «${item.name}» یافت نشد.`);
      if (product.stock < item.qty) {
        throw new Error(
          `موجودی «${product.name}» کافی نیست (موجودی فعلی: ${product.stock} ${product.unit}).`,
        );
      }
      await db.products.update(product.id!, {
        stock: product.stock - item.qty,
        updatedAt: nowISO(),
      });
      costByItem.push(product.costPrice);
    }

    const totals = calculateInvoiceTotals(
      input.items,
      input.discountType,
      input.discountValue,
      input.taxPercent,
    );

    const last = await db.invoices.orderBy('number').last();
    const number = (last?.number ?? 0) + 1;
    const now = nowISO();
    const invoiceId = (await db.invoices.add({
      number,
      date: now,
      customerName: input.customerName?.trim() ? input.customerName.trim() : undefined,
      subtotal: totals.subtotal,
      discountType: input.discountType,
      discountValue: input.discountValue,
      discountAmount: totals.discountAmount,
      taxPercent: input.taxPercent,
      taxAmount: totals.taxAmount,
      total: totals.total,
      createdAt: now,
    } satisfies Omit<Invoice, 'id'>)) as number;

    await db.invoiceItems.bulkAdd(
      input.items.map((item, i) => ({
        invoiceId,
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        unitCost: costByItem[i] ?? 0,
        total: roundMoney(item.qty * item.unitPrice),
      })),
    );
    return invoiceId;
  });
}

/** حذف فاکتور و برگرداندن موجودی کالاهای آن */
export async function deleteInvoice(invoiceId: number): Promise<void> {
  await db.transaction('rw', db.products, db.invoices, db.invoiceItems, async () => {
    const items = await db.invoiceItems.where('invoiceId').equals(invoiceId).toArray();
    for (const item of items) {
      if (item.productId == null) continue;
      const product = await db.products.get(item.productId);
      if (product) {
        await db.products.update(product.id!, {
          stock: product.stock + item.qty,
          updatedAt: nowISO(),
        });
      }
    }
    await db.invoiceItems.where('invoiceId').equals(invoiceId).delete();
    await db.invoices.delete(invoiceId);
  });
}
