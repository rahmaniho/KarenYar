import { describe, expect, it } from 'vitest';
import type { Budget, Debt, Transaction } from '@/core/db/db';
import {
  budgetStatus,
  categoryTotals,
  debtStatus,
  monthlySeries,
  sumTransactions,
} from './personal-calc';

const tx = (partial: Partial<Transaction>): Transaction => ({
  date: new Date().toISOString(),
  type: 'expense',
  category: 'خوراک',
  amount: 0,
  createdAt: new Date().toISOString(),
  ...partial,
});

describe('مجموع تراکنش‌ها', () => {
  it('درآمد و هزینه جدا جمع می‌شوند', () => {
    const totals = sumTransactions([
      tx({ type: 'income', amount: 1000 }),
      tx({ type: 'expense', amount: 300 }),
      tx({ type: 'income', amount: 500 }),
    ]);
    expect(totals).toEqual({ income: 1500, expense: 300, balance: 1200 });
  });

  it('مجموع دسته‌ها با سهم درصدی درست است', () => {
    const cats = categoryTotals(
      [
        tx({ category: 'الف', amount: 300 }),
        tx({ category: 'ب', amount: 100 }),
        tx({ category: 'الف', amount: 100 }),
      ],
      'expense',
    );
    expect(cats[0]).toMatchObject({ category: 'الف', total: 400, percent: 80 });
    expect(cats).toHaveLength(2);
  });

  it('سری ماهانه همیشه n نقطه برمی‌گرداند', () => {
    const series = monthlySeries([], 6);
    expect(series).toHaveLength(6);
    expect(series[5].income).toBe(0);
  });
});

describe('وضعیت بودجه', () => {
  const budget: Budget = { month: '1404-07', category: 'خوراک', limit: 1000 };

  it('مصرف و عبور از سقف تشخیص داده می‌شود', () => {
    // ۱۴ مهر ۱۴۰۴ میلادی = 2025-10-06
    const spent = budgetStatus(budget, [
      tx({ date: new Date(2025, 9, 6).toISOString(), amount: 1200, category: 'خوراک' }),
    ]);
    expect(spent.spent).toBe(1200);
    expect(spent.isOver).toBe(true);
    expect(spent.remaining).toBe(-200);
  });

  it('نزدیک سقف (۸۰٪) هشدار می‌دهد', () => {
    const status = budgetStatus(budget, [
      tx({ date: new Date(2025, 9, 6).toISOString(), amount: 850, category: 'خوراک' }),
    ]);
    expect(status.isNearLimit).toBe(true);
    expect(status.isOver).toBe(false);
  });

  it('تراکنش ماه دیگر حساب نمی‌شود', () => {
    const status = budgetStatus(budget, [
      tx({ date: new Date(2025, 8, 1).toISOString(), amount: 900, category: 'خوراک' }),
    ]);
    expect(status.spent).toBe(0);
  });
});

describe('وضعیت بدهی و قسط', () => {
  const now = new Date(2025, 9, 6);

  it('قسط پرداخت‌شده و مانده درست محاسبه می‌شود', () => {
    const debt: Debt = {
      title: 'وام',
      kind: 'installment',
      amount: 12_000,
      paidAmount: 0,
      installmentsCount: 12,
      installmentAmount: 1000,
      paidInstallments: 5,
      dueDate: new Date(2025, 9, 10).toISOString(),
      createdAt: now.toISOString(),
    };
    const status = debtStatus(debt, now);
    expect(status.paid).toBe(5000);
    expect(status.remaining).toBe(7000);
    expect(status.isSettled).toBe(false);
    expect(status.daysToDue).toBe(4);
  });

  it('سررسید گذشته overdue است و تسویه‌شده نه', () => {
    const debt: Debt = {
      title: 'بدهی',
      kind: 'debt',
      amount: 500,
      paidAmount: 100,
      dueDate: new Date(2025, 9, 1).toISOString(),
      createdAt: now.toISOString(),
    };
    expect(debtStatus(debt, now).isOverdue).toBe(true);
    const settled = debtStatus({ ...debt, paidAmount: 500 }, now);
    expect(settled.isSettled).toBe(true);
    expect(settled.isOverdue).toBe(false);
  });
});
