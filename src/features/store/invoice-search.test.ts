import { describe, expect, it } from 'vitest';
import { bidiReorder, faNumber, shapePersian, toVisualText } from '@/core/pdf/persian';
import { amountInWords, numberToPersianWords } from '@/features/store/amount-words';
import { invoiceFileName } from '@/features/store/invoice-pdf';
import {
  invoiceCsvRows,
  invoiceSearchText,
  normalizeQuery,
  queryInvoices,
  summarizeInvoices,
  type InvoiceRow,
} from '@/features/store/invoice-search';
import type { Invoice, InvoiceItem } from '@/core/db/db';

const cps = (value: string) => [...value].map((ch) => ch.codePointAt(0)!);

const invoice = (patch: Partial<Invoice> = {}): Invoice => ({
  id: 1,
  number: 1001,
  date: '2026-10-03T09:00:00.000Z',
  customerName: 'حسین رحمانی',
  subtotal: 1_000_000,
  discountType: 'percent',
  discountValue: 0,
  discountAmount: 0,
  taxPercent: 0,
  taxAmount: 0,
  total: 1_000_000,
  status: 'completed',
  source: 'invoice',
  paymentMethod: 'cash',
  createdAt: '2026-10-03T09:00:00.000Z',
  ...patch,
});

const item = (patch: Partial<InvoiceItem> = {}): InvoiceItem => ({
  id: 1,
  invoiceId: 1,
  productId: null,
  name: 'یخچال فریزر',
  qty: 1,
  unitPrice: 1_000_000,
  unitCost: 0,
  total: 1_000_000,
  ...patch,
});

describe('آماده‌سازی متن فارسی برای PDF', () => {
  it('حروف را به شکل نمایشی متصل تبدیل می‌کند (س اولیه، م پایانی)', () => {
    const shaped = cps(shapePersian('سلام'));
    // س-ابتدایی FE B3 (لا) و م-پایانی FEE2 باید در خروجی باشند
    expect(shaped).toContain(0xfeb3);
    expect(shaped).toContain(0xfee2);
  });

  it('لام + الف را به لیگاتور «لا» تبدیل می‌کند', () => {
    expect(cps(shapePersian('لا'))).toContain(0xfefb);
  });

  it('ی/ک عربی و اعراب را نرمال می‌کند', () => {
    expect(shapePersian('فاكتور')).toEqual(shapePersian('فاکتور'));
    expect(shapePersian('دَفتر')).toEqual(shapePersian('دفتر'));
  });

  it('ترتیب دوجهته: متن فارسی برعکس، لاتین و ارقام حفظ می‌شوند', () => {
    expect(bidiReorder('ABC')).toBe('ABC');
    expect([...bidiReorder('اب')].reverse().join('')).toBe('اب');
    // ارقام فارسی نباید معکوس شوند
    const visual = bidiReorder('۱۲۳');
    expect(cps(visual)).toEqual([0x6f1, 0x6f2, 0x6f3]);
  });

  it('متن ترکیبی فارسی/لاتین ترتیب خوانا می‌دهد', () => {
    const visual = toVisualText('فاکتور شماره ۱۰۲۴');
    // ارقام در انتهای دیداری عبارت‌اند (سمت چپ در RTL)
    expect([...visual].slice(0, 4)).toEqual(['۱', '۰', '۲', '۴']);
  });

  it('اعداد با جداکننده‌ی فارسی قالب می‌شوند', () => {
    expect(faNumber(1_234_567)).toBe('۱٬۲۳۴٬۵۶۷');
    expect(faNumber(1250.5, 2)).toBe('۱٬۲۵۰٫۵');
  });
});

describe('مبلغ به حروف', () => {
  it('اعداد پایه و ترکیبی', () => {
    expect(numberToPersianWords(0)).toBe('صفر');
    expect(numberToPersianWords(12)).toBe('دوازده');
    expect(numberToPersianWords(19)).toBe('نوزده');
    expect(numberToPersianWords(101)).toBe('صد و یک');
    expect(numberToPersianWords(1_000)).toBe('یک هزار');
    expect(numberToPersianWords(2_500_000)).toBe('دو میلیون و پانصد هزار');
  });

  it('مبلغ فاکتور با واحد پول', () => {
    expect(amountInWords(73_829_250)).toBe(
      'هفتاد و سه میلیون و هشتصد و بیست و نه هزار و دویست و پنجاه',
    );
  });
});

describe('نام فایل خروجی فاکتور', () => {
  it('نام فایل با شماره‌ی فاکتور ساخته می‌شود', () => {
    expect(invoiceFileName(1024)).toBe('factor-1024');
    expect(`${invoiceFileName(37)}.pdf`).toBe('factor-37.pdf');
    expect(invoiceFileName('۱۲')).toBe('factor-۱۲');
  });
});

