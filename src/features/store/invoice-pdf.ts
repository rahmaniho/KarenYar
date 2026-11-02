/**
 * سند PDF حرفه‌ای فاکتور فروش — برداری، فارسی کامل
 *
 * ویژگی‌ها:
 *  - متن واقعی (قابل انتخاب/جستجو در PDF) با فونت وزیرمتن و شکل‌دهی درست
 *  - سربرگ فروشنده/خریدار، جدول اقلام با شکست صفحه و تکرار سرستون
 *  - جمع‌بندی، مبلغ به حروف، جای مهر و امضا، یادداشت شرایط فروش
 *  - پابرگ با شماره‌ی صفحه و کد پیگیری، واترمارک «باطل» برای فاکتور ابطال‌شده
 *  - نام فایل خروجی: factor-<شماره فاکتور>.pdf
 */
import { assetUrl } from '@/lib/utils';
import type { Customer, Invoice, InvoiceItem } from '@/core/db/db';
import { formatJalaliFull, formatJalaliNumeric } from '@/core/jalali/jalali';
import { CURRENCY_LABELS, type CurrencyUnit } from '@/core/currency/currency';
import { PdfCanvas, MM } from '@/core/pdf/canvas';
import { faNumber, WORD_JOINER } from '@/core/pdf/persian';
import { invoicePaymentMethod, PAYMENT_LABELS } from './payment';
import { amountInWords } from './amount-words';

export interface InvoiceDocumentSettings {
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  /** شناسه/کد اقتصادی (اختیاری) */
  shopEconomicCode?: string;
  /** شماره ثبت (اختیاری) */
  shopRegistrationNumber?: string;
  currencyUnit: CurrencyUnit;
  /** یادداشت ثابت پایین فاکتور (شرایط فروش) */
  invoiceFooterNote?: string;
  /** نمایش لوگو در سربرگ فاکتور (پیش‌فرض: بله) */
  invoiceShowLogo?: boolean;
}

export interface InvoiceDocumentInput {
  invoice: Invoice;
  items: InvoiceItem[];
  customer?: Customer | null;
  settings: InvoiceDocumentSettings;
}

const C = {
  navy: '#0B1B3A',
  navySoft: '#1C3F7D',
  navyMuted: '#4F78BD',
  line: '#D9E4F5',
  lineStrong: '#84A5D8',
  surface: '#EEF3FB',
  surfaceAlt: '#F7FAFF',
  neon: '#21C46B',
  danger: '#B91C1C',
  dangerSurface: '#FEF2F2',
  white: '#FFFFFF',
  ink: '#1F2937',
  inkSoft: '#4B5563',
};

const PAGE_MARGIN = MM * 14;
const TOP_MARGIN = MM * 12;
const FOOTER_RESERVE = MM * 18;

/** نام فایل استاندارد خروجی: factor-1024.pdf */
export function invoiceFileName(number: number | string): string {
  return `factor-${String(number).trim()}`;
}

