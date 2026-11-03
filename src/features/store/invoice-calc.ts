/** محاسبات خالص فاکتور؛ مستقل از UI و IndexedDB. همهٔ خروجی‌ها تومان صحیح‌اند. */
import type { DiscountType } from '@/core/calc/finance';
import { assertMoney, percentageAmount, quantityAmount, sumMoney } from '@/core/currency/money';

export interface InvoiceLineInput {
  productId: number | null;
  name: string;
  qty: number;
  unitPrice: number;
  unit?: string;
  /** اختیاری برای سازگاری با سبدها و فاکتورهای نسخه‌های قبل */
  discountType?: DiscountType;
  discountValue?: number;
}

export interface InvoicePricingInput {
  items: InvoiceLineInput[];
  discountType: DiscountType;
  discountValue: number;
  taxPercent: number;
  shippingAmount?: number;
  otherAmount?: number;
}

export interface CalculatedInvoiceLine extends InvoiceLineInput {
  grossTotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  /** جمع ردیف پس از تخفیف ردیف، پیش از تخفیف کل و مالیات */
  total: number;
}

export interface InvoiceTotals {
  /** جمع ردیف‌ها پس از تخفیف ردیفی؛ سازگار با معنای subtotal در نسخه‌های قبل */
  subtotal: number;
  grossSubtotal: number;
  lineDiscountAmount: number;
  /** تخفیف کل سند، جدا از تخفیف ردیف */
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  shippingAmount: number;
  otherAmount: number;
  /** مالیات روی خالص کالا پس از تخفیف است؛ حمل/سایر هزینه‌ها مالیات جدا ندارند. */
  total: number;
  lines: CalculatedInvoiceLine[];
}

export function lineDiscount(gross: number, type: DiscountType = 'percent', value = 0): number {
  if (!['percent', 'amount'].includes(type)) throw new Error('نوع تخفیف ردیف نامعتبر است.');
  const discount =
    type === 'percent' ? percentageAmount(gross, value) : assertMoney(value, 'تخفیف ردیف');
  if (discount > gross) throw new Error('تخفیف ردیف نباید از مبلغ ردیف بیشتر باشد.');
  return discount;
}

export function calculateInvoice(input: InvoicePricingInput): InvoiceTotals {
  const lines = input.items.map((item) => {
    const grossTotal = quantityAmount(item.qty, item.unitPrice);
    const discountType = item.discountType ?? 'percent';
    const discountValue = item.discountValue ?? 0;
    const discountAmount = lineDiscount(grossTotal, discountType, discountValue);
    return {
      ...item,
      grossTotal,
      discountType,
      discountValue,
      discountAmount,
      total: grossTotal - discountAmount,
    };
  });
  const subtotal = sumMoney(lines.map((line) => line.total));
  const grossSubtotal = sumMoney(lines.map((line) => line.grossTotal));
  const lineDiscountAmount = sumMoney(lines.map((line) => line.discountAmount));
  if (!['percent', 'amount'].includes(input.discountType))
    throw new Error('نوع تخفیف نامعتبر است.');
  const discountAmount = lineDiscount(subtotal, input.discountType, input.discountValue);
  const taxableBase = subtotal - discountAmount;
  // رفتار نمایش قدیمی برای نرخ منفی حفظ می‌شود؛ سرویس ثبت، نرخ منفی را رد می‌کند.
  const taxAmount = percentageAmount(taxableBase, Math.max(0, input.taxPercent));
  const shippingAmount = assertMoney(input.shippingAmount ?? 0, 'هزینهٔ حمل');
  const otherAmount = assertMoney(input.otherAmount ?? 0, 'سایر هزینه‌ها');
  return {
    subtotal,
    grossSubtotal,
    lineDiscountAmount,
    discountAmount,
    taxableBase,
    taxAmount,
    shippingAmount,
    otherAmount,
    total: sumMoney([taxableBase, taxAmount, shippingAmount, otherAmount]),
    lines,
  };
}

/** تخصیص تخفیف کل با جمع‌بستن باقیمانده؛ جمع مبالغ چاپ با سند اختلاف یک تومان ندارد. */
export function allocateInvoiceDiscount(
  invoice: { subtotal: number; discountAmount: number },
  items: { total: number }[],
): number[] {
  if (!invoice.subtotal || !invoice.discountAmount) return items.map(() => 0);
  const denominator = BigInt(invoice.subtotal);
  const shares = items.map((item) =>
    Number((BigInt(item.total) * BigInt(invoice.discountAmount)) / denominator),
  );
  let remainder = invoice.discountAmount - sumMoney(shares);
  const order = items
    .map((item, index) => ({
      index,
      fraction: (BigInt(item.total) * BigInt(invoice.discountAmount)) % denominator,
    }))
    .sort((a, b) =>
      a.fraction === b.fraction ? a.index - b.index : a.fraction > b.fraction ? -1 : 1,
    );
  for (const entry of order) {
    if (remainder <= 0) break;
    shares[entry.index] += 1;
    remainder -= 1;
  }
  return shares;
}
