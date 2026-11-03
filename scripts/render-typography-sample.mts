/**
 * Renders real sample PDFs for visual verification of the Persian typography engine:
 *   docs/samples/persian-typography-verification.pdf  — dedicated typography test sheet
 *   docs/samples/factor-persian-verification.pdf      — a real invoice with all sample strings
 *
 * Run:  npm run samples:typography   (vite-node, uses the @ alias like the app)
 */
/* eslint-disable no-console */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import type { Customer, Invoice, InvoiceItem } from '@/core/db/db';
import { PdfCanvas, MM } from '@/core/pdf/canvas';
import { faNumber } from '@/core/pdf/persian';
import { buildInvoicePdf } from '@/features/store/invoice-pdf';
import type { InvoiceDocumentSettings } from '@/features/store/invoice-pdf';
import { buildPayslipPdf } from '@/features/payroll/payroll-pdf';
import { calculatePayroll, DEFAULT_PAYROLL_RATES, type PayrollInput } from '@/core/calc/payroll';
import type { Employee } from '@/core/db/db';

// serve fonts from public/fonts exactly like the dev server does
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const m = url.match(/fonts\/(Vazirmatn-\w+)\.ttf$/);
  if (m) {
    const buf = readFileSync(`public/fonts/${m[1]}.ttf`);
    return new Response(new Uint8Array(buf), { status: 200 });
  }
  return new Response(null, { status: 404 });
}) as typeof fetch;
void realFetch;

const SAMPLES = [
  'حسابیار؛ مدیریت هوشمند امور مالی و حسابداری',
  'فاکتور فروش شماره ۱۲۵۴ در تاریخ ۱۴۰۵/۰۸/۱۳ صادر شده است.',
  'مبلغ قابل پرداخت: ۶۷۷٬۸۳۵٬۲۰۰ تومان',
  'مدیریت قراردادها، حساب‌های دریافتنی و پرداختنی',
  'KarenSoft | Hesabyar | info@example.com',
  'شماره تماس: 09152521166',
  'کالای خریداری‌شده (Product) با تخفیف ۱۰٪',
  'نشانی: تهران، خیابان ولیعصر، پلاک ۱۲۵',
  'می‌روم، کتاب‌ها، حسابداری، نرم‌افزار و نیم‌فاصله',
  'کد پیگیری: INV-1024-AB — ایمیل: info@example.com — تلفن: 0915-252-1166 — − ۶۷۷٬۸۳۵٬۲۰۰ تومان',
];

