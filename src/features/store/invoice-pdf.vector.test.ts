/**
 * Real-output PDF tests: build an actual invoice PDF with the vector engine
 * (fonts served from public/fonts, exactly like the browser does) and verify
 * the produced bytes:
 *  - fonts are really EMBEDDED (FontFile2 present per weight)
 *  - page geometry is A4 portrait
 *  - Persian text is drawn as shaped Presentation-Forms glyphs (not reversed, not .notdef)
 *  - /ActualText keeps the LOGICAL Persian text so copy/search works
 *  - multi-page invoices paginate and every page carries text
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import type { Customer, Invoice, InvoiceItem } from '@/core/db/db';
import { formatJalaliNumeric } from '@/core/jalali/jalali';
import { loadTrueTypeFont } from '@/core/pdf/font';
import { buildInvoicePdf, type InvoiceDocumentSettings } from './invoice-pdf';

/** jsdom Blob has no .arrayBuffer(); read it via FileReader */
function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** serve TTF fonts from public/fonts, everything else 404 (logo is optional) */
function stubFetch() {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = url.match(/fonts\/(Vazirmatn-\w+)\.ttf$/);
    if (match) {
      const buf = readFileSync(`public/fonts/${match[1]}.ttf`);
      return new Response(new Uint8Array(buf), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
}

afterEach(() => vi.unstubAllGlobals());

/** decompress all FlateDecode streams and return their text (latin1) */
function decompressedStreams(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes).toString('latin1');
  const out: string[] = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    try {
      out.push(inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'));
    } catch {
      out.push(m[1]);
    }
  }
  return out;
}

function decodeActualTexts(streams: string[]): string {
  const re = /\/ActualText\s*<([0-9A-Fa-f]+)>/g;
  let all = '';
  for (const s of streams) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const hexStr = m[1];
      const buf = Buffer.from(hexStr, 'hex');
      let text = buf.toString('utf16le');
      // PDF text strings are UTF-16BE; Buffer utf16le needs byte swap
      const be = Buffer.alloc(buf.length);
      for (let i = 0; i + 1 < buf.length; i += 2) {
        be[i] = buf[i + 1];
        be[i + 1] = buf[i];
      }
      text = be.toString('utf16le');
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      all += text + '\n';
    }
  }
  return all;
}

function drawnGlyphIds(streams: string[]): number[] {
  const re = /<([0-9A-Fa-f]{4})>\s*Tj/g;
  const ids: number[] = [];
  for (const s of streams) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) ids.push(parseInt(m[1], 16));
  }
  return ids;
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

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    number: 1254,
    date: '2026-11-04T12:00:00.000Z', // 1405/08/13 jalali
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
      'مدیریت قراردادها، حساب‌های دریافتنی و پرداختنی — Kalay purchased (Product) با تخفیف ۱۰٪',
    checkoutKey: 'INV-1024-AB-XYZ',
    createdAt: '2026-11-04T12:00:00.000Z',
    ...overrides,
  };
}

function makeItems(count: number): InvoiceItem[] {
  const names = [
    'کالای خریداری‌شده (Product) با تخفیف ۱۰٪',
    'می‌روم، کتاب‌ها، حسابداری، نرم‌افزار و نیم‌فاصله',
    'مدیریت قراردادها، حساب‌های دریافتنی و پرداختنی',
    'KarenSoft | Hesabyar | info@example.com — Ukiyo-e sample',
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

describe('invoice vector PDF — real output verification', () => {
  it('jalali fixture date really renders as ۱۴۰۵/۰۸/۱۳', () => {
    expect(formatJalaliNumeric(new Date('2026-11-04T12:00:00.000Z'))).toBe('۱۴۰۵/۰۸/۱۳');
  });

  it('embeds fonts (FontFile2), uses A4, draws shaped glyphs, keeps searchable ActualText', async () => {
    stubFetch();
    const blob = await buildInvoicePdf({
      invoice: makeInvoice(),
      items: makeItems(4),
      customer,
      settings,
      payments: [],
    });
    const bytes = await blobBytes(blob);
    expect(bytes.length).toBeGreaterThan(50_000);

    // 1) geometry + pages via pdf-lib
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595); // A4 width in pt
    expect(Math.round(height)).toBe(842); // A4 height in pt

    // 2) fonts embedded: raw PDF carries a FontFile2 stream per weight,
    //    and each Type0 font's descendant CIDFont has FontFile2 in its descriptor
    const rawLatin = Buffer.from(bytes).toString('latin1');
    expect((rawLatin.match(/\/FontFile2/g) ?? []).length).toBeGreaterThanOrEqual(3);
    const resources = doc.getPage(0).node.Resources();
    const fontDict = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
    expect(fontDict).toBeTruthy();
    let embedded = 0;
    for (const [, value] of fontDict!.entries()) {
      const font = doc.context.lookup(value) as PDFDict;
      const candidates: (PDFDict | undefined)[] = [
        font.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict),
        ...(() => {
          const desc = font.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
          return desc ? [doc.context.lookup(desc.get(0)) as PDFDict] : [];
        })(),
      ];
      for (const holder of candidates) {
        const descriptor = holder?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
        if (descriptor?.has(PDFName.of('FontFile2'))) embedded++;
      }
    }
    expect(embedded).toBeGreaterThanOrEqual(3); // Regular + Medium + Bold

    // 3) decompress streams: ActualText + drawn glyphs
    const streams = decompressedStreams(bytes);
    const actualText = decodeActualTexts(streams);
    // logical (searchable/copyable) Persian text must be present:
    for (const needle of [
      'حسابیار؛ مدیریت هوشمند امور مالی و حسابداری',
      '۱۴۰۵/۰۸/۱۳',
      '۶۷۷٬۸۳۵٬۲۰۰',
      'info@example.com',
      '09152521166',
      'INV-1024-AB',
      '۱٬۲۵۴',
      '(Product)',
      'نیم‌فاصله',
    ]) {
      expect(actualText).toContain(needle);
    }

    // 4) drawn glyphs: no .notdef (0), and Persian drawn as presentation forms
    const glyphIds = drawnGlyphIds(streams);
    expect(glyphIds.length).toBeGreaterThan(100);
    expect(glyphIds).not.toContain(0);
    const font = loadTrueTypeFont(
      (() => {
        const b = readFileSync('public/fonts/Vazirmatn-Regular.ttf');
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      })(),
    );
    const presentation = glyphIds.filter((gid) => {
      const cp = font.codePointForGlyph(gid);
      return cp !== undefined && cp >= 0xfb50 && cp <= 0xfeff;
    });
    expect(presentation.length).toBeGreaterThan(50);
  }, 30_000);

  it('multi-page invoice: paginates and every page has drawn text + fonts', async () => {
    stubFetch();
    const blob = await buildInvoicePdf({
      invoice: makeInvoice(),
      items: makeItems(80),
      customer,
      settings,
      payments: [],
    });
    const bytes = await blobBytes(blob);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);

    const streams = decompressedStreams(bytes);
    const glyphIds = drawnGlyphIds(streams);
    expect(glyphIds.length).toBeGreaterThan(500);
    // footer page numbers on every page: count distinct "صفحه" occurrences in ActualText
    const actualText = decodeActualTexts(streams);
    const pageMentions = (actualText.match(/صفحه/g) ?? []).length;
    expect(pageMentions).toBeGreaterThanOrEqual(doc.getPageCount());
  }, 60_000);
});
