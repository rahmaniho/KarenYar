/**
 * سند PDF حرفه‌ای فاکتور فروش — برداری، فارسی کامل
 *
 * طراحی: شبکه‌ی ۱۲ ستونی A4 با حاشیه‌ی امن چاپ، سربرگ برند، کارت‌های
 * طرفین معامله، نوار مشخصات سند، جدول اقلام با شکست صفحه و تکرار سرستون،
 * بلوک جمع‌بندی چسبیده به جدول، مبلغ به حروف، شرایط فروش و کادرهای امضا.
 *
 * اصولی که رعایت شده:
 *  - ستون‌های عددی راست‌چین با ارقام هم‌عرض (خواندن مقایسه‌ای مبالغ)
 *  - ارتفاع ردیف‌ها بر اساس محتوا، بدون فضای مرده
 *  - جدول و جمع‌بندی هم‌عرض و هم‌تراز (لبه‌ی مشترک)
 *  - متن واقعی قابل انتخاب/جستجو با /ActualText و فونت وزیرمتن
 *  - نام فایل خروجی: factor-<شماره فاکتور>.pdf
 */
import { assetUrl } from '@/lib/utils';
import type { Customer, CustomerPayment, Invoice, InvoiceItem } from '@/core/db/db';
import { formatJalaliFull, formatJalaliNumeric } from '@/core/jalali/jalali';
import { CURRENCY_LABELS, type CurrencyUnit } from '@/core/currency/currency';
import { PdfCanvas, MM } from '@/core/pdf/canvas';
import { faNumber, WORD_JOINER } from '@/core/pdf/persian';
import { invoicePaymentMethod, PAYMENT_LABELS } from './payment';
import {
  invoiceDueDate,
  invoiceLifecycle,
  invoicePaymentState,
  LIFECYCLE_LABELS,
} from './invoice-domain';
import { amountInWords } from './amount-words';
import { allocateInvoiceDiscount } from './invoice-calc';

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
  /** پرداخت‌های ثبت‌شده‌ی همین فاکتور — برای نمایش پرداخت‌شده/مانده در سند */
  payments?: CustomerPayment[];
}

/** پالت رنگ سند — سرمه‌ای برند، سبز نئون برای مبلغ نهایی */
const C = {
  navy: '#0B1B3A',
  navyDeep: '#081428',
  navySoft: '#1C3F7D',
  navyMuted: '#5B7BB0',
  ink: '#1F2937',
  inkSoft: '#5A6474',
  line: '#DEE6F2',
  lineSoft: '#EDF1F8',
  surface: '#F1F5FB',
  surfaceAlt: '#F8FAFE',
  white: '#FFFFFF',
  neon: '#12B76A',
  neonSoft: '#E7F8EF',
  danger: '#B42318',
  dangerSurface: '#FEF3F2',
  dangerLine: '#FDA29B',
  amber: '#B54708',
  amberSurface: '#FFFAEB',
} as const;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = MM * 14; // حاشیه‌ی امن چاپ
const CONTENT_W = PAGE_W - M * 2;
const RIGHT = PAGE_W - M;
const LEFT = M;
/** فاصله‌ی رزرو‌شده برای پابرگ */
const FOOTER_ZONE = MM * 16;
const BODY_BOTTOM = PAGE_H - FOOTER_ZONE;

/** نام فایل استاندارد خروجی: factor-1024.pdf */
export function invoiceFileName(number: number | string): string {
  return `factor-${String(number).trim()}`;
}

/** خط پایه برای متنی که در یک نوار با ارتفاع مشخص وسط‌چین می‌شود */
const baseline = (top: number, height: number, size: number) => top + height / 2 + size * 0.36;

