/**
 * جستجو و فیلتر حرفه‌ای فاکتورهای صادرشده — منطق خالص و قابل تست
 *
 * پشتیبانی کامل فارسی: ی/ک عربی، نیم‌فاصله، اعراب، ارقام فارسی/عربی،
 * جستجوی مبلغ با یا بدون جداکننده، و جستجوی هم‌زمان در شماره، مشتری،
 * یادداشت و نام اقلام فاکتور.
 */
import type { Invoice, InvoiceItem } from '@/core/db/db';
import { dateToJalali, jalaliMonthKey, type JalaliDate } from '@/core/jalali/jalali';
import { invoicePaymentMethod } from './payment';

export type InvoiceStatusFilter = 'all' | 'completed' | 'voided' | 'credit' | 'cash';
export type InvoiceSortKey =
  'date-desc' | 'date-asc' | 'number-desc' | 'number-asc' | 'total-desc' | 'total-asc';

export interface InvoiceQuery {
  /** عبارت جستجو (شماره، مشتری، یادداشت، کالا) */
  search?: string;
  status?: InvoiceStatusFilter;
  /** روش پرداخت مشخص؛ all یعنی همه */
  method?: string;
  /** بازه‌ی تاریخ شمسی (کلید ماه ۱۴۰۴-۰۷) */
  month?: string;
  /** حداقل/حداکثر مبلغ به تومان */
  minTotal?: number;
  maxTotal?: number;
  sort?: InvoiceSortKey;
}

/** نرمال‌سازی متن فارسی برای جستجو (بدون حساسیت به ی/ک عربی، نیم‌فاصله و ارقام) */
export function normalizeQuery(value: string): string {
  return value
    .replace(/[\u064b-\u0652\u0670\u0640]/g, '')
    .replace(/\u200c/g, ' ')
    .replace(/[\u064a\u0649]/g, 'ی')
    .replace(/\u0643/g, 'ک')
    .replace(/[\u0629]/g, 'ه')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[٬,،]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fa-IR');
}

/** رشته‌ی جستجوی هر فاکتور: شماره، مشتری، یادداشت، روش پرداخت و نام اقلام */
export function invoiceSearchText(invoice: Invoice, items: InvoiceItem[] = []): string {
  return (
    normalizeQuery(
      [
        invoice.number,
        String(invoice.number),
        invoice.customerName ?? '',
        invoice.note ?? '',
        invoice.voidReason ?? '',
        invoice.total,
        invoice.subtotal,
        jalaliDateKey(new Date(invoice.date)),
      ].join(' '),
    ) +
    ' ' +
    items.map((item) => normalizeQuery(item.name)).join(' ')
  );
}