/** ساخت Blob سند فاکتور */
export async function buildInvoicePdf(input: InvoiceDocumentInput): Promise<Blob> {
  const { invoice, items, settings } = input;
  const unit = settings.currencyUnit;
  const unitLabel = CURRENCY_LABELS[unit];
  /** مبلغ با واحد نمایشی کاربر */
  const money = (toman: number) =>
    `${faNumber(unit === 'rial' ? toman * 10 : toman)}${WORD_JOINER} ${unitLabel}`;

  const canvas = await PdfCanvas.create({
    title: `فاکتور فروش شماره ${invoice.number} — ${settings.shopName}`,
    subject: `صورتحساب فروش${invoice.customerName ? ` — ${invoice.customerName}` : ''}`,
    author: settings.shopName,
    keywords: [
      'فاکتور',
      'فاکتور فروش',
      `شماره ${invoice.number}`,
      invoice.customerName ?? 'مشتری گذری',
      settings.shopName,
    ],
    baseUrl: import.meta.env.BASE_URL,
  });

  const pageWidth = canvas.width;
  const pageHeight = canvas.height;
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const right = pageWidth - PAGE_MARGIN;
  const left = PAGE_MARGIN;

  const isVoided = invoice.status === 'voided';
  const issueDate = new Date(invoice.date);
  const paymentLabel = PAYMENT_LABELS[invoicePaymentMethod(invoice)];

  /** خط پایه‌ی متن در وسط یک نوار با ارتفاع مشخص */
  const baseline = (top: number, height: number, size: number) => top + height / 2 + size * 0.36;

  let y = TOP_MARGIN;

  // ————————————————— سربرگ —————————————————
  const drawHeader = async (first: boolean) => {
    canvas.newPage();
    canvas.rect(0, 0, pageWidth, MM * 5, { fill: C.navy });
    canvas.rect(0, MM * 5, pageWidth, MM * 1.2, { fill: C.neon });

    if (!first) {
      const headTop = MM * 10;
      canvas.text(
        `${settings.shopName} — ادامه‌ی فاکتور شماره ${faNumber(invoice.number, 0)}`,
        right,
        baseline(headTop, MM * 6, 9),
        {
          size: 9,
          weight: 'medium',
          color: C.navySoft,
        },
      );
      canvas.text('ادامه در صفحه‌ی بعد', left, baseline(headTop, MM * 6, 8), {
        size: 8,
        color: C.navyMuted,
        align: 'left',
      });
      canvas.line(left, MM * 17, right, MM * 17, { color: C.line, width: 0.8 });
      y = MM * 21;
      return;
    }

    // لوگو و نام فروشگاه (سمت راست سربرگ)
    const logoSize = MM * 17;
    const logoTop = MM * 9;
    const showLogo = settings.invoiceShowLogo !== false;
    if (showLogo) {
      await canvas.image(
        assetUrl('images/karensoft/KarenYar.png'),
        right - logoSize,
        logoTop,
        logoSize,
        logoSize,
      );
    }
    const textRight = showLogo ? right - logoSize - MM * 4 : right;
    canvas.text(settings.shopName, textRight, baseline(logoTop, MM * 7, 16), {
      size: 16,
      weight: 'bold',
      color: C.navy,
    });
    const contact = [settings.shopPhone && `تلفن: ${settings.shopPhone}`, settings.shopAddress]
      .filter(Boolean)
      .join('  |  ');
    if (contact) {
      canvas.paragraph(contact, textRight, baseline(logoTop + MM * 8, MM * 4, 7.6), {
        size: 7.6,
        color: C.inkSoft,
        maxWidth: MM * 88,
        lineHeight: MM * 3.6,
      });
    }
    const legal = [
      settings.shopEconomicCode && `شناسه اقتصادی: ${settings.shopEconomicCode}`,
      settings.shopRegistrationNumber && `شماره ثبت: ${settings.shopRegistrationNumber}`,
    ]
      .filter(Boolean)
      .join('  |  ');
    if (legal) {
      canvas.text(legal, textRight, logoTop + MM * 14.5, { size: 7, color: C.navyMuted });
    }

    // جعبه‌ی عنوان سند (سمت چپ سربرگ)
    const boxW = MM * 56;
    const boxH = MM * 26;
    const boxTop = logoTop;
    canvas.rect(left, boxTop, boxW, boxH, {
      fill: C.surface,
      stroke: C.line,
      strokeWidth: 0.8,
      radius: MM * 2,
    });
    canvas.rect(left, boxTop, boxW, MM * 7, { fill: C.navy, radius: MM * 2 });
    canvas.rect(left, boxTop + MM * 5, boxW, MM * 2, { fill: C.navy });
    canvas.text('صورتحساب فروش', left + boxW / 2, baseline(boxTop, MM * 7, 9.2), {
      size: 9.2,
      weight: 'bold',
      color: C.white,
      align: 'center',
    });
    canvas.text('شماره فاکتور', left + boxW / 2, boxTop + MM * 10.6, {
      size: 7,
      color: C.inkSoft,
      align: 'center',
    });
    canvas.text(faNumber(invoice.number, 0), left + boxW / 2, boxTop + MM * 16, {
      size: 14,
      weight: 'bold',
      color: C.navy,
      align: 'center',
    });
    canvas.text(formatJalaliFull(issueDate), left + boxW / 2, boxTop + MM * 21.6, {
      size: 7.4,
      color: C.inkSoft,
      align: 'center',
    });

    y = logoTop + boxH + MM * 5;
    canvas.line(left, y, right, y, { color: C.lineStrong, width: 0.9 });
    y += MM * 4;

    // ——— خریدار و فروشنده ———
    const partyH = MM * 24;
    const gap = MM * 4;
    const partyW = (contentWidth - gap) / 2;
    const drawParty = (x: number, title: string, rows: [string, string | undefined][]) => {
      canvas.rect(x, y, partyW, partyH, {
        fill: C.surfaceAlt,
        stroke: C.line,
        strokeWidth: 0.6,
        radius: MM * 1.6,
      });
      canvas.rect(x + partyW - MM * 1.4, y, MM * 1.4, partyH, { fill: C.navy, radius: MM * 0.7 });
      canvas.text(title, x + partyW - MM * 5, baseline(y + MM * 1, MM * 6, 8.4), {
        size: 8.4,
        weight: 'bold',
        color: C.navySoft,
      });
      let rowY = y + MM * 10;
      for (const [label, value] of rows) {
        if (!value) continue;
        const labelWidth = canvas.measure(label, 7.2);
        canvas.text(label, x + partyW - MM * 5, rowY, { size: 7.2, color: C.inkSoft });
        canvas.text(
          canvas.ellipsize(value, partyW - labelWidth - MM * 11, 8),
          x + partyW - MM * 5 - labelWidth - MM * 1.2,
          rowY,
          {
            size: 8,
            weight: 'medium',
            color: C.ink,
          },
        );
        rowY += MM * 4.6;
      }
    };

    drawParty(right - partyW, 'خریدار', [
      ['نام:', invoice.customerName ?? 'مشتری گذری'],
      ['تلفن:', input.customer?.phone],
      ['نشانی:', input.customer?.address],
    ]);
    drawParty(left, 'فروشنده', [
      ['نام:', settings.shopName],
      ['تلفن:', settings.shopPhone],
      ['واحد پول:', unitLabel],
    ]);

    y += partyH + MM * 4;

    // ——— نوار اطلاعات سند ———
    const meta: [string, string, boolean?][] = [
      ['شماره فاکتور', faNumber(invoice.number, 0)],
      ['تاریخ صدور', formatJalaliNumeric(issueDate)],
      ['روش پرداخت', paymentLabel],
      ['وضعیت', isVoided ? 'باطل‌شده' : invoice.isCredit ? 'فروش نسیه' : 'تسویه‌شده', isVoided],
      ['منبع ثبت', invoice.source === 'pos' ? 'صندوق فروش' : 'صدور دستی'],
    ];
    const cellW = contentWidth / meta.length;
    meta.forEach(([label, value, danger], index) => {
      const cellRight = right - cellW * index;
      canvas.rect(cellRight - cellW + MM * 0.8, y, cellW - MM * 1.6, MM * 12, {
        fill: danger ? C.dangerSurface : C.surface,
        radius: MM * 1.2,
      });
      canvas.text(label, cellRight - MM * 2.6, y + MM * 4.4, { size: 6.6, color: C.inkSoft });
      canvas.text(value, cellRight - MM * 2.6, y + MM * 9, {
        size: 8.2,
        weight: 'bold',
        color: danger ? C.danger : C.navy,
      });
    });
    y += MM * 15;

    if (isVoided) {
      canvas.rect(left, y, contentWidth, MM * 11, {
        fill: C.dangerSurface,
        stroke: '#FCA5A5',
        strokeWidth: 0.7,
        radius: MM * 1.2,
      });
      const reason = invoice.voidReason ? ` — دلیل: ${invoice.voidReason}` : '';
      canvas.text(
        canvas.ellipsize(`این فاکتور باطل شده است${reason}`, contentWidth - MM * 6, 8.2),
        right - MM * 3,
        baseline(y, MM * 11, 8.2),
        {
          size: 8.2,
          weight: 'bold',
          color: C.danger,
        },
      );
      y += MM * 14;
    }

    // واترمارک «باطل»
    if (isVoided) {
      canvas.text('باطل', pageWidth / 2, pageHeight / 2, {
        size: 130,
        weight: 'bold',
        color: C.danger,
        opacity: 0.06,
        align: 'center',
        rotate: 18,
      });
    }
  };

  // ————————————————— جدول اقلام —————————————————
  // ترتیب ستون‌ها از راست به چپ (اولین عضو، سمت راست جدول است)
  const columns = [
    { key: 'row', label: 'ردیف', width: MM * 11, align: 'center' as const },
    { key: 'name', label: 'شرح کالا / خدمات', width: MM * 64, align: 'right' as const },
    { key: 'qty', label: 'تعداد', width: MM * 16, align: 'center' as const },
    { key: 'unitPrice', label: 'قیمت واحد', width: MM * 33, align: 'left' as const },
    { key: 'discount', label: 'تخفیف', width: MM * 17, align: 'left' as const },
    { key: 'total', label: 'مبلغ کل', width: MM * 37, align: 'left' as const },
  ];
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const nameExtra = contentWidth - tableWidth;
  const columnWidth = (key: string) =>
    (columns.find((column) => column.key === key)!.width ?? 0) + (key === 'name' ? nameExtra : 0);

  const drawTableHead = () => {
    canvas.rect(left, y, contentWidth, MM * 9, { fill: C.navy, radius: MM * 1.2 });
    let cursorRight = right;
    for (const column of columns) {
      const width = columnWidth(column.key);
      const textX =
        column.align === 'left'
          ? cursorRight - width + MM * 3
          : column.align === 'center'
            ? cursorRight - width / 2
            : cursorRight - MM * 3;
      canvas.text(column.label, textX, baseline(y, MM * 9, 7.8), {
        size: 7.8,
        weight: 'bold',
        color: C.white,
        align: column.align,
      });
      cursorRight -= width;
    }
    y += MM * 9;
  };

  const ensureSpace = async (needed: number) => {
    if (y + needed > pageHeight - FOOTER_RESERVE) {
      await drawHeader(false);
      drawTableHead();
      return true;
    }
    return false;
  };

  await drawHeader(true);
  drawTableHead();

  const rowPaddingY = MM * 2.8;
  const nameSize = 8;
  const nameLineHeight = MM * 4.2;

  for (const [index, item] of items.entries()) {
    const nameWidth = columnWidth('name') - MM * 6;
    const nameLines = canvas.wrap(item.name, nameWidth, nameSize, 'medium');
    const rowHeight = rowPaddingY * 2 + Math.max(1, nameLines.length) * nameLineHeight;
    await ensureSpace(rowHeight);

    if (index % 2 === 1) canvas.rect(left, y, contentWidth, rowHeight, { fill: C.surfaceAlt });

    let cursorRight = right;
    const firstLineY = y + rowPaddingY + nameSize * 0.85;
    for (const column of columns) {
      const width = columnWidth(column.key);
      if (column.key === 'row') {
        canvas.text(faNumber(index + 1, 0), cursorRight - width / 2, firstLineY, {
          size: 7.6,
          color: C.inkSoft,
          align: 'center',
        });
      } else if (column.key === 'name') {
        nameLines.forEach((line, lineIndex) => {
          canvas.text(line, cursorRight - MM * 3, firstLineY + lineIndex * nameLineHeight, {
            size: nameSize,
            weight: 'medium',
            color: C.ink,
          });
        });
      } else if (column.key === 'qty') {
        canvas.text(faNumber(item.qty, 3), cursorRight - width / 2, firstLineY, {
          size: 8,
          color: C.ink,
          align: 'center',
        });
      } else if (column.key === 'unitPrice') {
        canvas.text(faNumber(item.unitPrice, 0), cursorRight - width + MM * 3, firstLineY, {
          size: 8,
          color: C.ink,
          align: 'left',
        });
      } else if (column.key === 'discount') {
        const share =
          invoice.subtotal > 0 && invoice.discountAmount > 0
            ? (item.total / invoice.subtotal) * invoice.discountAmount
            : 0;
        canvas.text(
          share > 0 ? faNumber(Math.round(share), 0) : '—',
          cursorRight - width + MM * 3,
          firstLineY,
          {
            size: 7.6,
            color: share > 0 ? C.danger : C.navyMuted,
            align: 'left',
          },
        );
      } else {
        canvas.text(faNumber(item.total, 0), cursorRight - width + MM * 3, firstLineY, {
          size: 8.4,
          weight: 'bold',
          color: C.navy,
          align: 'left',
        });
      }
      cursorRight -= width;
    }

    y += rowHeight;
    canvas.line(left, y, right, y, { color: C.line, width: 0.5 });
  }

  if (!items.length) {
    canvas.text('هیچ قلمی در این فاکتور ثبت نشده است.', pageWidth / 2, y + MM * 8, {
      size: 8,
      color: C.navyMuted,
      align: 'center',
    });
    y += MM * 16;
  }

  // ————————————————— جمع‌بندی —————————————————
  const totals: { label: string; value: string; kind?: 'total' }[] = [
    { label: 'جمع اقلام', value: money(invoice.subtotal) },
  ];
  if (invoice.discountAmount > 0) {
    totals.push({
      label:
        invoice.discountType === 'percent'
          ? `تخفیف (${faNumber(invoice.discountValue, 2)}٪)`
          : 'تخفیف',
      value: money(invoice.discountAmount),
    });
  }
  if (invoice.taxAmount > 0) {
    totals.push({
      label: `مالیات بر ارزش افزوده (${faNumber(invoice.taxPercent, 2)}٪)`,
      value: money(invoice.taxAmount),
    });
  }
  if (invoice.paymentMethod === 'cash' && invoice.cashTendered !== undefined) {
    totals.push({ label: 'وجه نقد دریافتی', value: money(invoice.cashTendered) });
    totals.push({ label: 'باقی پول مشتری', value: money(invoice.changeAmount ?? 0) });
  }

  const finalLabel = isVoided
    ? 'مبلغ سند باطل‌شده'
    : invoice.isCredit
      ? 'مبلغ نسیه'
      : 'مبلغ قابل پرداخت';

  const totalsWidth = MM * 88;
  const totalsBoxHeight = totals.length * MM * 6.4 + MM * 4 + MM * 15;
  const extraBlocksHeight = MM * 34;
  const summaryHeight = Math.max(totalsBoxHeight, extraBlocksHeight);
  await ensureSpace(summaryHeight + MM * 8);

  y += MM * 5;
  const summaryTop = y;

  // یادداشت، مبلغ به حروف و شرایط فروش (سمت راست)
  const noteWidth = contentWidth - totalsWidth - MM * 6;
  const noteRight = right;
  const noteLeft = noteRight - noteWidth;
  canvas.rect(noteLeft, summaryTop, noteWidth, summaryHeight, {
    fill: C.surface,
    radius: MM * 1.4,
  });
  let noteY = summaryTop + MM * 6;
  canvas.text('مبلغ به حروف', noteLeft + noteWidth - MM * 3, noteY, {
    size: 7,
    color: C.inkSoft,
  });
  noteY += MM * 4.6;
  const wordsHeight = canvas.paragraph(
    `${amountInWords(invoice.total)} ${WORD_JOINER}${unitLabel}`,
    noteLeft + noteWidth - MM * 3,
    noteY,
    {
      size: 8.4,
      weight: 'medium',
      color: C.navy,
      maxWidth: noteWidth - MM * 6,
      lineHeight: MM * 4.4,
    },
  );
  noteY += wordsHeight + MM * 2.5;
  if (invoice.note) {
    canvas.text('یادداشت', noteLeft + noteWidth - MM * 3, noteY, { size: 7, color: C.inkSoft });
    noteY += MM * 4.2;
    noteY += canvas.paragraph(invoice.note, noteLeft + noteWidth - MM * 3, noteY, {
      size: 7.4,
      color: C.inkSoft,
      maxWidth: noteWidth - MM * 6,
      lineHeight: MM * 4,
    });
  }
  if (settings.invoiceFooterNote) {
    noteY += MM * 1.5;
    canvas.text('شرایط فروش', noteLeft + noteWidth - MM * 3, noteY, { size: 7, color: C.inkSoft });
    noteY += MM * 4.2;
    canvas.paragraph(settings.invoiceFooterNote, noteLeft + noteWidth - MM * 3, noteY, {
      size: 7.2,
      color: C.inkSoft,
      maxWidth: noteWidth - MM * 6,
      lineHeight: MM * 3.8,
    });
  }

  // جدول جمع‌بندی (سمت چپ)
  const totalsLeft = left;
  let totalsY = summaryTop;
  canvas.rect(totalsLeft, totalsY, totalsWidth, totals.length * MM * 6.4 + MM * 3, {
    stroke: C.line,
    strokeWidth: 0.6,
    radius: MM * 1.2,
    fill: C.white,
  });
  totals.forEach((row, index) => {
    const rowY = totalsY + MM * 4.6 + index * MM * 6.4;
    canvas.text(row.label, totalsLeft + totalsWidth - MM * 4, rowY, {
      size: 7.8,
      color: C.inkSoft,
      maxWidth: totalsWidth - MM * 8,
    });
    canvas.text(row.value, totalsLeft + MM * 4, rowY, {
      size: 8.2,
      weight: 'medium',
      color: C.ink,
      align: 'left',
    });
    if (index < totals.length - 1) {
      canvas.dashedLine(
        totalsLeft + MM * 2,
        totalsLeft + totalsWidth - MM * 2,
        rowY + MM * 2.2,
        C.line,
        0.4,
        [1.5, 1.5],
      );
    }
  });
  totalsY += totals.length * MM * 6.4 + MM * 3;
  canvas.rect(totalsLeft, totalsY, totalsWidth, MM * 14, { fill: C.navy, radius: MM * 1.2 });
  canvas.text(finalLabel, totalsLeft + totalsWidth - MM * 4, baseline(totalsY, MM * 14, 8.6), {
    size: 8.6,
    weight: 'bold',
    color: C.white,
  });
  canvas.text(money(invoice.total), totalsLeft + MM * 4, baseline(totalsY, MM * 14, 10.5), {
    size: 10.5,
    weight: 'bold',
    color: C.neon,
    align: 'left',
  });

  y = summaryTop + summaryHeight + MM * 8;

  // ————————————————— مهر و امضا —————————————————
  const signatureHeight = MM * 22;
  await ensureSpace(signatureHeight + MM * 6);
  const signatureGap = MM * 6;
  const signatureWidth = (contentWidth - signatureGap) / 2;
  ['مهر و امضای فروشنده', 'امضای خریدار'].forEach((label, index) => {
    const boxRight = right - (signatureWidth + signatureGap) * index;
    canvas.rect(boxRight - signatureWidth, y, signatureWidth, signatureHeight, {
      stroke: C.lineStrong,
      strokeWidth: 0.6,
      radius: MM * 1.4,
      dash: [3, 2],
    });
    canvas.text(label, boxRight - MM * 3, y + MM * 5, { size: 7.4, color: C.navyMuted });
  });

  // ————————————————— پابرگ —————————————————
  canvas.onEachPage((pageNumber, total) => {
    const footerY = pageHeight - MM * 9;
    canvas.line(left, footerY - MM * 5.5, right, footerY - MM * 5.5, { color: C.line, width: 0.6 });
    canvas.text('صادرشده با حساب‌یار کارن سافت', right, footerY, {
      size: 6.8,
      color: C.navyMuted,
    });
    canvas.text(
      `صفحه ${faNumber(pageNumber, 0)} از ${faNumber(total, 0)}`,
      pageWidth / 2,
      footerY,
      { size: 6.8, color: C.inkSoft, align: 'center' },
    );
    canvas.text(
      `کد پیگیری: ${invoice.checkoutKey?.slice(-10) ?? `INV-${invoice.number}`}`,
      left,
      footerY,
      {
        size: 6.8,
        color: C.navyMuted,
        align: 'left',
      },
    );
  });

  return canvas.blob();
}

/** ذخیره‌ی فایل فاکتور با نام factor-<شماره>.pdf و برگرداندن نام فایل */
export async function downloadInvoicePdf(input: InvoiceDocumentInput): Promise<string> {
  const { saveBlob } = await import('@/core/utils/file-save');
  const blob = await buildInvoicePdf(input);
  const fileName = `${invoiceFileName(input.invoice.number)}.pdf`;
  await saveBlob(fileName, blob);
  return fileName;
}