export async function buildInvoicePdf(input: InvoiceDocumentInput): Promise<Blob> {
  const { invoice, items, settings } = input;
  const unit = settings.currencyUnit;
  const unitLabel = CURRENCY_LABELS[unit];

  /** مبلغ کامل با واحد */
  const money = (amount: number) =>
    `${faNumber(unit === 'rial' ? amount * 10 : amount)} ${WORD_JOINER}${unitLabel}`;
  /** فقط عدد — برای ستون‌های جدول که واحدشان در سرستون آمده */
  const amountOnly = (amount: number) => faNumber(unit === 'rial' ? amount * 10 : amount);

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

  const isVoided = invoice.status === 'voided';
  const issueDate = new Date(invoice.date);
  const paymentLabel = PAYMENT_LABELS[invoicePaymentMethod(invoice)];
  const buyerName = invoice.customerName?.trim() || input.customer?.name?.trim() || 'مشتری گذری';
  const buyerPhone = invoice.customerPhone?.trim() || input.customer?.phone?.trim() || '';
  const buyerAddress = invoice.customerAddress?.trim() || input.customer?.address?.trim() || '';
  const sellerPhone = settings.shopPhone?.trim() ?? '';
  const sellerAddress = settings.shopAddress?.trim() ?? '';
  const sellerEconomic = settings.shopEconomicCode?.trim() ?? '';
  const sellerRegistration = settings.shopRegistrationNumber?.trim() ?? '';
  const showLogo = settings.invoiceShowLogo !== false;

  const payState = invoicePaymentState(invoice, input.payments ?? []);
  const lifecycle = invoiceLifecycle(invoice, input.payments ?? []);
  const statusLabel = LIFECYCLE_LABELS[lifecycle];
  const isDraft = invoice.status === 'draft';
  const globalDiscountShares = allocateInvoiceDiscount(
    invoice,
    items.map((item) => ({ total: item.total - (item.discountAmount ?? 0) })),
  );
  const statusTone =
    isVoided || lifecycle === 'overdue'
      ? { bg: C.dangerSurface, fg: C.danger }
      : lifecycle === 'paid'
        ? { bg: C.neonSoft, fg: C.neon }
        : { bg: C.amberSurface, fg: C.amber };

  let y = 0;

  // ════════════════════════ سربرگ ════════════════════════
  const drawHeader = async (first: boolean) => {
    canvas.newPage();
    y = 0;

    // نوار برند بالای صفحه
    canvas.rect(0, 0, PAGE_W, MM * 4.2, { fill: C.navy });
    canvas.rect(0, MM * 4.2, PAGE_W, MM * 0.9, { fill: C.neon });

    if (!first) {
      // سربرگ فشرده‌ی صفحه‌های بعد: نام فروشگاه + شماره‌ی فاکتور
      const top = MM * 8;
      canvas.text(
        `ادامه‌ی فاکتور شماره ${faNumber(invoice.number, 0)}`,
        RIGHT,
        baseline(top, MM * 6, 9),
        { size: 9, weight: 'bold', color: C.navy },
      );
      canvas.text(settings.shopName, LEFT, baseline(top, MM * 6, 8), {
        size: 8,
        color: C.navyMuted,
        align: 'left',
      });
      canvas.line(LEFT, top + MM * 7, RIGHT, top + MM * 7, { color: C.line, width: 0.7 });
      y = top + MM * 9;
      return;
    }

    // ——— لوگو + هویت فروشگاه (راست) ———
    const headTop = MM * 9.5;
    const logoSize = MM * 15;
    const showLogoSpace = showLogo ? logoSize + MM * 4.5 : 0;
    const identityRight = RIGHT - showLogoSpace;
    const identityMax = identityRight - (LEFT + MM * 58 + MM * 8); // تا لبه‌ی کارت عنوان

    // نام فروشگاه: یک خط، با اندازه‌ی متناسب (نام بلند کوچک‌تر می‌شود، نه شکسته)
    const nameSize = canvas.fitSize(settings.shopName, identityMax, 16, 'bold', 10);
    canvas.text(settings.shopName, identityRight, headTop + nameSize * 0.92, {
      size: nameSize,
      weight: 'bold',
      color: C.navy,
      maxWidth: identityMax,
    });

    // خط تماس (تلفن + نشانی) و خط مشخصات قانونی — هر کدام یک خط با «…»
    let identityY = headTop + nameSize * 1.05 + MM * 4.2;
    const contactLine = [sellerPhone && `تلفن: ${sellerPhone}`, sellerAddress]
      .filter(Boolean)
      .join('  ·  ');
    if (contactLine) {
      canvas.text(contactLine, identityRight, identityY, {
        size: 7.4,
        color: C.inkSoft,
        maxWidth: identityMax,
      });
      identityY += MM * 4.2;
    }
    const legalLine = [
      sellerEconomic && `شناسه اقتصادی: ${sellerEconomic}`,
      sellerRegistration && `شماره ثبت: ${sellerRegistration}`,
    ]
      .filter(Boolean)
      .join('  ·  ');
    if (legalLine) {
      canvas.text(legalLine, identityRight, identityY, {
        size: 6.8,
        color: C.navyMuted,
        maxWidth: identityMax,
      });
    }
    if (showLogo) {
      await canvas.image(
        assetUrl('images/hesabyar/mark.png'),
        RIGHT - logoSize,
        headTop - MM * 0.5,
        logoSize,
        logoSize,
      );
    }

    // ——— کارت عنوان سند (چپ) ———
    const cardW = MM * 58;
    const cardH = MM * 25.5;
    canvas.rect(LEFT, headTop, cardW, cardH, {
      fill: C.surfaceAlt,
      stroke: C.line,
      strokeWidth: 0.7,
      radius: MM * 2,
    });
    // سرنویس رنگی کارت
    canvas.rect(LEFT, headTop, cardW, MM * 7.4, { fill: C.navy, radius: MM * 2 });
    canvas.rect(LEFT, headTop + MM * 5.4, cardW, MM * 2, { fill: C.navy });
    canvas.text('صورتحساب فروش', LEFT + cardW / 2, baseline(headTop, MM * 7.4, 9.4), {
      size: 9.4,
      weight: 'bold',
      color: C.white,
      align: 'center',
    });
    const cardMid = LEFT + cardW / 2;
    canvas.text('شماره فاکتور', cardMid, headTop + MM * 11, {
      size: 6.8,
      color: C.inkSoft,
      align: 'center',
    });
    canvas.text(faNumber(invoice.number, 0), cardMid, headTop + MM * 16.4, {
      size: 15,
      weight: 'bold',
      color: C.navy,
      align: 'center',
    });
    canvas.line(cardMid - MM * 9, headTop + MM * 18.4, cardMid + MM * 9, headTop + MM * 18.4, {
      color: C.line,
      width: 0.6,
    });
    canvas.text(formatJalaliFull(issueDate), cardMid, headTop + MM * 22.2, {
      size: 7.2,
      color: C.inkSoft,
      align: 'center',
    });

    y = headTop + cardH + MM * 6;

    // ——— کارت‌های خریدار و فروشنده ———
    const gap = MM * 5;
    const cardWidth = (CONTENT_W - gap) / 2;
    // ارتفاع کارت بر اساس بیشترین تعداد ردیف (بدون فضای مرده)
    const buyerRows = [buyerName, buyerPhone, buyerAddress].filter(Boolean).length;
    const sellerRows = [settings.shopName, sellerPhone, sellerAddress].filter(Boolean).length;
    const partyHeight = MM * 8 + Math.max(buyerRows, sellerRows) * MM * 5.2 + MM * 2;

    const drawParty = (
      x: number,
      title: string,
      rows: { label: string; value: string }[],
      accent: string,
    ) => {
      canvas.rect(x, y, cardWidth, partyHeight, {
        fill: C.white,
        stroke: C.line,
        strokeWidth: 0.7,
        radius: MM * 1.8,
      });
      // نشان رنگی کنار عنوان
      canvas.rect(x + cardWidth - MM * 4.5, y + MM * 3.4, MM * 1.8, MM * 1.8, {
        fill: accent,
        radius: MM * 0.5,
      });
      canvas.text(title, x + cardWidth - MM * 7.6, y + MM * 5.6, {
        size: 8.6,
        weight: 'bold',
        color: C.navy,
      });

      let rowY = y + MM * 11;
      const padRight = MM * 4.5;
      const valueMax = cardWidth - padRight * 2 - MM * 20;
      for (const row of rows) {
        if (!row.value) continue;
        // برچسب راست‌چین، مقدار بلافاصله پس از آن (بدون فاصله‌ی مصنوعی)
        canvas.text(row.label, x + cardWidth - padRight, rowY, {
          size: 7.2,
          color: C.navyMuted,
        });
        const labelWidth = canvas.measure(row.label, 7.2);
        const valueSize = canvas.fitSize(row.value, valueMax, 8.2, 'medium', 6.6);
        canvas.text(row.value, x + cardWidth - padRight - labelWidth - MM * 1.6, rowY, {
          size: valueSize,
          weight: 'medium',
          color: C.ink,
          maxWidth: valueMax,
        });
        rowY += MM * 5.2;
      }
    };

    // خریدار سمت راست، فروشنده سمت چپ
    drawParty(
      RIGHT - cardWidth,
      'خریدار',
      [
        { label: 'نام:', value: buyerName },
        { label: 'تلفن:', value: buyerPhone || 'ثبت نشده' },
        { label: 'نشانی:', value: buyerAddress || 'ثبت نشده' },
      ],
      C.neon,
    );
    drawParty(
      LEFT,
      'فروشنده',
      [
        { label: 'نام:', value: settings.shopName },
        { label: 'تلفن:', value: sellerPhone || 'ثبت نشده' },
        { label: 'نشانی:', value: sellerAddress || 'ثبت نشده' },
      ],
      C.navySoft,
    );

    y += partyHeight + MM * 5;

    // ——— نوار مشخصات سند ———
    const metaCells: { label: string; value: string; accent?: string; tint?: string }[] = [
      { label: 'شماره فاکتور', value: faNumber(invoice.number, 0) },
      { label: 'تاریخ صدور', value: formatJalaliNumeric(issueDate) },
      { label: 'روش پرداخت', value: paymentLabel },
      { label: 'وضعیت سند', value: statusLabel, tint: statusTone.bg, accent: statusTone.fg },
      { label: 'سررسید', value: formatJalaliNumeric(invoiceDueDate(invoice)) },
    ];
    const cellGap = MM * 2.4;
    const cellW = (CONTENT_W - cellGap * (metaCells.length - 1)) / metaCells.length;
    const cellH = MM * 13;
    metaCells.forEach((cell, index) => {
      const cellRight = RIGHT - index * (cellW + cellGap);
      canvas.rect(cellRight - cellW, y, cellW, cellH, {
        fill: cell.tint ?? C.surface,
        radius: MM * 1.4,
      });
      canvas.text(cell.label, cellRight - MM * 2.6, y + MM * 4.4, {
        size: 6.5,
        color: C.inkSoft,
        maxWidth: cellW - MM * 5.2,
      });
      canvas.text(cell.value, cellRight - MM * 2.6, y + MM * 9.6, {
        size: 8.2,
        weight: 'bold',
        color: cell.accent ?? C.navy,
        maxWidth: cellW - MM * 5.2,
      });
    });
    y += cellH + MM * 6;

    // ——— هشدار وضعیت غیرقطعی ———
    if (isVoided || isDraft) {
      const bannerH = MM * 11;
      canvas.rect(LEFT, y, CONTENT_W, bannerH, {
        fill: C.dangerSurface,
        stroke: C.dangerLine,
        strokeWidth: 0.7,
        radius: MM * 1.4,
      });
      canvas.circle(LEFT + MM * 6, y + bannerH / 2, MM * 1.7, { fill: C.danger });
      canvas.text('!', LEFT + MM * 6, baseline(y, bannerH, 8) + 0.4, {
        size: 8,
        weight: 'bold',
        color: C.white,
        align: 'center',
      });
      const reason = invoice.voidReason ? ` — دلیل: ${invoice.voidReason}` : '';
      canvas.text(
        isDraft
          ? 'پیش‌نویس است و سند فروش قطعی محسوب نمی‌شود.'
          : `این سند باطل شده است و از محاسبات فروش حذف می‌شود${reason}`,
        RIGHT - MM * 3,
        baseline(y, bannerH, 8),
        {
          size: 8,
          weight: 'medium',
          color: C.danger,
          maxWidth: CONTENT_W - MM * 14,
        },
      );
      y += bannerH + MM * 5;
    }
  };

  // ════════════════════════ جدول اقلام ════════════════════════
  // ترتیب ستون‌ها از راست به چپ؛ ستون‌های عددی راست‌چین تا ارقام هم‌تراز شوند
  const columns = [
    { key: 'row', label: 'ردیف', width: MM * 12, align: 'center' as const },
    { key: 'name', label: 'شرح کالا / خدمات', width: MM * 62, align: 'right' as const },
    { key: 'qty', label: 'تعداد', width: MM * 17, align: 'center' as const },
    { key: 'unitPrice', label: 'قیمت واحد', width: MM * 32, align: 'right' as const },
    { key: 'discount', label: 'تخفیف', width: MM * 20, align: 'right' as const },
    { key: 'total', label: 'مبلغ کل', width: MM * 39, align: 'right' as const },
  ];
  const fixedWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const widthOf = (key: string) =>
    columns.find((column) => column.key === key)!.width +
    (key === 'name' ? CONTENT_W - fixedWidth : 0);

  const headH = MM * 9.5;
  const drawTableHead = () => {
    canvas.rect(LEFT, y, CONTENT_W, headH, { fill: C.navy, radius: MM * 1.2 });
    // پایه‌ی صاف برای چسبیدن به بدنه‌ی جدول
    canvas.rect(LEFT, y + headH - MM * 1.2, CONTENT_W, MM * 1.2, { fill: C.navy });
    let cursorRight = RIGHT;
    for (const column of columns) {
      const width = widthOf(column.key);
      const textX = column.align === 'center' ? cursorRight - width / 2 : cursorRight - MM * 3;
      canvas.text(column.label, textX, baseline(y, headH, 7.6), {
        size: 7.6,
        weight: 'bold',
        color: C.white,
        align: column.align,
        maxWidth: width - MM * 5,
      });
      cursorRight -= width;
    }
    y += headH;
  };

  /** شروع صفحه‌ی جدید در صورت نبود جا؛ جدول با سرستون ادامه می‌یابد */
  const ensureSpace = async (needed: number) => {
    if (y + needed <= BODY_BOTTOM) return false;
    await drawHeader(false);
    drawTableHead();
    return true;
  };

  await drawHeader(true);
  drawTableHead();

  // اگر اقلام کم باشند ردیف‌ها بلندتر رسم می‌شوند تا جدول تُنُک به نظر نرسد
  const compactRows = items.length <= 3;
  const rowPadY = compactRows ? MM * 4.4 : MM * 3;
  const nameSize = 8.2;
  const nameLineH = MM * 4.4;
  let alternate = false;

  if (!items.length) {
    canvas.rect(LEFT, y, CONTENT_W, MM * 18, { fill: C.surfaceAlt });
    canvas.text('هیچ قلمی برای این فاکتور ثبت نشده است.', PAGE_W / 2, y + MM * 10.5, {
      size: 8.2,
      color: C.navyMuted,
      align: 'center',
    });
    y += MM * 18;
  }

  for (const [index, item] of items.entries()) {
    const nameWidth = widthOf('name') - MM * 6;
    const nameLines = canvas.wrap(item.name || '—', nameWidth, nameSize, 'medium');
    const rowH = Math.max(
      compactRows ? MM * 17 : MM * 11,
      rowPadY * 2 + nameLines.length * nameLineH,
    );
    await ensureSpace(rowH);

    if (alternate) canvas.rect(LEFT, y, CONTENT_W, rowH, { fill: C.surfaceAlt });
    alternate = !alternate;

    const firstLineY = y + rowPadY + nameSize * 0.92;
    const middleY = baseline(y, rowH, 8.2);
    let cursorRight = RIGHT;

    // سهم این قلم از تخفیف کل فاکتور (برای نمایش در ستون تخفیف)
    const share = (item.discountAmount ?? 0) + globalDiscountShares[index];
    const netTotal = item.total - share;

    for (const column of columns) {
      const width = widthOf(column.key);
      if (column.key === 'row') {
        canvas.text(faNumber(index + 1, 0), cursorRight - width / 2, middleY, {
          size: 7.4,
          color: C.navyMuted,
          align: 'center',
        });
      } else if (column.key === 'name') {
        nameLines.forEach((line, lineIndex) => {
          canvas.text(line, cursorRight - MM * 3, firstLineY + lineIndex * nameLineH, {
            size: nameSize,
            weight: 'medium',
            color: C.ink,
          });
        });
      } else if (column.key === 'qty') {
        canvas.text(faNumber(item.qty, 6), cursorRight - width / 2, middleY, {
          size: 8,
          color: C.ink,
          align: 'center',
        });
      } else if (column.key === 'unitPrice') {
        canvas.text(amountOnly(item.unitPrice), cursorRight - MM * 3, middleY, {
          size: 8,
          color: C.ink,
          align: 'right',
        });
      } else if (column.key === 'discount') {
        canvas.text(
          share > 0 ? amountOnly(Math.round(share)) : '—',
          cursorRight - MM * 3,
          middleY,
          {
            size: 7.8,
            color: share > 0 ? C.danger : C.navyMuted,
            align: 'right',
          },
        );
      } else {
        canvas.text(amountOnly(netTotal), cursorRight - MM * 3, middleY, {
          size: 8.4,
          weight: 'bold',
          color: C.navy,
          align: 'right',
        });
      }
      cursorRight -= width;
    }

    y += rowH;
    // خط جداکننده‌ی ردیف — کمرنگ تا جدول شلوغ نشود
    canvas.line(LEFT, y, RIGHT, y, { color: C.lineSoft, width: 0.6 });
  }

  // راهنمای واحد پول پایین جدول
  if (items.length) {
    canvas.text(
      `مبالغ به ${unitLabel} است. تخفیف شامل ردیف و سهم کل؛ مبلغ کل پس از تخفیف و پیش از مالیات.`,
      LEFT,
      y + MM * 4,
      { size: 6.6, color: C.navyMuted, align: 'left' },
    );
    y += MM * 6;
  }

  // ════════════════════════ جمع‌بندی ════════════════════════
  const extraNotes: { title: string; body: string; size: number }[] = [];
  if (invoice.note) extraNotes.push({ title: 'یادداشت', body: invoice.note, size: 7.4 });
  const terms = invoice.terms || settings.invoiceFooterNote;
  if (terms) extraNotes.push({ title: 'شرایط پرداخت', body: terms, size: 7.2 });

  const totalsRows: { label: string; value: string; tone?: 'danger' | 'success' }[] = [
    {
      label: items.some((item) => (item.discountAmount ?? 0) > 0)
        ? 'جمع پس از تخفیف ردیف'
        : 'جمع اقلام',
      value: money(invoice.subtotal),
    },
  ];
  if (invoice.discountAmount > 0) {
    const discountLabel =
      invoice.discountType === 'percent'
        ? `تخفیف (${faNumber(invoice.discountValue, 2)}٪)`
        : 'تخفیف';
    totalsRows.push({
      label: discountLabel,
      value: `− ${money(invoice.discountAmount)}`,
      tone: 'danger',
    });
  }
  if (invoice.taxAmount > 0) {
    totalsRows.push({
      label: `مالیات بر ارزش افزوده (${faNumber(invoice.taxPercent, 2)}٪)`,
      value: money(invoice.taxAmount),
    });
  }
  if ((invoice.shippingAmount ?? 0) > 0)
    totalsRows.push({ label: 'هزینه حمل', value: money(invoice.shippingAmount!) });
  if ((invoice.otherAmount ?? 0) > 0)
    totalsRows.push({ label: 'سایر هزینه‌ها', value: money(invoice.otherAmount!) });
  if (invoice.paymentMethod === 'cash' && invoice.cashTendered !== undefined) {
    totalsRows.push({ label: 'وجه نقد دریافتی', value: money(invoice.cashTendered) });
    totalsRows.push({ label: 'باقی پول مشتری', value: money(invoice.changeAmount ?? 0) });
  }
  if (!isVoided && !isDraft && payState.paid > 0)
    totalsRows.push({ label: 'پرداخت خالص', value: money(payState.paid), tone: 'success' });
  if (payState.refunded > 0)
    totalsRows.push({ label: 'وجه برگشت‌خورده', value: money(payState.refunded), tone: 'danger' });

  const finalLabel = isDraft
    ? 'مبلغ پیش‌نویس'
    : isVoided
      ? 'مبلغ سند باطل‌شده'
      : invoice.isCredit
        ? payState.remaining > 0
          ? 'مانده قابل پرداخت'
          : 'تسویه‌شده'
        : 'مبلغ سند';

  // ——— بلوک جمع‌بندی (هم‌عرض جدول) ———
  // ارتفاع بلوک یادداشت‌ها (عنوان + متن چندخطی)
  const extraNotesBlockHeight = extraNotes.reduce((total, note) => {
    const lines = canvas.wrap(note.body, MM * 96, note.size).length;
    return total + MM * 2.4 + MM * 4.2 + lines * MM * 4;
  }, 0);

  const wordsWidth = MM * 104;
  const totalsWidth = CONTENT_W - wordsWidth - MM * 5;
  const rowsH = totalsRows.length * MM * 7 + MM * 3;
  const finalH = MM * 15;
  const totalsBoxBaseH = rowsH + finalH;
  // ارتفاع بلوک حروف از حجم متن محاسبه می‌شود تا کادر بی‌جهت بزرگ نشود
  const wordsSample = `${amountInWords(invoice.total)} ${WORD_JOINER}${unitLabel}`;
  const wordsLines = canvas.wrap(wordsSample, wordsWidth - MM * 8, 8.6, 'medium').length;
  const wordsBaseH = MM * 6.5 + MM * 4.6 + wordsLines * MM * 4.6 + extraNotesBlockHeight + MM * 8;
  const baseSummaryH = Math.max(totalsBoxBaseH, wordsBaseH);

  // چیدمان: جدول ← جمع‌بندی ← مهر و امضا.
  const signatureH = MM * 26;
  const baseFlow = baseSummaryH + MM * 8 + signatureH;
  const flowBreak = await ensureSpace(baseFlow);
  const summaryTop = y;

  // ——— توزیع فضای مانده ———
  // کارت جمع‌بندی کمی کشیده می‌شود و کادرهای امضا بزرگ‌تر می‌شوند، اما ناحیه‌ی امضا
  // به انتهای صفحه (بالای پابرگ) لنگر می‌خورد تا سند تُنُک و آویزان دیده نشود.
  const spare = flowBreak ? MM * 4 : Math.max(0, BODY_BOTTOM - (summaryTop + baseFlow));
  const summaryStretch = Math.min(spare * 0.14, MM * 10);
  const signatureStretch = Math.min(spare * 0.24, MM * 22);
  const summaryH = baseSummaryH + summaryStretch;
  const signatureHFinal = signatureH + signatureStretch;
  // یک باند سفید یکدست بین جمع‌بندی و ناحیه‌ی امضا، به‌جای دو فضای خالی پراکنده
  const sigY = Math.max(summaryTop + summaryH + MM * 9, BODY_BOTTOM - signatureHFinal);

  // راست: مبلغ به حروف + یادداشت + شرایط فروش
  const wordsRight = RIGHT;
  const wordsLeft = wordsRight - wordsWidth;
  canvas.rect(wordsLeft, summaryTop, wordsWidth, summaryH, {
    fill: C.surface,
    radius: MM * 2,
  });
  // متن از بالای کارت شروع می‌شود؛ کشیدگی کارت صرف تنفس بصری می‌شود
  const wordsBlockH = MM * 4.6 + wordsLines * MM * 4.6 + extraNotesBlockHeight;
  void wordsBlockH;
  let noteY = summaryTop + MM * 7.5;
  canvas.text('مبلغ به حروف', wordsRight - MM * 4, noteY, { size: 6.9, color: C.navyMuted });
  noteY += MM * 4.6;
  noteY += canvas.paragraph(
    `${amountInWords(invoice.total)} ${WORD_JOINER}${unitLabel}`,
    wordsRight - MM * 4,
    noteY,
    {
      size: 8.6,
      weight: 'medium',
      color: C.navy,
      maxWidth: wordsWidth - MM * 8,
      lineHeight: MM * 4.6,
    },
  );

  for (const note of extraNotes) {
    noteY += MM * 2.4;
    canvas.text(note.title, wordsRight - MM * 4, noteY, { size: 6.9, color: C.navyMuted });
    noteY += MM * 4.2;
    noteY += canvas.paragraph(note.body, wordsRight - MM * 4, noteY, {
      size: note.size,
      color: C.inkSoft,
      maxWidth: wordsWidth - MM * 8,
      lineHeight: MM * 4,
    });
  }

  // چپ: جدول مبالغ + نوار مبلغ نهایی
  const totalsLeft = LEFT;
  // بلوک مبالغ تا انتهای ردیف جمع‌بندی ادامه می‌یابد تا کارت‌ها هم‌تراز بمانند
  const rowsHeightActual = Math.max(rowsH, summaryH - finalH);
  canvas.rect(totalsLeft, summaryTop, totalsWidth, rowsHeightActual, {
    fill: C.white,
    stroke: C.line,
    strokeWidth: 0.7,
    radius: MM * 1.6,
  });
  canvas.rect(totalsLeft, summaryTop + rowsHeightActual - MM * 1.6, totalsWidth, MM * 1.6, {
    fill: C.white,
  });
  const rowStep = Math.min((rowsHeightActual - MM * 3) / totalsRows.length, MM * 11);
  totalsRows.forEach((row, index) => {
    const rowY = summaryTop + MM * 5.2 + index * rowStep;
    canvas.text(row.label, totalsLeft + totalsWidth - MM * 4, rowY, {
      size: 7.8,
      color: C.inkSoft,
      maxWidth: totalsWidth * 0.52,
    });
    canvas.text(row.value, totalsLeft + MM * 4, rowY, {
      size: 8.2,
      weight: 'medium',
      color: row.tone === 'danger' ? C.danger : row.tone === 'success' ? C.neon : C.ink,
      align: 'left',
    });
    if (index < totalsRows.length - 1) {
      canvas.dashedLine(
        totalsLeft + MM * 3,
        totalsLeft + totalsWidth - MM * 3,
        rowY + rowStep / 2,
        C.lineSoft,
        0.5,
        [1.6, 1.8],
      );
    }
  });

  const finalTop = summaryTop + rowsHeightActual;
  canvas.rect(totalsLeft, finalTop, totalsWidth, finalH, { fill: C.navy, radius: MM * 1.6 });
  canvas.rect(totalsLeft, finalTop, totalsWidth, MM * 3, { fill: C.navy, radius: MM * 1.6 });
  const finalLabelSize = canvas.fitSize(finalLabel, totalsWidth * 0.42, 8.6, 'bold', 6.8);
  canvas.text(
    finalLabel,
    totalsLeft + totalsWidth - MM * 5,
    baseline(finalTop, finalH, finalLabelSize),
    {
      size: finalLabelSize,
      weight: 'bold',
      color: C.white,
      maxWidth: totalsWidth * 0.42,
    },
  );
  const finalValue = isVoided || isDraft || !invoice.isCredit ? invoice.total : payState.remaining;
  const totalText = money(finalValue);
  const totalSize = canvas.fitSize(totalText, totalsWidth * 0.55, 11, 'bold', 7.5);
  canvas.text(totalText, totalsLeft + MM * 5, baseline(finalTop, finalH, totalSize), {
    size: totalSize,
    weight: 'bold',
    color: C.neon,
    align: 'left',
  });

  y = sigY;

  // ════════════════════════ مهر و امضا ════════════════════════
  if (y + signatureHFinal > BODY_BOTTOM) {
    await drawHeader(false);
    y = BODY_BOTTOM - signatureHFinal;
  }
  const sigGap = MM * 6;
  const sigW = (CONTENT_W - sigGap) / 2;
  // خط مویی جداکننده‌ی ناحیه‌ی امضا
  canvas.line(LEFT, y - MM * 7, RIGHT, y - MM * 7, { color: C.line, width: 0.6 });
  const signatures = [
    { label: 'مهر و امضای فروشنده', hint: settings.shopName },
    { label: 'امضای خریدار', hint: 'مهر یا امضای خریدار' },
  ];
  signatures.forEach((signature, index) => {
    const boxRight = RIGHT - (sigW + sigGap) * index;
    canvas.rect(boxRight - sigW, y, sigW, signatureHFinal, {
      fill: C.white,
      stroke: C.line,
      strokeWidth: 0.7,
      radius: MM * 1.8,
      dash: [3.2, 2.6],
    });
    canvas.text(signature.label, boxRight - MM * 4, y + MM * 6, {
      size: 7.6,
      weight: 'medium',
      color: C.navySoft,
    });
    canvas.text(signature.hint, boxRight - MM * 4, y + signatureHFinal - MM * 5, {
      size: 6.6,
      color: C.navyMuted,
      maxWidth: sigW - MM * 8,
    });
  });

  // ════════════════════════ پابرگ ════════════════════════
  const tracking = invoice.checkoutKey?.slice(-10) ?? `INV-${invoice.number}`;
  canvas.onEachPage((pageNumber, total) => {
    // واترمارک ابطال: لایه‌ی بسیار کم‌رنگ روی کل صفحه (جلوگیری از جعل سند)
    if (isVoided || isDraft) {
      canvas.text(isVoided ? 'باطل' : 'پیش‌نویس', PAGE_W / 2, PAGE_H / 2, {
        size: 118,
        weight: 'bold',
        color: isVoided ? C.danger : C.amber,
        opacity: 0.1,
        align: 'center',
        rotate: 24,
      });
    }
    const footerY = PAGE_H - MM * 10;
    canvas.rect(0, PAGE_H - MM * 4.2, PAGE_W, MM * 4.2, { fill: C.navy });
    canvas.line(LEFT, footerY - MM * 6, RIGHT, footerY - MM * 6, { color: C.line, width: 0.6 });

    const footerBrand = `${settings.shopName} · حساب‌یار کارن سافت`;
    canvas.text(footerBrand, RIGHT, footerY, {
      size: canvas.fitSize(footerBrand, MM * 56, 6.6, 'regular', 5.4),
      color: C.navyMuted,
      maxWidth: MM * 56,
    });
    canvas.text(`صفحه ${faNumber(pageNumber, 0)} از ${faNumber(total, 0)}`, PAGE_W / 2, footerY, {
      size: 6.6,
      color: C.inkSoft,
      align: 'center',
    });
    canvas.text(`کد پیگیری: ${tracking}`, LEFT, footerY, {
      size: 6.6,
      color: C.navyMuted,
      align: 'left',
      maxWidth: MM * 40,
    });
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
