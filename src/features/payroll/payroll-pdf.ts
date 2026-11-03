/**
 * فیش حقوقی برداری (PDF متنی) — جایگزین خروجی تصویری html2canvas.
 *
 * همان موتور برداری فاکتور (PdfCanvas): فونت وزیرمتن به‌صورت کامل در PDF
 * embed می‌شود، حروف فارسی شکل‌دهی و راست‌به‌چپ چیده می‌شوند و متن با
 * /ActualText قابل انتخاب و جست‌وجو است؛ در چاپ و زوم افت کیفیت ندارد.
 */
import type { Employee } from '@/core/db/db';
import type { PayrollInput, PayrollResult, PayrollRates } from '@/core/calc/payroll';
import type { CurrencyUnit } from '@/core/currency/currency';
import { CURRENCY_LABELS, toFaDigits } from '@/core/currency/currency';
import { jalaliMonthLabel } from '@/core/jalali/jalali';
import { PdfCanvas, MM } from '@/core/pdf/canvas';
import { faNumber, WORD_JOINER } from '@/core/pdf/persian';
import { amountInWords } from '@/core/text/amount-words';

export interface PayslipDocumentInput {
  employee: Employee;
  /** کلید ماه شمسی مثل 1405-08 */
  month: string;
  input: PayrollInput;
  result: PayrollResult;
  rates: PayrollRates;
  workedDays: number;
  overtimeHours: number;
  nightHours: number;
  unit: CurrencyUnit;
  shopName: string;
}

const C = {
  navy: '#0B1B3A',
  navySoft: '#1C3F7D',
  navyMuted: '#5B7BB0',
  ink: '#1F2937',
  inkSoft: '#5A6474',
  line: '#DEE6F2',
  surface: '#F1F5FB',
  surfaceAlt: '#F8FAFE',
  white: '#FFFFFF',
  neon: '#12B76A',
  danger: '#B42318',
} as const;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = MM * 14;
const CONTENT_W = PAGE_W - M * 2;
const RIGHT = PAGE_W - M;
const LEFT = M;
const FOOTER_ZONE = MM * 16;
const BODY_BOTTOM = PAGE_H - FOOTER_ZONE;

const baseline = (top: number, height: number, size: number) => top + height / 2 + size * 0.36;

/** نام فایل خروجی — همان الگوی قبلی */
export function payslipFileName(employeeName: string, month: string): string {
  return `payslip-${employeeName}-${month}.pdf`;
}

