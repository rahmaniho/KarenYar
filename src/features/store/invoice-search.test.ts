import { describe, expect, it } from 'vitest';
import { bidiReorder, faNumber, shapePersian, toVisualText } from '@/core/pdf/persian';
import { amountInWords, numberToPersianWords } from '@/features/store/amount-words';
import { invoiceFileName } from '@/features/store/invoice-pdf';
import {
  invoiceCsvRows,
  invoiceSearchText,
  normalizeQuery,
  paginateInvoices,
  queryInvoices,
  summarizeInvoices,
  type InvoiceRow,
} from '@/features/store/invoice-search';
import type { CustomerPayment, Invoice, InvoiceItem } from '@/core/db/db';

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

describe('فیلتر وضعیت پرداخت و صفحه‌بندی', () => {
  const credit = invoice({ id: 2, number: 1002, isCredit: true, paymentMethod: 'credit' });
  const pay = (amount: number, invoiceId = 2): CustomerPayment => ({
    id: 1,
    customerId: 5,
    invoiceId,
    amount,
    date: '2026-10-04T09:00:00.000Z',
    createdAt: '2026-10-04T09:00:00.000Z',
  });
  const now = new Date('2026-10-10T09:00:00.000Z');

  it('فیلتر «پرداخت‌نشده» فقط فاکتورهای بدون پرداخت را برمی‌گرداند', () => {
    const rows = queryInvoices([credit], [], { status: 'unpaid', now });
    expect(rows).toHaveLength(1);
    expect(rows[0].remaining).toBe(credit.total);
  });

  it('فیلتر «پرداخت جزئی» با پرداخت ناقص فعال می‌شود', () => {
    const rows = queryInvoices([credit], [], {
      status: 'partial',
      payments: [pay(400_000)],
      now,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].paid).toBe(400_000);
    expect(rows[0].remaining).toBe(600_000);
    expect(rows[0].lifecycle).toBe('partial');
  });

  it('فیلتر «سررسید گذشته» فقط نسیه‌ی معوق را نشان می‌دهد', () => {
    // سررسید پیش‌فرض = تاریخ صدور + ۳۰ روز → ۲ Nov 2026 (بعد از now)
    const futureRows = queryInvoices([credit], [], { status: 'overdue', now });
    expect(futureRows).toHaveLength(0);
    const past = queryInvoices([credit], [], { status: 'overdue', now: new Date('2026-12-01') });
    expect(past).toHaveLength(1);
  });

  it('فاکتور تسویه‌شده در فیلتر «تسویه‌شده» است و مانده ندارد', () => {
    const rows = queryInvoices([credit], [], {
      status: 'paid',
      payments: [pay(credit.total)],
      now,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].remaining).toBe(0);
  });

  it('صفحه‌بندی واقعی، بازه‌ی درست را برمی‌گرداند', () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      invoice({ id: index + 1, number: 1000 + index }),
    );
    const result = paginateInvoices(queryInvoices(many, [], { sort: 'number-asc' }), 3, 10);
    expect(result.total).toBe(25);
    expect(result.pageCount).toBe(3);
    expect(result.rows).toHaveLength(5);
    expect(result.from).toBe(21);
    expect(result.to).toBe(25);
    expect(result.rows[0].invoice.number).toBe(1020);
  });

  it('صفحه‌ی خارج از محدوده به آخرین صفحه محدود می‌شود', () => {
    const result = paginateInvoices(queryInvoices([invoice()], [], {}), 9, 10);
    expect(result.page).toBe(1);
    expect(result.rows).toHaveLength(1);
  });

  it('خلاصه‌ی آماری، وصول و مانده را جدا نشان می‌دهد', () => {
    const summary = summarizeInvoices(
      queryInvoices([credit], [], { payments: [pay(300_000)], now }),
    );
    expect(summary.paidTotal).toBe(300_000);
    expect(summary.remainingTotal).toBe(700_000);
    expect(summary.creditCount).toBe(1);
  });

  it('CSV شامل ستون‌های پرداخت‌شده و مانده است', () => {
    const rows = queryInvoices([credit], [], { payments: [pay(250_000)], now });
    const [header, first] = invoiceCsvRows(rows);
    expect(header).toContain('پرداخت‌شده');
    expect(header).toContain('مانده');
    expect(first).toContain(250_000);
    expect(first).toContain(750_000);
  });
});

it('پیش‌نویس در فیلتر معتبر یا بدهی فعال نمی‌آید', () => {
  const draft = invoice({ id: 9, number: 1009, status: 'draft', isCredit: true });
  expect(queryInvoices([draft], [], { status: 'draft' })).toHaveLength(1);
  expect(queryInvoices([draft], [], { status: 'completed' })).toHaveLength(0);
  expect(queryInvoices([draft], [], { status: 'unpaid' })).toHaveLength(0);
});
