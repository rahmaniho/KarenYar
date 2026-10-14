import { describe, expect, it } from 'vitest';
import type { Budget, Customer, Debt, Invoice, Product, Transaction } from '@/core/db/db';
import { jalaliMonthKey } from '@/core/jalali/jalali';
import { computeAlerts } from './alerts';

const NOW = new Date('2026-10-15T12:00:00');
const base = {
  now: NOW,
  products: [] as Product[],
  debts: [] as Debt[],
  budgets: [] as Budget[],
  transactions: [] as Transaction[],
  invoices: [] as Invoice[],
  customerPayments: [],
  customers: [] as Customer[],
};

describe('computeAlerts', () => {
  it('بدهی سررسیدگذشته و نزدیک را تشخیص می‌دهد', () => {
    const debts: Debt[] = [
      {
        id: 1,
        title: 'وام',
        kind: 'debt',
        amount: 1000,
        paidAmount: 0,
        dueDate: '2026-10-10',
        createdAt: '2026-01-01',
      },
      {
        id: 2,
        title: 'قسط',
        kind: 'debt',
        amount: 1000,
        paidAmount: 0,
        dueDate: '2026-10-17',
        createdAt: '2026-01-01',
      },
      {
        id: 3,
        title: 'تسویه‌شده',
        kind: 'debt',
        amount: 1000,
        paidAmount: 1000,
        dueDate: '2026-10-01',
        createdAt: '2026-01-01',
      },
    ];
    const alerts = computeAlerts({ ...base, debts });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.kind).toBe('debt-overdue');
    expect(alerts[1]?.kind).toBe('debt-soon');
  });

  it('موجودی کم و بودجه‌ی ردشده را گزارش می‌کند', () => {
    const products: Product[] = [
      {
        id: 1,
        name: 'کابل',
        category: 'جانبی',
        buyPrice: 100,
        buyTaxPercent: 0,
        shippingPerUnit: 0,
        overheadPerUnit: 0,
        costPrice: 100,
        sellPrice: 200,
        stock: 1,
        unit: 'عدد',
        minStock: 5,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];
    const budgets: Budget[] = [
      {
        id: 1,
        month: jalaliMonthKey(new Date('2026-10-10T00:00:00')),
        category: 'خوراک',
        limit: 1000,
      },
    ];
    const transactions: Transaction[] = [
      {
        id: 1,
        type: 'expense',
        category: 'خوراک',
        amount: 1500,
        date: '2026-10-10',
        createdAt: '2026-10-10',
      },
    ];
    const alerts = computeAlerts({ ...base, products, budgets, transactions });
    expect(alerts.map((a) => a.kind)).toEqual(expect.arrayContaining(['low-stock', 'budget-over']));
  });

  it('نسیه‌ی تازه (کمتر از ۷ روز) هشدار ندارد ولی قدیمی دارد', () => {
    const customers: Customer[] = [{ id: 5, name: 'مشتری تست', createdAt: '2026-01-01' }];
    const invoices: Invoice[] = [
      {
        id: 1,
        number: 1,
        date: '2026-10-13',
        customerId: 5,
        customerName: 'مشتری تست',
        isCredit: true,
        subtotal: 500,
        discountType: 'amount',
        discountValue: 0,
        discountAmount: 0,
        taxPercent: 0,
        taxAmount: 0,
        total: 500,
        createdAt: '2026-10-13',
      },
      {
        id: 2,
        number: 2,
        date: '2026-09-20',
        customerId: 5,
        customerName: 'مشتری تست',
        isCredit: true,
        subtotal: 300,
        discountType: 'amount',
        discountValue: 0,
        discountAmount: 0,
        taxPercent: 0,
        taxAmount: 0,
        total: 300,
        createdAt: '2026-09-20',
      },
    ];
    const alerts = computeAlerts({ ...base, customers, invoices });
    expect(alerts.filter((a) => a.kind === 'credit-overdue')).toHaveLength(1);
  });
});
