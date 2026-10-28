import type { Invoice, PaymentMethod } from '@/core/db/db';
import { roundMoney } from '@/core/currency/currency';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدی',
  card: 'کارت‌خوان',
  transfer: 'انتقال بانکی',
  credit: 'نسیه',
};

export function invoicePaymentMethod(invoice: Invoice): PaymentMethod {
  return invoice.paymentMethod ?? (invoice.isCredit ? 'credit' : 'cash');
}

export function cashChange(total: number, tendered: number): number {
  return roundMoney(Math.max(0, tendered - total));
}

export function normalizeSearch(value: string): string {
  return value
    .replaceAll('ي', 'ی')
    .replaceAll('ك', 'ک')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .toLocaleLowerCase('fa-IR')
    .trim();
}

/** مبلغ روش تسویه، نه مبلغ وجه نقد تحویلی قبل از کسر باقی پول. */
export function settlementBreakdown(
  invoices: Invoice[],
): { method: PaymentMethod; total: number; count: number }[] {
  return (Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => {
    const scoped = invoices.filter(
      (i) => i.status !== 'voided' && invoicePaymentMethod(i) === method,
    );
    return {
      method,
      total: scoped.reduce((sum, invoice) => sum + invoice.total, 0),
      count: scoped.length,
    };
  });
}