export async function buildPayslipPdf(input: PayslipDocumentInput): Promise<Blob> {
  const { employee, month, result, rates, workedDays, overtimeHours, nightHours, unit, shopName } =
    input;
  const unitLabel = CURRENCY_LABELS[unit];
  const money = (amount: number) =>
    `${faNumber(unit === 'rial' ? amount * 10 : amount)} ${WORD_JOINER}${unitLabel}`;

  const canvas = await PdfCanvas.create({
    title: `فیش حقوقی ${employee.name} — ${jalaliMonthLabel(month)} — ${shopName}`,
    subject: `فیش حقوقی ${jalaliMonthLabel(month)}`,
    author: shopName,
    keywords: ['فیش حقوقی', employee.name, jalaliMonthLabel(month), shopName],
    baseUrl: import.meta.env.BASE_URL,
  });
  canvas.newPage();

  let y = 0;

  // ——— نوار برند ———
  canvas.rect(0, 0, PAGE_W, MM * 4.2, { fill: C.navy });
  canvas.rect(0, MM * 4.2, PAGE_W, MM * 0.9, { fill: '#39FF88' });

  // ——— سربرگ: هویت فروشگاه + عنوان سند ———
  const headTop = MM * 10;
  const nameSize = canvas.fitSize(shopName, MM * 120, 16, 'bold', 10);
  canvas.text(shopName, RIGHT, headTop + nameSize * 0.92, {
    size: nameSize,
    weight: 'bold',
    color: C.navy,
    maxWidth: MM * 120,
  });
  canvas.text(`فیش حقوقی ${jalaliMonthLabel(month)}`, RIGHT, headTop + nameSize * 1.05 + MM * 4.4, {
    size: 10,
    weight: 'medium',
    color: C.inkSoft,
    maxWidth: MM * 120,
  });

  const cardW = MM * 62;
  const cardH = MM * 25.5;
  canvas.rect(LEFT, headTop, cardW, cardH, {
    fill: C.surfaceAlt,
    stroke: C.line,
    strokeWidth: 0.7,
    radius: MM * 2,
  });
  canvas.rect(LEFT, headTop, cardW, MM * 7.4, { fill: C.navy, radius: MM * 2 });
  canvas.rect(LEFT, headTop + MM * 5.4, cardW, MM * 2, { fill: C.navy });
  canvas.text('فیش حقوقی', LEFT + cardW / 2, baseline(headTop, MM * 7.4, 9.4), {
    size: 9.4,
    weight: 'bold',
    color: C.white,
    align: 'center',
  });
  const cardMid = LEFT + cardW / 2;
  canvas.text('کارمند', cardMid, headTop + MM * 11, {
    size: 6.8,
    color: C.inkSoft,
    align: 'center',
  });
  const empNameSize = canvas.fitSize(employee.name, cardW - MM * 8, 12.5, 'bold', 8);
  canvas.text(employee.name, cardMid, headTop + MM * 16.4, {
    size: empNameSize,
    weight: 'bold',
    color: C.navy,
    align: 'center',
    maxWidth: cardW - MM * 8,
  });
  canvas.line(cardMid - MM * 9, headTop + MM * 18.4, cardMid + MM * 9, headTop + MM * 18.4, {
    color: C.line,
    width: 0.6,
  });
  const subLine = [
    employee.position && `سمت: ${employee.position}`,
    employee.nationalId && `کد ملی: ${employee.nationalId}`,
  ]
    .filter(Boolean)
    .join('  ·  ');
  if (subLine) {
    canvas.text(subLine, cardMid, headTop + MM * 22.2, {
      size: 7.2,
      color: C.inkSoft,
      align: 'center',
      maxWidth: cardW - MM * 6,
    });
  }
  y = headTop + cardH + MM * 6;

  // ——— کارت‌های مزایا و کسورات ———
  const benefitRows: { label: string; value: string }[] = [
    { label: 'حقوق پایه', value: money(result.baseSalary) },
    { label: 'پایه سنوات', value: money(result.seniorityPay) },
    { label: 'حق مسکن', value: money(result.housingAllowance) },
    { label: 'بن خواربار', value: money(result.groceryAllowance) },
    { label: 'حق اولاد', value: money(result.childAllowance) },
    { label: 'حق تأهل', value: money(result.marriageAllowance) },
    { label: 'اضافه‌کاری', value: money(result.overtimePay) },
    { label: 'شب‌کاری', value: money(result.nightShiftPay) },
    { label: 'سایر مزایا', value: money(result.otherBenefits) },
  ].filter((row) => row.value !== money(0));

  const deductionRows: { label: string; value: string }[] = [
    {
      label: `بیمه‌ی سهم کارگر (${toFaDigits(String(rates.insuranceRatePercent))}٪)`,
      value: money(result.insuranceEmployee),
    },
    { label: 'مالیات حقوق', value: money(result.tax) },
    { label: 'سایر کسورات', value: money(result.otherDeductions) },
  ].filter((row) => row.value !== money(0));

  const gap = MM * 5;
  const colW = (CONTENT_W - gap) / 2;
  const rowH = MM * 7.2;
  const headRowH = MM * 8;
  const benefitsH = headRowH + benefitRows.length * rowH + MM * 8;
  const deductionsH = headRowH + deductionRows.length * rowH + MM * 8;
  const cardsH = Math.max(benefitsH, deductionsH);

  const drawListCard = (
    x: number,
    title: string,
    rows: { label: string; value: string }[],
    totalLabel: string,
    totalValue: string,
    accent: string,
  ) => {
    canvas.rect(x, y, colW, cardsH, {
      fill: C.white,
      stroke: C.line,
      strokeWidth: 0.7,
      radius: MM * 1.8,
    });
    canvas.rect(x + colW - MM * 4.5, y + MM * 3.2, MM * 1.8, MM * 1.8, {
      fill: accent,
      radius: MM * 0.5,
    });
    canvas.text(title, x + colW - MM * 7.4, y + MM * 5.4, {
      size: 8.6,
      weight: 'bold',
      color: C.navy,
    });
    let rowY = y + headRowH + MM * 2;
    for (const row of rows) {
      canvas.text(row.label, x + colW - MM * 4.5, rowY, {
        size: 7.6,
        color: C.inkSoft,
        maxWidth: colW * 0.58,
      });
      canvas.text(row.value, x + MM * 4.5, rowY, {
        size: 7.8,
        weight: 'medium',
        color: C.ink,
        align: 'left',
      });
      rowY += rowH;
      canvas.dashedLine(
        x + MM * 3.5,
        x + colW - MM * 3.5,
        rowY - rowH / 2 + MM * 1,
        '#EDF1F8',
        0.5,
        [1.6, 1.8],
      );
    }
    canvas.line(x + MM * 3.5, y + cardsH - MM * 8.4, x + colW - MM * 3.5, y + cardsH - MM * 8.4, {
      color: C.line,
      width: 0.7,
    });
    canvas.text(totalLabel, x + colW - MM * 4.5, y + cardsH - MM * 4.6, {
      size: 8,
      weight: 'bold',
      color: C.navy,
    });
    canvas.text(totalValue, x + MM * 4.5, y + cardsH - MM * 4.6, {
      size: 8.4,
      weight: 'bold',
      color: C.navy,
      align: 'left',
    });
  };

  drawListCard(
    RIGHT - colW,
    'مزایا و دریافتی‌ها',
    benefitRows,
    'جمع ناخالص',
    money(result.gross),
    '#12B76A',
  );
  drawListCard(
    LEFT,
    'کسورات',
    deductionRows,
    'جمع کسورات',
    money(result.insuranceEmployee + result.tax + result.otherDeductions),
    C.danger,
  );
  y += cardsH + MM * 6;

  // ——— نوار خالص پرداختی ———
  const netH = MM * 15;
  canvas.rect(LEFT, y, CONTENT_W, netH, { fill: C.navy, radius: MM * 2 });
  canvas.text('خالص قابل پرداخت', RIGHT - MM * 5, baseline(y, netH, 9.4), {
    size: 9.4,
    weight: 'bold',
    color: C.white,
  });
  const netText = money(result.netPay);
  const netSize = canvas.fitSize(netText, CONTENT_W * 0.55, 13, 'bold', 8);
  canvas.text(netText, LEFT + MM * 5, baseline(y, netH, netSize), {
    size: netSize,
    weight: 'bold',
    color: '#39FF88',
    align: 'left',
  });
  y += netH + MM * 6;

  // ——— مبلغ به حروف + یادداشت ———
  const noteH = MM * 24;
  canvas.rect(LEFT, y, CONTENT_W, noteH, { fill: C.surface, radius: MM * 2 });
  canvas.text('مبلغ به حروف', RIGHT - MM * 4, y + MM * 6.4, { size: 6.9, color: C.navyMuted });
  canvas.paragraph(
    `${amountInWords(result.netPay)} ${WORD_JOINER}${unitLabel}`,
    RIGHT - MM * 4,
    y + MM * 11,
    {
      size: 8.4,
      weight: 'medium',
      color: C.navy,
      maxWidth: CONTENT_W - MM * 8,
      lineHeight: MM * 4.6,
    },
  );
  const metaLine = [
    `روزهای کارکرد: ${faNumber(workedDays, 0)} روز`,
    overtimeHours > 0 && `اضافه‌کاری: ${toFaDigits(String(overtimeHours))} ساعت`,
    nightHours > 0 && `شب‌کاری: ${toFaDigits(String(nightHours))} ساعت`,
  ]
    .filter(Boolean)
    .join(' — ');
  canvas.text(metaLine, RIGHT - MM * 4, y + noteH - MM * 5.4, {
    size: 7,
    color: C.inkSoft,
    maxWidth: CONTENT_W - MM * 8,
  });
  y += noteH + MM * 5;

  // ——— توضیحات + امضا ———
  if (y + MM * 34 > BODY_BOTTOM) {
    canvas.newPage();
    y = MM * 10;
  }
  const noteText =
    'این فیش بر اساس قانون کار و نرخ‌های جاری سیستم صادر شده است. هرگونه مغایرت را به واحد مالی اطلاع دهید.';
  const sigH = MM * 26;
  canvas.paragraph(noteText, RIGHT, y, {
    size: 7.4,
    color: C.inkSoft,
    maxWidth: CONTENT_W - MM * 70,
    lineHeight: MM * 4.4,
  });
  const sigW = MM * 60;
  canvas.rect(RIGHT - sigW, y, sigW, sigH, {
    fill: C.white,
    stroke: C.line,
    strokeWidth: 0.7,
    radius: MM * 1.8,
    dash: [3.2, 2.6],
  });
  canvas.text('امضای کارمند', RIGHT - MM * 4, y + MM * 6, {
    size: 7.6,
    weight: 'medium',
    color: C.navySoft,
  });
  canvas.text(employee.name, RIGHT - MM * 4, y + sigH - MM * 5, {
    size: 6.6,
    color: C.navyMuted,
    maxWidth: sigW - MM * 8,
  });

  // ——— پابرگ ———
  canvas.onEachPage((pageNumber, total) => {
    const footerY = PAGE_H - MM * 10;
    canvas.rect(0, PAGE_H - MM * 4.2, PAGE_W, MM * 4.2, { fill: C.navy });
    canvas.line(LEFT, footerY - MM * 6, RIGHT, footerY - MM * 6, { color: C.line, width: 0.6 });
    const brand = `صادرشده با دستمزد‌یار کارن سافت — ${shopName}`;
    canvas.text(brand, RIGHT, footerY, {
      size: canvas.fitSize(brand, MM * 70, 6.6, 'regular', 5.4),
      color: C.navyMuted,
      maxWidth: MM * 70,
    });
    canvas.text(`صفحه ${faNumber(pageNumber, 0)} از ${faNumber(total, 0)}`, PAGE_W / 2, footerY, {
      size: 6.6,
      color: C.inkSoft,
      align: 'center',
    });
    canvas.text(`کارمند: ${employee.name} — ${jalaliMonthLabel(month)}`, LEFT, footerY, {
      size: 6.6,
      color: C.navyMuted,
      align: 'left',
      maxWidth: MM * 55,
    });
  });

  return canvas.blob();
}

/** ذخیره‌ی PDF فیش حقوقی با همان نام فایل قبلی */
export async function downloadPayslipPdf(input: PayslipDocumentInput): Promise<string> {
  const { saveBlob } = await import('@/core/utils/file-save');
  const blob = await buildPayslipPdf(input);
  const fileName = payslipFileName(input.employee.name, input.month);
  await saveBlob(fileName, blob);
  return fileName;
}
