/**
 * محاسبات خالص حساب‌یار شخصی — مجموع‌ها، سری ماهانه، وضعیت بودجه و بدهی
 */
import type { Budget, Debt, Transaction } from '@/core/db/db';
import {
  addJalaliMonths,
  currentJalaliMonthKey,
  jalaliMonthKey,
  jalaliMonthLabel,
} from '@/core/jalali/jalali';

export interface Totals {
  income: number;
  expense: number;
  balance: number;
}

export function sumTransactions(transactions: Transaction[]): Totals {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

export function filterByMonthKey(transactions: Transaction[], monthKey: string): Transaction[] {
  return transactions.filter((t) => jalaliMonthKey(new Date(t.date)) === monthKey);
}

export interface CategoryTotal {
  category: string;
  total: number;
  percent: number;
}

/** مجموع هزینه/درآمد هر دسته به‌ترتیب نزولی + سهم درصدی */
export function categoryTotals(
  transactions: Transaction[],
  type: 'income' | 'expense',
): CategoryTotal[] {
  const map = new Map<string, number>();
  let grand = 0;
  for (const t of transactions) {
    if (t.type !== type) continue;
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    grand += t.amount;
  }
  return [...map.entries()]
    .map(([category, total]) => ({
      category,
      total,
      percent: grand > 0 ? (total / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface MonthSeriesPoint {
  key: string;
  label: string;
  income: number;
  expense: number;
}

/** سری درآمد/هزینه‌ی n ماه اخیر شمسی (شامل ماه جاری) */
export function monthlySeries(transactions: Transaction[], monthCount: number): MonthSeriesPoint[] {
  const points: MonthSeriesPoint[] = [];
  const current = currentJalaliMonthKey();
  for (let i = monthCount - 1; i >= 0; i--) {
    const key = addJalaliMonths(current, -i);
    const monthTransactions = filterByMonthKey(transactions, key);
    const totals = sumTransactions(monthTransactions);
    points.push({
      key,
      label: jalaliMonthLabel(key),
      income: totals.income,
      expense: totals.expense,
    });
  }
  return points;
}

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  remaining: number;
  /** درصد مصرف بودجه (ممکن است بالای ۱۰۰ باشد) */
  percent: number;
  isOver: boolean;
  isNearLimit: boolean;
}

export function budgetStatus(budget: Budget, transactions: Transaction[]): BudgetStatus {
  const monthTransactions = filterByMonthKey(transactions, budget.month);
  const spent = monthTransactions
    .filter((t) => t.type === 'expense' && t.category === budget.category)
    .reduce((sum, t) => sum + t.amount, 0);
  const percent = budget.limit > 0 ? (spent / budget.limit) * 100 : 0;
  return {
    budget,
    spent,
    remaining: budget.limit - spent,
    percent,
    isOver: spent > budget.limit,
    isNearLimit: !!(budget.limit > 0 && percent >= 80 && spent <= budget.limit),
  };
}

export interface DebtStatus {
  debt: Debt;
  paid: number;
  remaining: number;
  percent: number;
  isSettled: boolean;
  isOverdue: boolean;
  /** روزهای مانده تا سررسید (منفی یعنی گذشته) */
  daysToDue: number;
}

export function debtStatus(debt: Debt, now: Date = new Date()): DebtStatus {
  const paid =
    debt.kind === 'installment'
      ? (debt.paidInstallments ?? 0) * (debt.installmentAmount ?? 0)
      : debt.paidAmount;
  const remaining = Math.max(0, debt.amount - paid);
  const isSettled = remaining <= 0;
  const due = new Date(debt.dueDate);
  const daysToDue = Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  return {
    debt,
    paid: Math.min(paid, debt.amount),
    remaining,
    percent: debt.amount > 0 ? Math.min(100, (paid / debt.amount) * 100) : 100,
    isSettled,
    isOverdue: !isSettled && daysToDue < 0,
    daysToDue,
  };
}

/** بدهی‌های تسویه‌نشده‌ای که سررسیدشان نزدیک است (برای هشدار داشبورد) */
export function upcomingDebts(
  debts: Debt[],
  withinDays: number,
  now: Date = new Date(),
): DebtStatus[] {
  return debts
    .map((d) => debtStatus(d, now))
    .filter((s) => !s.isSettled && s.daysToDue <= withinDays)
    .sort((a, b) => a.daysToDue - b.daysToDue);
}
