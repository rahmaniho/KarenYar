/**
 * Real-output PDF tests: build an actual invoice PDF with the vector engine
 * (fonts bundled via ?url from src/assets/fonts, exactly like the browser bundle) and verify
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
import { shapePersian } from '@/core/pdf/persian';
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

/** serve TTF fonts from src/assets/fonts (fallback path), everything else 404 (logo is optional) */
function stubFetch() {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = url.match(/(Vazirmatn-\w+)\.ttf(\?.*)?$/);
    if (match) {
      const buf = readFileSync(`src/assets/fonts/${match[1]}.ttf`);
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
  shopName: 'کارو — KarenSoft',
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
    customerName: 'کارو؛ مدیریت هوشمند امور مالی و حسابداری',
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
    'KarenSoft | Karo | info@example.com — Ukiyo-e sample',
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
  name: 'کارو؛ مدیریت هوشمند امور مالی و حسابداری',
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
      'کارو؛ مدیریت هوشمند امور مالی و حسابداری',
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
        const b = readFileSync('src/assets/fonts/Vazirmatn-Regular.ttf');
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      })(),
    );
    const presentation = glyphIds.filter((gid) => {
      const cp = font.codePointForGlyph(gid);
      return cp !== undefined && cp >= 0xfb50 && cp <= 0xfeff;
    });
    expect(presentation.length).toBeGreaterThan(50);
  }, 30_000);

  it('extracts LOGICAL Persian text (ToUnicode + stream order) — copy/search works in every viewer', async () => {
    stubFetch();
    const blob = await buildInvoicePdf({
      invoice: makeInvoice(),
      items: makeItems(4),
      customer,
      settings,
      payments: [],
    });
    const bytes = await blobBytes(blob);
    const streams = decompressedStreams(bytes);

    // 1) merged ToUnicode map (gid -> utf16be hex) from all embedded fonts' CMaps.
    //    Vazirmatn weights share glyph order, so one map is enough here.
    const toUnicode = new Map<number, string>();
    for (const s of streams) {
      if (!s.includes('beginbfchar')) continue;
      const re = /<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) toUnicode.set(parseInt(m[1], 16), m[2]);
    }
    expect(toUnicode.size).toBeGreaterThan(500);

    // presentation-form glyphs must map to BASE letters, not FBxx/FExx codes
    const font = loadTrueTypeFont(
      (() => {
        const b = readFileSync('src/assets/fonts/Vazirmatn-Regular.ttf');
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      })(),
    );
    // only glyphs actually DRAWN must map to base letters (the font cmap also has
    // presentation forms for letters our shaper never emits — those are unused)
    const drawn = new Set(drawnGlyphIds(streams));
    let presentationChecked = 0;
    for (const [gid, hexDst] of toUnicode) {
      if (!drawn.has(gid)) continue;
      const cp = font.codePointForGlyph(gid);
      if (cp !== undefined && cp >= 0xfb50 && cp <= 0xfeff) {
        const dstCp = parseInt(hexDst.slice(0, 4), 16);
        expect(dstCp).toBeLessThan(0xfb50); // base letter, not presentation form
        presentationChecked++;
      }
    }
    expect(presentationChecked).toBeGreaterThan(50);

    // 2) simulate a ToUnicode-based extractor: Tj glyphs in STREAM ORDER mapped via ToUnicode
    const contentStreams = streams.filter((s) => s.includes(' Tj'));
    const reTj = /<([0-9A-Fa-f]{4})>\s*Tj/g;
    let extracted = '';
    for (const s of contentStreams) {
      let m: RegExpExecArray | null;
      while ((m = reTj.exec(s))) {
        const gid = parseInt(m[1], 16);
        const hexDst = toUnicode.get(gid);
        if (!hexDst) continue;
        const buf = Buffer.from(hexDst, 'hex');
        const be = Buffer.alloc(buf.length);
        for (let i = 0; i + 1 < buf.length; i += 2) {
          be[i] = buf[i + 1];
          be[i + 1] = buf[i];
        }
        extracted += be.toString('utf16le');
      }
    }
    // no presentation-form codepoints may survive extraction
    for (const ch of extracted) {
      const cp = ch.codePointAt(0) ?? 0;
      expect(cp < 0xfb50 || cp > 0xfeff).toBe(true);
    }
    // logical order + base letters: Persian phrases appear exactly as typed
    expect(extracted).toContain('فاکتور');
    expect(extracted).toContain('کارو؛ مدیریت هوشمند امور مالی و حسابداری');
    expect(extracted).toContain('۱۴۰۵/۰۸/۱۳');
    expect(extracted).toContain('09152521166');
    expect(extracted).toContain('INV-1024-AB');
    // order sanity: the phrase must appear contiguously in LOGICAL order
    expect(extracted).toContain('فاکتور فروش');
  }, 30_000);

  it('REPEATED generation (5 rounds, varied invoices): extraction stays logical every time', async () => {
    stubFetch();
    // extractor: Tj glyphs in stream order mapped through the embedded ToUnicode CMap
    const extractViaToUnicode = (bytes: Uint8Array): string => {
      const streams = decompressedStreams(bytes);
      const toUnicode = new Map<number, string>();
      for (const s of streams) {
        if (!s.includes('beginbfchar')) continue;
        for (const m of s.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4,})>/g)) {
          toUnicode.set(parseInt(m[1], 16), m[2]);
        }
      }
      let out = '';
      for (const s of streams.filter((x) => x.includes(' Tj'))) {
        for (const m of s.matchAll(/<([0-9A-Fa-f]{4})>\s*Tj/g)) {
          const dst = toUnicode.get(parseInt(m[1], 16));
          if (!dst) continue;
          const buf = Buffer.from(dst, 'hex');
          const be = Buffer.alloc(buf.length);
          for (let i = 0; i + 1 < buf.length; i += 2) {
            be[i] = buf[i + 1];
            be[i + 1] = buf[i];
          }
          out += be.toString('utf16le');
        }
      }
      return out;
    };

    const names = [
      'روغن',
      'مداد رنگی',
      'دفتر آشپزی',
      'سیگار',
      'بستنی قیفی',
      'شیرینی',
      'حبه انگوری',
      'کتاب فارسی',
    ];
    const prices = [615181818, 120000, 280000, 150000, 200000, 12000, 120000, 150000];
    for (let round = 1; round <= 5; round++) {
      const count = 3 + round; // 4..8 items
      const items = names.slice(0, count).map((name, i) => ({
        id: i + 1,
        invoiceId: 1,
        productId: null,
        name,
        qty: 1,
        unitPrice: prices[i],
        unit: 'عدد',
        discountAmount: 0,
        unitCost: 0,
        total: prices[i],
      }));
      const blob = await buildInvoicePdf({
        invoice: makeInvoice({
          customerName: 'مشتری گذری',
          checkoutKey: 'ebffa35573',
          paymentMethod: 'card',
          status: 'completed',
        }),
        items,
        customer,
        settings: { ...settings, shopName: 'فروشگاه من' },
        payments: [],
      });
      const bytes = await blobBytes(blob);
      const extracted = extractViaToUnicode(bytes);
      // no presentation-form codepoints may survive extraction
      for (const ch of extracted) {
        const cp = ch.codePointAt(0) ?? 0;
        expect(cp < 0xfb50 || cp > 0xfeff).toBe(true);
      }
      expect(extracted).toContain('فروشگاه من');
      expect(extracted).toContain('مشتری گذری');
      expect(extracted).toContain('شماره فاکتور');
      expect(extracted).toContain('۱۴۰۵/۰۸/۱۳');
      expect(extracted).toContain('ebffa35573');
      expect(extracted).toContain('۶۱۵٬۱۸۱٬۸۱۸');
    }
  }, 60_000);

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

  it('REGRESSION: right-joining-only letters (ا د و ر ذ) draw as correct forms, not wrongly joined', async () => {
    stubFetch();
    // user report: in the downloaded PDF, words around these letters looked jumbled
    const nasty = 'دارو adar water';
    const blob = await buildInvoicePdf({
      invoice: makeInvoice({ customerName: 'مشتری گذری' }),
      items: [
        {
          id: 1,
          invoiceId: 1,
          productId: null,
          name: nasty,
          qty: 1,
          unitPrice: 1000,
          unit: 'عدد',
          discountAmount: 0,
          unitCost: 0,
          total: 1000,
        },
      ],
      customer,
      settings,
      payments: [],
    });
    const bytes = await blobBytes(blob);
    const streams = decompressedStreams(bytes);
    const content = streams.filter((s) => s.includes(' Tj')).join('\n');

    // expected drawn glyph ids = font gids of the shaper output, in logical order
    const font = loadTrueTypeFont(
      (() => {
        const b = readFileSync('src/assets/fonts/Vazirmatn-Regular.ttf');
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      })(),
    );
    const shapedCps = [...shapePersian(nasty)].map((c) => c.codePointAt(0) ?? 0);
    const expectedGids = shapedCps.map((cp) => font.glyphId(cp));
    expect(expectedGids).not.toContain(0); // every shaped form exists in the font

    // the item-name cell is one text() call -> one ActualText span wrapping its Tj glyphs
    const atHex =
      'FEFF' +
      [...nasty]
        .map((c) => (c.codePointAt(0) ?? 0).toString(16).padStart(4, '0').toUpperCase())
        .join('');
    const atIdx = content.indexOf(`/ActualText <${atHex}>`);
    expect(atIdx).toBeGreaterThan(-1); // span exists with the logical text
    const emcIdx = content.indexOf('EMC', atIdx);
    const span = content.slice(atIdx, emcIdx);
    const drawnGids: number[] = [];
    for (const m of span.matchAll(/<([0-9A-Fa-f]{4})>\s*Tj/g)) drawnGids.push(parseInt(m[1], 16));

    // the drawn glyphs must be EXACTLY the shaped presentation forms (joined correctly),
    // in logical order — no .notdef, no wrongly-joined forms after ا/د/و/ر/ذ
    expect(drawnGids).not.toContain(0);
    expect(drawnGids).toEqual(expectedGids);

    // and extraction of that span yields the logical Persian+Latin string
    const toUnicode = new Map<number, string>();
    for (const s of streams) {
      if (!s.includes('beginbfchar')) continue;
      for (const m of s.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4,})>/g)) {
        toUnicode.set(parseInt(m[1], 16), m[2]);
      }
    }
    let extractedSpan = '';
    for (const gid of drawnGids) {
      const dst = toUnicode.get(gid);
      if (!dst) continue;
      const buf = Buffer.from(dst, 'hex');
      const be = Buffer.alloc(buf.length);
      for (let i = 0; i + 1 < buf.length; i += 2) {
        be[i] = buf[i + 1];
        be[i + 1] = buf[i];
      }
      extractedSpan += be.toString('utf16le');
    }
    expect(extractedSpan).toBe(nasty);
  }, 30_000);
});