/** «۱۴۰۴/۰۷/۱۱» به ارقام لاتین برای تطبیق جستجو */
function jalaliDateKey(date: Date): string {
  const { jy, jm, jd } = dateToJalali(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${jy}/${pad(jm)}/${pad(jd)} ${jy}-${pad(jm)}-${pad(jd)}`;
}

export interface InvoiceRow {
  invoice: Invoice;
  items: InvoiceItem[];
  itemCount: number;
}

/** گروه‌بندی اقلام بر اساس شماره‌ی فاکتور برای جستجو و نمایش تعداد اقلام */
export function groupItemsByInvoice(items: InvoiceItem[]): Map<number, InvoiceItem[]> {
  const map = new Map<number, InvoiceItem[]>();
  for (const item of items) {
    const bucket = map.get(item.invoiceId);
    if (bucket) bucket.push(item);
    else map.set(item.invoiceId, [item]);
  }
  return map;
}

/** اعمال جستجو/فیلتر/مرتب‌سازی روی فاکتورها */
export function queryInvoices(
  invoices: Invoice[],
  items: InvoiceItem[],
  query: InvoiceQuery = {},
): InvoiceRow[] {
  const grouped = groupItemsByInvoice(items);
  const needle = normalizeQuery(query.search ?? '');
  const status = query.status ?? 'all';
  const method = query.method ?? 'all';

  const rows: InvoiceRow[] = [];
  for (const invoice of invoices) {
    const ownItems = grouped.get(invoice.id ?? -1) ?? [];
    const isVoided = invoice.status === 'voided';
    if (status === 'completed' && isVoided) continue;
    if (status === 'voided' && !isVoided) continue;
    if (status === 'credit' && (!invoice.isCredit || isVoided)) continue;
    if (status === 'cash' && (invoice.isCredit || isVoided)) continue;
    if (method !== 'all' && invoicePaymentMethod(invoice) !== method) continue;
    if (query.month && jalaliMonthKey(new Date(invoice.date)) !== query.month) continue;
    if (query.minTotal != null && invoice.total < query.minTotal) continue;
    if (query.maxTotal != null && invoice.total > query.maxTotal) continue;
    if (needle && !invoiceSearchText(invoice, ownItems).includes(needle)) continue;
    rows.push({ invoice, items: ownItems, itemCount: ownItems.length });
  }

  const sort = query.sort ?? 'date-desc';
  const byNumber = (a: Invoice, b: Invoice) => a.number - b.number;
  const byDate = (a: Invoice, b: Invoice) =>
    new Date(a.date).getTime() - new Date(b.date).getTime() || byNumber(a, b);
  rows.sort((a, b) => {
    switch (sort) {
      case 'date-asc':
        return byDate(a.invoice, b.invoice);
      case 'number-desc':
        return byNumber(b.invoice, a.invoice);
      case 'number-asc':
        return byNumber(a.invoice, b.invoice);
      case 'total-desc':
        return b.invoice.total - a.invoice.total || byNumber(b.invoice, a.invoice);
      case 'total-asc':
        return a.invoice.total - b.invoice.total || byNumber(a.invoice, b.invoice);
      case 'date-desc':
      default:
        return byDate(b.invoice, a.invoice);
    }
  });
  return rows;
}

export interface InvoiceSummary {
  count: number;
  activeCount: number;
  voidedCount: number;
  total: number;
  activeTotal: number;
  voidedTotal: number;
  creditTotal: number;
  average: number;
}

/** خلاصه‌ی آماری نتیجه‌ی جستجو (برای کارت‌های بالای فهرست) */
export function summarizeInvoices(rows: InvoiceRow[]): InvoiceSummary {
  let activeCount = 0;
  let voidedCount = 0;
  let activeTotal = 0;
  let voidedTotal = 0;
  let creditTotal = 0;
  for (const row of rows) {
    const { invoice } = row;
    if (invoice.status === 'voided') {
      voidedCount += 1;
      voidedTotal += invoice.total;
    } else {
      activeCount += 1;
      activeTotal += invoice.total;
      if (invoice.isCredit) creditTotal += invoice.total;
    }
  }
  return {
    count: rows.length,
    activeCount,
    voidedCount,
    total: activeTotal + voidedTotal,
    activeTotal,
    voidedTotal,
    creditTotal,
    average: activeCount ? Math.round(activeTotal / activeCount) : 0,
  };
}

/** ماه‌های شمسی موجود در فاکتورها (جدیدترین اول) برای فیلتر ماه */
export function invoiceMonthOptions(invoices: Invoice[]): string[] {
  const set = new Set<string>();
  for (const invoice of invoices) set.add(jalaliMonthKey(new Date(invoice.date)));
  return [...set].sort().reverse();
}

/** بازه‌ی ماه شمسی «۱۴۰۴-۰۷» → بازه‌ی میلادی برای گزارش */
export function monthToJalali(monthKey: string): JalaliDate | null {
  const [jy, jm] = monthKey.split('-').map(Number);
  if (!jy || !jm || jm < 1 || jm > 12) return null;
  return { jy, jm, jd: 1 };
}

/** ردیف‌های خروجی CSV فهرست فاکتورها (سازگار با اکسل فارسی) */
export function invoiceCsvRows(rows: InvoiceRow[]): (string | number)[][] {
  const header = [
    'شماره فاکتور',
    'تاریخ',
    'مشتری',
    'روش پرداخت',
    'تعداد اقلام',
    'جمع اقلام',
    'تخفیف',
    'مالیات',
    'مبلغ کل',
    'وضعیت',
    'یادداشت',
  ];
  return [
    header,
    ...rows.map(({ invoice, itemCount }) => [
      invoice.number,
      jalaliDateKey(new Date(invoice.date)).split(' ')[0],
      invoice.customerName ?? 'مشتری گذری',
      invoicePaymentMethod(invoice),
      itemCount,
      invoice.subtotal,
      invoice.discountAmount,
      invoice.taxAmount,
      invoice.total,
      invoice.status === 'voided' ? 'باطل‌شده' : invoice.isCredit ? 'نسیه' : 'تسویه‌شده',
      invoice.note ?? '',
    ]),
  ];
}
