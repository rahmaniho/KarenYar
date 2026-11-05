/**
 * جستجو و فیلتر حرفه‌ای فاکتورهای صادرشده — منطق خالص و قابل تست
 *
 * پشتیبانی کامل فارسی: ی/ک عربی، نیم‌فاصله، اعراب، ارقام فارسی/عربی،
 * جستجوی مبلغ با یا بدون جداکننده، و جستجوی هم‌زمان در شماره، مشتری،
 * یادداشت و نام اقلام فاکتور.
 */
import type { CustomerPayment, Invoice, InvoiceItem } from '@/core/db/db';
import { dateToJalali, jalaliMonthKey, type JalaliDate } from '@/core/jalali/jalali';
import { invoicePaymentMethod } from './payment';
import {
  invoiceLifecycle,
  invoicePaymentState,
  LIFECYCLE_LABELS,
  type InvoiceLifecycle,
} from './invoice-domain';

export type InvoiceStatusFilter =
  | 'all'
  | 'draft'
  | 'overpaid'
  | 'completed'
  | 'voided'
  | 'credit'
  | 'cash'
  | 'paid'
  | 'partial'
  | 'unpaid'
  | 'overdue';
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
  /** پرداخت‌های ثبت‌شده — برای فیلتر وضعیت پرداخت و مانده */
  payments?: CustomerPayment[];
  /** بازه‌ی روزهای اخیر (فقط فاکتورهای n روز گذشته) */
  lastDays?: number;
  /** مبنای «امروز» برای آزمون‌پذیری */
  now?: Date;
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
  /** وضعیت چرخه‌ی عمر (تسویه/جزئی/سررسیدگذشته/باطل) */
  lifecycle: InvoiceLifecycle;
  /** مبلغ پرداخت‌شده */
  paid: number;
  /** مانده‌ی قابل پرداخت */
  remaining: number;
}

/** یک صفحه از ردیف‌ها (صفحه‌بندی واقعی روی نتیجه‌ی فیلترشده) */
export interface InvoicePage {
  rows: InvoiceRow[];
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
}

export function paginateInvoices(rows: InvoiceRow[], page: number, pageSize: number): InvoicePage {
  const size = Math.max(1, Math.floor(pageSize));
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * size;
  return {
    rows: rows.slice(start, start + size),
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + size, total),
  };
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

  const payments = query.payments ?? [];
  const now = query.now ?? new Date();
  const since =
    query.lastDays != null && query.lastDays > 0
      ? now.getTime() - query.lastDays * 86_400_000
      : null;

  const rows: InvoiceRow[] = [];
  for (const invoice of invoices) {
    const ownItems = grouped.get(invoice.id ?? -1) ?? [];
    const isVoided = invoice.status === 'voided';
    const inactive = isVoided || invoice.status === 'draft';
    const payState = invoicePaymentState(invoice, payments);
    if (status === 'draft' && invoice.status !== 'draft') continue;
    if (status === 'completed' && inactive) continue;
    if (status === 'overpaid' && (inactive || payState.overpaid <= 0)) continue;
    if (status === 'voided' && !isVoided) continue;
    if (status === 'credit' && (!invoice.isCredit || isVoided)) continue;
    if (status === 'cash' && (invoice.isCredit || isVoided)) continue;
    if (status === 'paid' && (inactive || payState.remaining > 0 || payState.paid <= 0)) continue;
    if (status === 'partial' && (inactive || payState.status !== 'partial')) continue;
    if (status === 'unpaid' && (inactive || payState.paid > 0)) continue;
    if (status === 'overdue' && invoiceLifecycle(invoice, payments, now) !== 'overdue') continue;
    if (method !== 'all' && invoicePaymentMethod(invoice) !== method) continue;
    if (query.month && jalaliMonthKey(new Date(invoice.date)) !== query.month) continue;
    if (since != null && new Date(invoice.date).getTime() < since) continue;
    if (query.minTotal != null && invoice.total < query.minTotal) continue;
    if (query.maxTotal != null && invoice.total > query.maxTotal) continue;
    if (needle && !invoiceSearchText(invoice, ownItems).includes(needle)) continue;
    rows.push({
      invoice,
      items: ownItems,
      itemCount: ownItems.length,
      lifecycle: invoiceLifecycle(invoice, payments, now),
      paid: payState.paid,
      remaining: payState.remaining,
    });
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
  draftCount: number;
  total: number;
  activeTotal: number;
  voidedTotal: number;
  creditTotal: number;
  average: number;
  /** تعداد فاکتورهای نسیه‌ی معتبر */
  creditCount: number;
  /** جمع پرداخت‌شده‌ها */
  paidTotal: number;
  /** مانده‌ی وصول‌نشده */
  remainingTotal: number;
}

/** خلاصه‌ی آماری نتیجه‌ی جستجو (برای کارت‌های بالای فهرست) */
export function summarizeInvoices(rows: InvoiceRow[]): InvoiceSummary {
  let activeCount = 0;
  let voidedCount = 0;
  let countDraft = 0;
  let activeTotal = 0;
  let voidedTotal = 0;
  let creditTotal = 0;
  let paidTotal = 0;
  let remainingTotal = 0;
  let creditCount = 0;
  for (const row of rows) {
    const { invoice } = row;
    if (invoice.status === 'draft') {
      countDraft += 1;
      continue;
    }
    if (invoice.status === 'voided') {
      voidedCount += 1;
      voidedTotal += invoice.total;
    } else {
      activeCount += 1;
      activeTotal += invoice.total;
      if (invoice.isCredit) {
        creditTotal += invoice.total;
        creditCount += 1;
      }
      paidTotal += row.paid ?? 0;
      remainingTotal += row.remaining ?? 0;
    }
  }
  return {
    count: rows.length,
    activeCount,
    voidedCount,
    draftCount: countDraft,
    total: activeTotal + voidedTotal,
    activeTotal,
    voidedTotal,
    creditTotal,
    creditCount,
    average: activeCount ? Math.round(activeTotal / activeCount) : 0,
    paidTotal,
    remainingTotal,
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
    'سررسید',
    'مشتری',
    'روش پرداخت',
    'تعداد اقلام',
    'جمع اقلام',
    'تخفیف',
    'مالیات',
    'مبلغ کل',
    'پرداخت‌شده',
    'مانده',
    'وضعیت',
    'یادداشت',
  ];
  return [
    header,
    ...rows.map((row) => {
      const { invoice, itemCount } = row;
      return [
        invoice.number,
        jalaliDateKey(new Date(invoice.date)).split(' ')[0],
        invoice.dueDate ? jalaliDateKey(new Date(invoice.dueDate)).split(' ')[0] : '',
        invoice.customerName ?? 'مشتری گذری',
        invoicePaymentMethod(invoice),
        itemCount,
        invoice.subtotal,
        invoice.discountAmount,
        invoice.taxAmount,
        invoice.total,
        row.paid ?? 0,
        row.remaining ?? 0,
        LIFECYCLE_LABELS[row.lifecycle],
        invoice.note ?? '',
      ];
    }),
  ];
}