describe('جستجو و فیلتر فاکتورهای صادرشده', () => {
  const invoices: Invoice[] = [
    invoice({ id: 1, number: 1001, total: 1_000_000, customerName: 'حسین رحمانی' }),
    invoice({
      id: 2,
      number: 1002,
      total: 5_000_000,
      customerName: 'زهرا کاظمی',
      isCredit: true,
      paymentMethod: 'credit',
      date: '2026-10-05T09:00:00.000Z',
    }),
    invoice({
      id: 3,
      number: 1003,
      total: 2_000_000,
      status: 'voided',
      voidReason: 'انصراف مشتری',
      customerName: 'علی نوری',
    }),
  ];
  const items: InvoiceItem[] = [
    item({ id: 1, invoiceId: 1, name: 'یخچال فریزر ساید' }),
    item({ id: 2, invoiceId: 2, name: 'ماشین لباسشویی' }),
  ];

  it('نرمال‌سازی جستجو: ی/ک عربی، نیم‌فاصله، ارقام و جداکننده', () => {
    expect(normalizeQuery('فاكتور')).toBe('فاکتور');
    expect(normalizeQuery('۱٬۲۳۴')).toBe('1234');
    expect(normalizeQuery('می‌باشد')).toBe('می باشد');
  });

  it('جستجو در شماره، مشتری، یادداشت و نام کالا', () => {
    expect(queryInvoices(invoices, items, { search: '1002' })).toHaveLength(1);
    expect(queryInvoices(invoices, items, { search: 'زهرا' })[0].invoice.number).toBe(1002);
    expect(queryInvoices(invoices, items, { search: 'لباسشویی' })[0].invoice.number).toBe(1002);
    expect(queryInvoices(invoices, items, { search: 'انصراف' })[0].invoice.number).toBe(1003);
  });

  it('فیلتر وضعیت، پرداخت و بازه مبلغ', () => {
    expect(queryInvoices(invoices, items, { status: 'voided' })).toHaveLength(1);
    expect(queryInvoices(invoices, items, { status: 'credit' })[0].invoice.number).toBe(1002);
    expect(queryInvoices(invoices, items, { status: 'cash' })).toHaveLength(1);
    expect(queryInvoices(invoices, items, { minTotal: 2_000_000 })).toHaveLength(2);
    expect(queryInvoices(invoices, items, { maxTotal: 1_500_000 })).toHaveLength(1);
  });

  it('مرتب‌سازی بر اساس مبلغ و شماره', () => {
    expect(queryInvoices(invoices, items, { sort: 'total-desc' })[0].invoice.number).toBe(1002);
    expect(queryInvoices(invoices, items, { sort: 'number-asc' })[0].invoice.number).toBe(1001);
  });

  it('خلاصه‌ی آماری فقط فاکتورهای معتبر را در جمع می‌آورد', () => {
    const rows = queryInvoices(invoices, items, {});
    const summary = summarizeInvoices(rows);
    expect(summary.count).toBe(3);
    expect(summary.voidedCount).toBe(1);
    expect(summary.activeTotal).toBe(6_000_000);
    expect(summary.creditTotal).toBe(5_000_000);
    expect(summary.average).toBe(3_000_000);
  });

  it('متن جستجوی فاکتور شامل تاریخ شمسی و مبلغ است', () => {
    const text = invoiceSearchText(invoices[0], [items[0]]);
    expect(text).toContain('رحمانی');
    expect(text).toContain('1001');
    expect(text).toContain('یخچال');
  });

  it('خروجی CSV سرستون فارسی و یک ردیف برای هر فاکتور دارد', () => {
    const rows: InvoiceRow[] = queryInvoices(invoices, items, { sort: 'number-asc' });
    const csv = invoiceCsvRows(rows);
    expect(csv[0][0]).toBe('شماره فاکتور');
    expect(csv).toHaveLength(4);
    expect(csv[1][0]).toBe(1001);
  });
});

describe('آینه‌سازی نویسه‌های جفتی در متن راست‌به‌چپ', () => {
  it('پرانتز روی متن معکوس‌شده آینه می‌شود تا به محتوا باز بماند', () => {
    expect(bidiReorder('(اختیاری)')).toBe('(یرایتخا)');
    expect(bidiReorder('[الف]')).toBe('[فلا]');
  });

  it('گیومه‌ی فارسی فقط جابه‌جا می‌شود و آینه نمی‌شود', () => {
    expect(bidiReorder('«سلام»')).toBe('»مالس«');
  });

  it('پرانتز در متن لاتین دست‌نخورده می‌ماند', () => {
    expect(bidiReorder('(abc)')).toBe('(abc)');
  });
});
