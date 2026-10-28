/**
 * محاسبات خالص دفتر مشتریان — مانده حساب، مطالبات و صورت‌حساب مشتری
 */
import type { CustomerPayment, Invoice } from '@/core/db/db';
import { isActiveInvoice } from './store-calc';

export interface CustomerBalance {
  /** جمع فروش‌های نسیه */
  creditTotal: number;
  /** جمع پرداخت‌های مشتری */
  paidTotal: number;
  /** مانده بدهی مشتری (مثبت یعنی مشتری بدهکار است) */
  balance: number;
  /** تعداد فاکتورهای نسیه */
  creditInvoiceCount: number;
}

/** مانده‌ی حساب یک مشتری = فروش‌های نسیه‌ی او − پرداخت‌هایش */
export function customerBalance(
  customerId: number,
  invoices: Invoice[],
  payments: CustomerPayment[],
): CustomerBalance {
  const creditInvoices = invoices.filter(
    (i) => i.customerId === customerId && i.isCredit && isActiveInvoice(i),
  );
  const creditTotal = creditInvoices.reduce((s, i) => s + i.total, 0);
  const paidTotal = payments
    .filter((p) => p.customerId === customerId)
    .reduce((s, p) => s + p.amount, 0);
  return {
    creditTotal,
    paidTotal,
    balance: creditTotal - paidTotal,
    creditInvoiceCount: creditInvoices.length,
  };
}

/** جمع کل مطالبات فروشگاه از همه‌ی مشتریان (فقط مانده‌های مثبت) */
export function totalReceivables(invoices: Invoice[], payments: CustomerPayment[]): number {
  const ids = new Set<number>();
  for (const i of invoices)
    if (i.customerId != null && i.isCredit && isActiveInvoice(i)) ids.add(i.customerId);
  let total = 0;
  for (const id of ids) {
    const { balance } = customerBalance(id, invoices, payments);
    if (balance > 0) total += balance;
  }
  return total;
}

export type StatementRow =
  | { kind: 'invoice'; date: string; id: number; number: number; amount: number }
  | { kind: 'payment'; date: string; id: number; amount: number; note?: string };

/** صورت‌حساب مشتری: فاکتورهای نسیه و پرداخت‌ها به ترتیب زمانی با مانده‌ی جاری */
export function customerStatement(
  customerId: number,
  invoices: Invoice[],
  payments: CustomerPayment[],
): (StatementRow & { runningBalance: number })[] {
  const rows: StatementRow[] = [
    ...invoices
      .filter((i) => i.customerId === customerId && i.isCredit && isActiveInvoice(i))
      .map((i): StatementRow => ({
        kind: 'invoice',
        date: i.date,
        id: i.id!,
        number: i.number,
        amount: i.total,
      })),
    ...payments
      .filter((p) => p.customerId === customerId)
      .map((p): StatementRow => ({
        kind: 'payment',
        date: p.date,
        id: p.id!,
        amount: p.amount,
        note: p.note,
      })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = 0;
  return rows.map((row) => {
    running += row.kind === 'invoice' ? row.amount : -row.amount;
    return { ...row, runningBalance: running };
  });
}
