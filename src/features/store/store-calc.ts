/**
 * محاسبات خالص گزارش‌های فروشگاهی — فروش روزانه/ماهانه، سود، کالاهای پرفروش، کم‌موجود
 */
import type { Invoice, InvoiceItem, Product } from '@/core/db/db';
import {
  addJalaliMonths,
  currentJalaliMonthKey,
  dateToJalali,
  daysInJalaliMonth,
  jalaliMonthKey,
  jalaliMonthLabel,
} from '@/core/jalali/jalali';
import { toFaDigits } from '@/core/currency/currency';

export const isActiveInvoice = (invoice: Invoice): boolean => invoice.status !== 'voided';

/** سود ناخالص یک مجموعه قلم فاکتور = (قیمت فروش − تمام‌شده) × تعداد */
export function itemsGrossProfit(items: InvoiceItem[]): number {
  return items.reduce((sum, i) => sum + (i.unitPrice - i.unitCost) * i.qty, 0);
}

export function itemsCost(items: InvoiceItem[]): number {
  return items.reduce((sum, i) => sum + i.unitCost * i.qty, 0);
}

export interface SalesTotals {
  /** جمع مبلغ فاکتورها (با مالیات) */
  revenue: number;
  /** فروش خالص = جمع اقلام − تخفیف فاکتورها (بدون مالیات) — مبنای سود و حاشیه */
  netRevenue: number;
  cost: number;
  grossProfit: number;
  invoiceCount: number;
}

export function salesTotals(invoices: Invoice[], items: InvoiceItem[]): SalesTotals {
  invoices = invoices.filter(isActiveInvoice);
  const invoiceIds = new Set(invoices.map((i) => i.id));
  const scoped = items.filter((i) => invoiceIds.has(i.invoiceId));
  const cost = itemsCost(scoped);
  const revenue = invoices.reduce((sum, i) => sum + i.total, 0);
  const netRevenue = invoices.reduce((sum, i) => sum + (i.subtotal - i.discountAmount), 0);
  return {
    revenue,
    netRevenue,
    cost,
    // سود ناخالص واقعی: فروش خالص پس از تخفیف منهای بهای تمام‌شده (اقلام به‌تنهایی تخفیف فاکتور را ندارند)
    grossProfit: netRevenue - cost,
    invoiceCount: invoices.length,
  };
}

export function filterInvoicesByMonth(invoices: Invoice[], monthKey: string): Invoice[] {
  return invoices.filter(
    (i) => isActiveInvoice(i) && jalaliMonthKey(new Date(i.date)) === monthKey,
  );
}

export interface DailySalesPoint {
  day: number;
  label: string;
  total: number;
  count: number;
}

/** فروش روزبه‌روز یک ماه شمسی (برای نمودار روزانه) */
export function dailySalesSeries(invoices: Invoice[], monthKey: string): DailySalesPoint[] {
  const [jy, jm] = monthKey.split('-').map(Number);
  const dayCount = daysInJalaliMonth(jy, jm);
  const points: DailySalesPoint[] = Array.from({ length: dayCount }, (_, i) => ({
    day: i + 1,
    label: toFaDigits(String(i + 1)),
    total: 0,
    count: 0,
  }));
  for (const invoice of filterInvoicesByMonth(invoices, monthKey)) {
    const { jd } = dateToJalali(new Date(invoice.date));
    const point = points[jd - 1];
    if (point) {
      point.total += invoice.total;
      point.count += 1;
    }
  }
  return points;
}

export interface MonthlySalesPoint {
  key: string;
  label: string;
  revenue: number;
  invoiceCount: number;
}

/** فروش n ماه اخیر شمسی */
export function monthlySalesSeries(invoices: Invoice[], monthCount: number): MonthlySalesPoint[] {
  const current = currentJalaliMonthKey();
  const points: MonthlySalesPoint[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const key = addJalaliMonths(current, -i);
    const monthInvoices = filterInvoicesByMonth(invoices, key);
    points.push({
      key,
      label: jalaliMonthLabel(key),
      revenue: monthInvoices.reduce((s, inv) => s + inv.total, 0),
      invoiceCount: monthInvoices.length,
    });
  }
  return points;
}

export interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
  profit: number;
}

/**
 * پرفروش‌ترین کالاها بر اساس مبلغ فروش.
 * اگر فاکتورها داده شوند، تخفیف هر فاکتور به‌تناسب مبلغ قلم بین اقلامش تقسیم می‌شود
 * تا «سود» هر کالا با سود ناخالص گزارش فروش (پس از تخفیف) سازگار باشد.
 */
export function topProducts(
  items: InvoiceItem[],
  invoices: Invoice[] = [],
  limit = 10,
): TopProduct[] {
  const invoiceById = new Map<number, Invoice>();
  for (const inv of invoices)
    if (inv.id != null && isActiveInvoice(inv)) invoiceById.set(inv.id, inv);
  const map = new Map<string, TopProduct>();
  for (const item of items) {
    if (invoices.length && !invoiceById.has(item.invoiceId)) continue;
    const current = map.get(item.name) ?? { name: item.name, qty: 0, revenue: 0, profit: 0 };
    current.qty += item.qty;
    const invoice = invoiceById.get(item.invoiceId);
    const discountShare =
      invoice && invoice.subtotal > 0
        ? (item.total / invoice.subtotal) * invoice.discountAmount
        : 0;
    current.revenue += item.total - discountShare;
    current.profit += (item.unitPrice - item.unitCost) * item.qty - discountShare;
    map.set(item.name, current);
  }
  return [...map.values()]
    .map((p) => ({ ...p, revenue: Math.round(p.revenue), profit: Math.round(p.profit) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/** کالاهای کم‌موجود یا ناموجود (موجودی ≤ حد هشدار) */
export function lowStockProducts(products: Product[]): Product[] {
  return products.filter((p) => p.stock <= p.minStock).sort((a, b) => a.stock - b.stock);
}

/** فروش امروز (از نیمه‌شب امروز به بعد) */
export function todaySales(invoices: Invoice[], now: Date = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return invoices
    .filter(
      (i) =>
        isActiveInvoice(i) &&
        new Date(i.date).getTime() >= start &&
        new Date(i.date).getTime() < end,
    )
    .reduce((sum, i) => sum + i.total, 0);
}