async function typographySheet(): Promise<Uint8Array> {
  const canvas = await PdfCanvas.create({
    title: 'تست تایپوگرافی فارسی — حساب‌یار',
    subject: 'نمونه‌ی خروجی موتور متن فارسی',
    author: 'حساب‌یار کارن سافت',
    keywords: ['تست', 'فارسی', 'PDF', 'فونت', 'وزیرمتن'],
    baseUrl: '/',
  });
  canvas.newPage();
  const PAGE_W = 595.28;
  const RIGHT = PAGE_W - MM * 15;
  const LEFT = MM * 15;
  let y = MM * 22;

  canvas.text('ورقه‌ی تست تایپوگرافی فارسی — حساب‌یار', RIGHT, y, {
    size: 16,
    weight: 'bold',
    color: '#0B1B3A',
  });
  y += MM * 8;
  canvas.text(
    'این سند با موتور برداری حساب‌یار و فونت وزیرمتن به‌صورت embedded ساخته شده؛ متن قابل انتخاب و جستجو است.',
    RIGHT,
    y,
    { size: 9, color: '#5A6474', maxWidth: PAGE_W - MM * 30 },
  );
  y += MM * 10;

  const rows = SAMPLES;
  const headH = MM * 9;
  canvas.rect(LEFT, y, PAGE_W - MM * 30, headH, { fill: '#0B1B3A', radius: 2 });
  canvas.text('متن آزمایشی', RIGHT - MM * 3, y + headH / 2 + 3, {
    size: 8,
    weight: 'bold',
    color: '#FFFFFF',
  });
  canvas.text('وزن', LEFT + MM * 3, y + headH / 2 + 3, {
    size: 8,
    weight: 'bold',
    color: '#FFFFFF',
    align: 'left',
  });
  y += headH;

  rows.forEach((text, i) => {
    const rowH = MM * 11;
    if (i % 2 === 1) canvas.rect(LEFT, y, PAGE_W - MM * 30, rowH, { fill: '#F8FAFE' });
    canvas.text(text, RIGHT - MM * 3, y + rowH / 2 + 3.2, {
      size: 9.5,
      weight: i % 3 === 0 ? 'bold' : i % 3 === 1 ? 'medium' : 'regular',
      color: '#1F2937',
      maxWidth: PAGE_W - MM * 30 - MM * 20,
    });
    canvas.text(['Bold', 'Medium', 'Regular'][i % 3], LEFT + MM * 3, y + rowH / 2 + 3, {
      size: 7.5,
      color: '#5B7BB0',
      align: 'left',
    });
    y += rowH;
    canvas.line(LEFT, y, RIGHT, y, { color: '#EDF1F8', width: 0.5 });
  });

  y += MM * 8;
  canvas.text('اعداد و مبالغ:', RIGHT, y, { size: 10, weight: 'bold', color: '#0B1B3A' });
  y += MM * 7;
  const nums = [
    `مبلغ: ${faNumber(677835200)} تومان`,
    `شماره فاکتور: ${faNumber(1254, 0)} — تاریخ: ۱۴۰۵/۰۸/۱۳`,
    `تخفیف ۱۰٪ — مالیات ۹٪ — Pure Latin: ABC-123 xyz`,
    `شماره تماس: 09152521166 — کد ملی: 0012345678 — کد پیگیری: INV-1024-AB`,
  ];
  for (const n of nums) {
    canvas.text(n, RIGHT, y, { size: 9, color: '#1F2937' });
    y += MM * 6;
  }

  y += MM * 6;
  canvas.text('پاراگراف طولانی (شکست خط خودکار):', RIGHT, y, {
    size: 10,
    weight: 'bold',
    color: '#0B1B3A',
  });
  y += MM * 7;
  const long =
    'مدیریت قراردادها، حساب‌های دریافتنی و پرداختنی، می‌روم، کتاب‌ها، حسابداری، نرم‌افزار و نیم‌فاصله — این پاراگراف برای بررسی شکست خط، فاصله‌ی خطوط و حفظ نیم‌فاصله در خروجی PDF است. کالای خریداری‌شده (Product) با تخفیف ۱۰٪ و شماره تماس: 09152521166.';
  y += canvas.paragraph(long, RIGHT, y, {
    size: 9,
    color: '#1F2937',
    maxWidth: PAGE_W - MM * 30,
    lineHeight: MM * 5.4,
  });

  canvas.onEachPage((pageNumber, total) => {
    canvas.text(
      `صفحه ${faNumber(pageNumber, 0)} از ${faNumber(total, 0)}`,
      PAGE_W / 2,
      841.89 - MM * 8,
      {
        size: 7,
        color: '#5B7BB0',
        align: 'center',
      },
    );
  });
  return canvas.save();
}

const settings: InvoiceDocumentSettings = {
  shopName: 'حسابیار — KarenSoft',
  shopPhone: '09152521166',
  shopAddress: 'نشانی: تهران، خیابان ولیعصر، پلاک ۱۲۵',
  shopEconomicCode: '0012345678',
  shopRegistrationNumber: 'INV-1024-AB',
  currencyUnit: 'toman',
  invoiceFooterNote: 'مبلغ قابل پرداخت: ۶۷۷٬۸۳۵٬۲۰۰ تومان — تماس: info@example.com یا 09152521166',
  invoiceShowLogo: false,
};

function makeInvoice(): Invoice {
  return {
    id: 1,
    number: 1254,
    date: '2026-11-04T12:00:00.000Z',
    customerName: 'حسابیار؛ مدیریت هوشمند امور مالی و حسابداری',
    customerPhone: '09152521166',
    customerAddress: 'تهران، خیابان ولیعصر، پلاک ۱۲۵ — کد پیگیری: INV-1024-AB',
    status: 'completed',
    paymentMethod: 'card',
    subtotal: 677835200,
    discountType: 'percent',
    discountValue: 10,
    discountAmount: 67783520,
    taxPercent: 10,
    taxAmount: 61005168,
    total: 671056848,
    note: 'فاکتور فروش شماره ۱۲۵۴ در تاریخ ۱۴۰۵/۰۸/۱۳ صادر شده است.',
    terms:
      'مدیریت قراردادها، حساب‌های دریافتنی و پرداختنی — کالای خریداری‌شده (Product) با تخفیف ۱۰٪',
    checkoutKey: 'INV-1024-AB-XYZ',
    createdAt: '2026-11-04T12:00:00.000Z',
  };
}

