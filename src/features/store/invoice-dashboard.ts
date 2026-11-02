/**
 * داشبورد ماژول فاکتور — همه‌ی شاخص‌ها از داده‌ی واقعی سیستم محاسبه می‌شوند.
 * (هیچ عدد ثابت یا داده‌ی نمایشی در این فایل وجود ندارد.)
 */
import type { CustomerPayment, Invoice } from '@/core/db/db';
import {
  addJalaliMonths,
  currentJalaliMonthKey,
  jalaliMonthKey,
  jalaliMonthLabel,
  jalaliMonthRange,
} from '@/core/jalali/jalali';
import { invoiceDueDate, invoicePaymentState, invoiceStats } from './invoice-domain';

export type DashboardRange = '7d' | '30d' | '90d' | 'month' | 'prev-month' | 'all';

export const RANGE_LABELS: Record<DashboardRange, string> = {
  '7d': '۷ روز اخیر',
  '30d': '۳۰ روز اخیر',
  '90d': '۹۰ روز اخیر',
  month: 'ماه جاری',
  'prev-month': 'ماه گذشته',
  all: 'همه‌ی دوره‌ها',
};

export interface DateRange {
  /** شروع بازه (میلادی) */
  start: Date;
  /** پایان بازه (میلادی، انحصاری) */
  end: Date;
}

/** بازه‌ی میلادی معادل انتخاب کاربر */
export function dashboardRange(range: DashboardRange, now: Date = new Date()): DateRange | null {
  const end = new Date(now.getTime() + 1);
  switch (range) {
    case '7d':
      return { start: new Date(now.getTime() - 7 * 86_400_000), end };
    case '30d':
      return { start: new Date(now.getTime() - 30 * 86_400_000), end };
    case '90d':
      return { start: new Date(now.getTime() - 90 * 86_400_000), end };
    case 'month': {
      const { start, end: monthEnd } = jalaliMonthRange(currentJalaliMonthKey());
      return { start, end: monthEnd };
    }
    case 'prev-month': {
      const prev = addJalaliMonths(currentJalaliMonthKey(), -1);
      const { start, end: monthEnd } = jalaliMonthRange(prev);
      return { start, end: monthEnd };
    }
    case 'all':
    default:
      return null;
  }
}

export function invoicesInRange(invoices: Invoice[], range: DateRange | null): Invoice[] {
  if (!range) return invoices;
  return invoices.filter((invoice) => {
    const time = new Date(invoice.date).getTime();
    return time >= range.start.getTime() && time < range.end.getTime();
  });
}

export interface DashboardMetric {
  value: number;
  /** مقدار دوره‌ی قبل برای مقایسه */
  previous: number;
  /** تغییر درصدی (null وقتی دوره‌ی قبل صفر است) */
  changePercent: number | null;
}

function metric(value: number, previous: number): DashboardMetric {
  return {
    value,
    previous,
    changePercent: previous > 0 ? ((value - previous) / previous) * 100 : value > 0 ? null : 0,
  };
}

export interface MonthlyPoint {
  key: string;
  label: string;
  revenue: number;
  invoiceCount: number;
}

/** سری ماهانه‌ی فروش (n ماه اخیر شمسی، بدون فاکتور باطل) */
export function monthlyRevenueSeries(invoices: Invoice[], months = 6): MonthlyPoint[] {
  const current = currentJalaliMonthKey();
  const active = invoices.filter((invoice) => invoice.status !== 'voided');
  const points: MonthlyPoint[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const key = addJalaliMonths(current, -offset);
    const scoped = active.filter((invoice) => jalaliMonthKey(new Date(invoice.date)) === key);
    points.push({
      key,
      label: jalaliMonthLabel(key),
      revenue: scoped.reduce((sum, invoice) => sum + invoice.total, 0),
      invoiceCount: scoped.length,
    });
  }
  return points;
}

export interface StatusSlice {
  key: 'paid' | 'partial' | 'unpaid' | 'overdue' | 'voided';
  label: string;
  count: number;
  amount: number;
}

/** ترکیب وضعیت فاکتورهای بازه (برای نمودار دونات) */
export function statusBreakdown(
  invoices: Invoice[],
  payments: CustomerPayment[],
  now: Date = new Date(),
): StatusSlice[] {
  const slices: StatusSlice[] = [
    { key: 'paid', label: 'تسویه‌شده', count: 0, amount: 0 },
    { key: 'partial', label: 'پرداخت جزئی', count: 0, amount: 0 },
    { key: 'unpaid', label: 'پرداخت‌نشده', count: 0, amount: 0 },
    { key: 'overdue', label: 'سررسید گذشته', count: 0, amount: 0 },
    { key: 'voided', label: 'باطل‌شده', count: 0, amount: 0 },
  ];
  const byKey = new Map(slices.map((slice) => [slice.key, slice]));
  for (const invoice of invoices) {
    if (invoice.status === 'voided') {
      const slice = byKey.get('voided')!;
      slice.count += 1;
      slice.amount += invoice.total;
      continue;
    }
    const state = invoicePaymentState(invoice, payments);
    const overdue = state.remaining > 0 && invoiceDueDate(invoice).getTime() < now.getTime();
    const key = overdue
      ? 'overdue'
      : state.remaining === 0
        ? 'paid'
        : state.paid > 0
          ? 'partial'
          : 'unpaid';
    const slice = byKey.get(key)!;
    slice.count += 1;
    slice.amount += invoice.total;
  }
  return slices;
}

export interface DashboardSnapshot {
  range: DashboardRange;
  stats: ReturnType<typeof invoiceStats>;
  previousStats: ReturnType<typeof invoiceStats>;
  invoiceCount: DashboardMetric;
  sales: DashboardMetric;
  collected: DashboardMetric;
  outstanding: number;
  overdue: number;
  overdueCount: number;
  draftLike: number;
  monthly: MonthlyPoint[];
  status: StatusSlice[];
}

/**
 * تصویر کامل داشبورد برای بازه‌ی انتخابی + دوره‌ی قبل (برای مقایسه).
 * دوره‌ی قبل هم‌طول بازه است؛ برای «ماه جاری» ماه شمسی قبل در نظر گرفته می‌شود.
 */
export function dashboardSnapshot(
  invoices: Invoice[],
  payments: CustomerPayment[],
  range: DashboardRange,
  now: Date = new Date(),
): DashboardSnapshot {
  const currentRange = dashboardRange(range, now);
  const currentInvoices = invoicesInRange(invoices, currentRange);

  let previousRange: DateRange | null = null;
  if (currentRange) {
    const span = currentRange.end.getTime() - currentRange.start.getTime();
    previousRange = {
      start: new Date(currentRange.start.getTime() - span),
      end: currentRange.start,
    };
  }
  const previousInvoices = invoicesInRange(invoices, previousRange);

  const stats = invoiceStats(currentInvoices, payments, now);
  const previousStats = invoiceStats(previousInvoices, payments, now);

  return {
    range,
    stats,
    previousStats,
    invoiceCount: metric(stats.count, previousStats.count),
    sales: metric(stats.total, previousStats.total),
    collected: metric(stats.collected, previousStats.collected),
    outstanding: stats.outstanding,
    overdue: stats.overdue,
    overdueCount: stats.overdueCount,
    draftLike: stats.partialCount + stats.unpaidCount,
    monthly: monthlyRevenueSeries(invoices, 6),
    status: statusBreakdown(currentInvoices, payments, now),
  };
}