function makeItems(count: number): InvoiceItem[] {
  const names = [
    'کالای خریداری‌شده (Product) با تخفیف ۱۰٪',
    'می‌روم، کتاب‌ها، حسابداری، نرم‌افزار و نیم‌فاصله',
    'مدیریت قراردادها، حساب‌های دریافتنی و پرداختنی',
    'KarenSoft | Hesabyar | info@example.com',
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    invoiceId: 1,
    productId: null,
    name: names[i % names.length],
    qty: 2,
    unitPrice: 100000,
    unit: 'عدد',
    discountAmount: 0,
    unitCost: 60000,
    total: 200000,
  }));
}

const customer: Customer = {
  id: 7,
  name: 'حسابیار؛ مدیریت هوشمند امور مالی و حسابداری',
  phone: '09152521166',
  address: 'تهران، خیابان ولیعصر، پلاک ۱۲۵',
  createdAt: '2026-01-01T00:00:00.000Z',
};

async function main() {
  mkdirSync('docs/samples', { recursive: true });
  const sheet = await typographySheet();
  writeFileSync('docs/samples/persian-typography-verification.pdf', sheet);
  console.log('wrote docs/samples/persian-typography-verification.pdf', sheet.length, 'bytes');

  const invoiceBlob = await buildInvoicePdf({
    invoice: makeInvoice(),
    items: makeItems(6),
    customer,
    settings,
    payments: [],
  });
  const invoiceBytes = new Uint8Array(await invoiceBlob.arrayBuffer());
  writeFileSync('docs/samples/factor-persian-verification.pdf', invoiceBytes);
  console.log('wrote docs/samples/factor-persian-verification.pdf', invoiceBytes.length, 'bytes');

  const employee: Employee = {
    id: 3,
    name: 'نگار محمدی — Accountant',
    nationalId: '0012345678',
    position: 'حسابدار نرم‌افزار',
    baseSalary: 50_000_000,
    children: 2,
    married: true,
    seniorityYears: 5,
    createdAt: '2020-01-01T00:00:00.000Z',
  };
  const payrollInput: PayrollInput = {
    baseSalary: employee.baseSalary,
    children: employee.children,
    married: employee.married,
    seniorityYears: employee.seniorityYears,
    workedDays: 26,
    overtimeHours: 6,
    nightShiftHours: 4,
    otherBenefits: 3_000_000,
    otherDeductions: 1_200_000,
  };
  const payrollResult = calculatePayroll(payrollInput, DEFAULT_PAYROLL_RATES);
  const payslipBlob = await buildPayslipPdf({
    employee,
    month: '1405-08',
    input: payrollInput,
    result: payrollResult,
    rates: DEFAULT_PAYROLL_RATES,
    workedDays: 26,
    overtimeHours: 6,
    nightHours: 4,
    unit: 'toman',
    shopName: 'حسابیار — KarenSoft',
  });
  const payslipBytes = new Uint8Array(await payslipBlob.arrayBuffer());
  writeFileSync('docs/samples/payslip-persian-verification.pdf', payslipBytes);
  console.log('wrote docs/samples/payslip-persian-verification.pdf', payslipBytes.length, 'bytes');

  // sanity: embedded fonts + page count
  for (const f of [
    'docs/samples/persian-typography-verification.pdf',
    'docs/samples/factor-persian-verification.pdf',
    'docs/samples/payslip-persian-verification.pdf',
  ]) {
    const doc = await PDFDocument.load(readFileSync(f));
    const raw = readFileSync(f).toString('latin1');
    console.log(
      f,
      '| pages:',
      doc.getPageCount(),
      '| FontFile2 count:',
      (raw.match(/\/FontFile2/g) ?? []).length,
    );
  }
}

void main();
