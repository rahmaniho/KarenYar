/**
 * موتور رسم سندهای چاپی برداری (اندازه‌ی دقیق A4)
 *
 * چرا تصویر (html2canvas) کافی نیست؟ متن فارسی در PDF تصویری قابل انتخاب/جستجو
 * نیست و در چاپ بزرگ‌نمایی پیکسلی می‌شود. این موتور با pdf-lib و فونت واقعی
 * وزیرمتن هر نویسه را به گلیف تبدیل و به‌صورت برداری رسم می‌کند؛ نتیجه:
 *  - متن واقعی در PDF (کپی/جستجو/برجسته‌سازی کار می‌کند)
 *  - لبه‌های تیز در چاپ ۳۰۰dpi و بزرگ‌نمایی
 *  - شکل‌دهی (اتصال حروف) و چینش راست‌به‌چپ کامل
 *
 * نکته‌ی فنی: روتین متن pdf-lib خودش متن را «دوباره شکل‌دهی» و معکوس می‌کند
 * (برای متن فارسی نتیجه معکوس می‌شود)، پس اینجا اپراتورهای خام PDF نوشته
 * می‌شود: هر گلیف با موقعیت دقیق خودش (Tm) رسم می‌شود و Tjها به ترتیب «منطقی»
 * منتشر می‌شوند؛ ToUnicodeِ فونت هم به حروف پایه نگاشت دارد، پس متن استخراج‌شده
 * در همه‌ی خواننده‌ها (کپی/جستجو) به ترتیب و حروف درست است.
 *
 * دستگاه مختصات: مبدأ گوشه‌ی بالا-راست، y رو به پایین (مثل CSS)، واحد pt.
 */
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  PDFPage,
  PDFRawStream,
  asPDFNumber,
  degrees,
  rgb,
} from 'pdf-lib';
import type { Color, PDFFont, PDFNumber } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { bundledFontUrl, type PdfFontFileName } from './font-bundle';
import { bidiReorderCells, presentationToBase, shapePersian } from './persian';
import type { TrueTypeFont } from './font';

/**
 * یکسان‌سازی فاصله‌ها: فونت فقط فاصله‌ی معمولی (U+0020) و NBSP را دارد؛
 * word-joiner و فاصله‌ی نازک به فاصله‌ی معمولی تبدیل می‌شوند تا واژه و عدد به هم نچسبند.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/[\u2060\u2009\u00a0\u2007\u202f]/g, ' ');
}

/** کد UTF-16BE به‌صورت hex (برای مقصد bfchar در CMap) */
function utf16BeHex(cps: number[]): string {
  let out = '';
  for (const cp of cps) {
    if (cp <= 0xffff) out += cp.toString(16).padStart(4, '0');
    else {
      const v = cp - 0x10000;
      out += (0xd800 + (v >> 10)).toString(16).padStart(4, '0');
      out += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    }
  }
  return out.toUpperCase();
}

/**
 * CMapِ ToUnicodeِ «منطقی»: هر گلیف به نویسه‌ی پایه‌ی خودش نگاشت می‌شود؛
 * شکل‌های نمایشی فارسی (FB50–FEFF) به حرف اصلی و legatureهای لا/لآ به دو نویسه.
 * با این CMap متن استخراج‌شده در همه‌ی خواننده‌ها (حتی بدون ActualText) درست است.
 */
function buildLogicalToUnicodeCMap(layout: TrueTypeFont): string {
  const byGid = new Map<number, number[]>();
  for (const [cp, gid] of layout.cmapEntries()) {
    if (gid === 0 || byGid.has(gid)) continue;
    byGid.set(gid, presentationToBase(cp) ?? [cp]);
  }
  const entries = [...byGid.entries()].sort((a, b) => a[0] - b[0]);
  const lines: string[] = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
  ];
  const CHUNK = 100;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    lines.push(`${slice.length} beginbfchar`);
    for (const [gid, cps] of slice) {
      lines.push(`<${gid.toString(16).padStart(4, '0').toUpperCase()}> <${utf16BeHex(cps)}>`);
    }
    lines.push('endbfchar');
  }
  lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
  return `${lines.join('\n')}\n`;
}

/** جایگزینی ToUnicode فونت embedشده با CMap منطقی (حروف پایه به‌جای شکل‌های نمایشی) */
async function installLogicalToUnicode(
  doc: PDFDocument,
  font: PDFFont,
  layout: TrueTypeFont,
): Promise<void> {
  // dict فونت تا پیش از save در context ساخته نمی‌شود؛ پس ابتدا embed() می‌کنیم
  await font.embed();
  const cmap = buildLogicalToUnicodeCMap(layout);
  const stream = PDFRawStream.of(doc.context.obj({}), new TextEncoder().encode(cmap));
  const fontDict = doc.context.lookup(font.ref, PDFDict);
  fontDict.set(PDFName.of('ToUnicode'), doc.context.register(stream));
}

export const MM = 72 / 25.4;
export const A4 = { width: 210 * MM, height: 297 * MM };

export type FontWeight = 'regular' | 'medium' | 'bold';

export interface TextOptions {
  size?: number;
  weight?: FontWeight;
  color?: Color | string;
  /** x: در right لبه‌ی راست، در center مرکز، در left لبه‌ی چپ */
  align?: 'right' | 'left' | 'center';
  opacity?: number;
  rotate?: number;
  /** فاصله‌ی خطوط در پاراگراف (پیش‌فرض ۱٫۶۵ برابر اندازه) */
  lineHeight?: number;
  maxWidth?: number;
  /** کشیدن خط زیر متن */
  underline?: boolean;
}

export interface StrokeStyle {
  color?: Color | string;
  width?: number;
  dash?: number[];
}

export interface DocumentMeta {
  title: string;
  subject?: string;
  author?: string;
  keywords?: string[];
  landscape?: boolean;
  /** مسیر پایه‌ی assetها (import.meta.env.BASE_URL) */
  baseUrl: string;
}

interface FontEntry {
  pdf: PDFFont;
  /** اندازه‌گیری عرض گلیف بر پایه‌ی واحد فونت */
  glyphIdOf(codePoint: number): number;
  advanceWidth(glyphId: number): number;
  unitsPerEm: number;
}

export function parseColor(value: string | Color): Color {
  if (typeof value !== 'string') return value;
  return PdfCanvas.color(value);
}

export class PdfCanvas {
  private readonly pages: PDFPage[] = [];
  private page: PDFPage | null = null;
  private readonly fonts = new Map<FontWeight, FontEntry>();
  private readonly resourceKeys = new Map<FontWeight, PDFName>();
  /** ماتریس جاری برای چرخش متن (درجه) */
  private context: { x: number; y: number; w: number; h: number };
  private readonly contextStack: { x: number; y: number; w: number; h: number }[] = [];

  private constructor(
    private readonly doc: PDFDocument,
    readonly width: number,
    readonly height: number,
  ) {
    this.context = { x: 0, y: 0, w: width, h: height };
  }

  /** ساخت سند و بارگذاری فونت‌ها (بدون جاسازی تکراری) */
  static async create(meta: DocumentMeta): Promise<PdfCanvas> {
    const base = meta.baseUrl.endsWith('/') ? meta.baseUrl : `${meta.baseUrl}/`;
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    doc.setProducer('حساب‌یار کارن سافت');
    doc.setCreator('حساب‌یار کارن سافت');
    doc.setTitle(meta.title);
    if (meta.subject) doc.setSubject(meta.subject);
    doc.setAuthor(meta.author ?? 'حساب‌یار کارن سافت');
    if (meta.keywords?.length) doc.setKeywords(meta.keywords);

    const canvas = new PdfCanvas(
      doc,
      meta.landscape ? A4.height : A4.width,
      meta.landscape ? A4.width : A4.height,
    );
    const variants: [FontWeight, string][] = [
      ['regular', 'Regular'],
      ['medium', 'Medium'],
      ['bold', 'Bold'],
    ];
    await Promise.all(
      variants.map(async ([weight, fileName]) => {
        // فونت ابتدا از assetِ باندل (?url) خوانده می‌شود؛ فقط در صورت نبود به مسیر قدیمی /fonts/ می‌رویم
        const fontUrl =
          bundledFontUrl(fileName as PdfFontFileName) ?? `${base}fonts/Vazirmatn-${fileName}.ttf`;
        const bytes = new Uint8Array(await fetchFontBinary(fontUrl));
        const { TrueTypeFont } = await import('./font');
        const layout = new TrueTypeFont(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        );
        const pdf = await doc.embedFont(bytes, { subset: false });
        await installLogicalToUnicode(doc, pdf, layout);
        canvas.fonts.set(weight, {
          pdf,
          unitsPerEm: layout.metrics.unitsPerEm,
          glyphIdOf: (codePoint) => layout.glyphId(codePoint),
          advanceWidth: (glyphId) => layout.advanceWidth(glyphId),
        });
      }),
    );
    return canvas;
  }

  /** افزودن صفحه و انتقال مکان‌نما به بالای آن */
  newPage(): void {
    const page = this.doc.addPage([this.width, this.height]);
    this.pages.push(page);
    this.page = page;
    this.resourceKeys.clear();
    for (const [weight, entry] of this.fonts) {
      this.resourceKeys.set(weight, page.node.newFontDictionary(entry.pdf.name, entry.pdf.ref));
    }
  }

  get pageCount(): number {
    return this.pages.length;
  }

  get currentPage(): PDFPage {
    if (!this.page) this.newPage();
    return this.page!;
  }

  private font(weight: FontWeight = 'regular'): FontEntry {
    return this.fonts.get(weight) ?? this.fonts.get('regular')!;
  }

  private key(weight: FontWeight = 'regular'): PDFName {
    return this.resourceKeys.get(weight) ?? this.resourceKeys.get('regular')!;
  }

  private map(x: number, y: number): { x: number; y: number } {
    return { x, y: this.height - y };
  }

  /**
   * ثبت حالت شفافیت در منابع صفحه و برگرداندن نام آن.
   * برای واترمارک و لایه‌های کم‌رنگ لازم است؛ بدون ExtGState، متن با شفافیت کامل
   * روی محتوا می‌نشیند.
   */
  private alphaState(opacity: number): PDFName {
    const page = this.currentPage;
    const name = `GS${Math.round(Math.min(1, Math.max(0, opacity)) * 100)}`;
    const resources = page.node.Resources()!;
    let group = resources.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
    if (!group) {
      group = this.doc.context.obj({}) as PDFDict;
      resources.set(PDFName.of('ExtGState'), group);
    }
    if (!group.has(PDFName.of(name))) {
      group.set(
        PDFName.of(name),
        this.doc.context.obj({ Type: 'ExtGState', ca: opacity, CA: opacity }),
      );
    }
    return PDFName.of(name);
  }

  static mm(value: number): number {
    return value * MM;
  }

  static color(hex: string): Color {
    const clean = hex.replace('#', '');
    const full =
      clean.length === 3
        ? clean
            .split('')
            .map((c) => c + c)
            .join('')
        : clean;
    return rgb(
      parseInt(full.slice(0, 2), 16) / 255,
      parseInt(full.slice(2, 4), 16) / 255,
      parseInt(full.slice(4, 6), 16) / 255,
    );
  }

  // ———— اندازه‌گیری ————
  /** عرض متن فارسی (پس از شکل‌دهی و چینش) به pt */
  measure(value: string, size: number, weight: FontWeight = 'regular'): number {
    const font = this.font(weight);
    const shaped = shapePersian(normalizeSpaces(value));
    const glyphs = [...shaped].map((ch) => font.glyphIdOf(ch.codePointAt(0) ?? 0));
    let width = 0;
    for (const glyphId of glyphs) width += font.advanceWidth(glyphId);
    return (width * size) / font.unitsPerEm;
  }

  // ———— متن ————
  /**
   * رسم یک خط متن فارسی. y خط پایه (baseline) است.
   * x بسته به align به‌عنوان لبه‌ی راست / مرکز / لبه‌ی چپ استفاده می‌شود.
   */
  text(rawValue: string, x: number, y: number, options: TextOptions = {}): number {
    const weight = options.weight ?? 'regular';
    // اگر عرض بیشینه داده شده باشد، متن به‌جای سرریز شدن با «…» کوتاه می‌شود
    const value =
      options.maxWidth && options.maxWidth > 0
        ? this.ellipsize(rawValue, options.maxWidth, options.size ?? 10, weight)
        : rawValue;
    const font = this.font(weight);
    const size = options.size ?? 10;
    // اول شکل‌دهی (اتصال حروف در ترتیب منطقی)، بعد bidi روی همان سلول‌ها.
    // گلیف‌ها در استریم به ترتیب «منطقی» منتشر می‌شوند (هر کدام با Tm دقیق خودش)،
    // پس متن استخراج‌شده (ToUnicode) در همه‌ی خواننده‌ها به ترتیب درست و با حروف پایه است.
    const shaped = shapePersian(normalizeSpaces(value));
    const cells = [...shaped].map((ch, i) => ({ i, ch }));
    const visual = bidiReorderCells(
      cells,
      (c) => c.ch.codePointAt(0) ?? 0,
      (c, glyph) => ({ i: c.i, ch: glyph }),
    );
    const glyphOf = (c: { ch: string }) => font.glyphIdOf(c.ch.codePointAt(0) ?? 0);
    // موقعیت دیداری (x) هر سلول — برای رسم با مختصات مطلق
    const visualX: number[] = [];
    const visualIndexOfLogical = new Map<number, number>();
    let width = 0;
    visual.forEach((c, k) => {
      visualIndexOfLogical.set(c.i, k);
      visualX.push(width);
      width += (font.advanceWidth(glyphOf(c)) * size) / font.unitsPerEm;
    });

    const align = options.align ?? 'right';
    const startX = align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
    const point = this.map(startX, y);
    const color = parseColor(options.color ?? '#0B1B3A');
    const opacity = options.opacity ?? 1;

    const page = this.currentPage;
    // متن منطقی برای کپی/جستجو در PDF: گلیف‌ها برداری رسم می‌شوند اما ActualText
    // متن اصلی فارسی را نگه می‌دارد تا خواننده‌ی PDF عبارت درست را کپی کند.
    const actualText = value.trim()
      ? (() => {
          const props = PDFDict.withContext(this.doc.context);
          props.set(PDFName.of('ActualText'), PDFHexString.fromText(value));
          return props;
        })()
      : null;
    if (actualText) {
      page.pushOperators(
        PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
          PDFName.of('Span'),
          actualText,
        ] as never),
      );
    }
    const drawGlyphs = () => {
      // شفافیت واقعی PDF تا لایه‌ی زیرین (خطوط جدول، واترمارک) دیده شود
      const needsAlpha = opacity < 1;
      if (needsAlpha) {
        page.pushOperators(
          PDFOperator.of(PDFOperatorNames.PushGraphicsState),
          PDFOperator.of(PDFOperatorNames.SetGraphicsStateParams, [
            this.alphaState(opacity),
          ] as never),
        );
      }
      // انتشار به ترتیب منطقی؛ هر گلیف با Tm در جای دیداری خودش
      for (const cell of cells) {
        const k = visualIndexOfLogical.get(cell.i)!;
        const glyphId = glyphOf(visual[k]);
        const hex = glyphId.toString(16).padStart(4, '0');
        page.pushOperators(
          PDFOperator.of(PDFOperatorNames.BeginText),
          applyColor(color, opacity, page, this.doc),
          PDFOperator.of(PDFOperatorNames.SetTextRenderingMode, [asPDFNumber(0)]),
          PDFOperator.of(PDFOperatorNames.SetFontAndSize, [this.key(weight), asPDFNumber(size)]),
          PDFOperator.of(
            PDFOperatorNames.SetTextMatrix,
            nums([1, 0, 0, 1, point.x + visualX[k], point.y]),
          ),
          PDFOperator.of(PDFOperatorNames.ShowText, [PDFHexString.of(hex)]),
          PDFOperator.of(PDFOperatorNames.EndText),
        );
      }
      if (needsAlpha) page.pushOperators(PDFOperator.of(PDFOperatorNames.PopGraphicsState));
    };

    if (options.rotate) {
      // چرخش حول نقطه‌ی شروع متن
      page.pushOperators(
        PDFOperator.of(PDFOperatorNames.PushGraphicsState),
        PDFOperator.of(
          PDFOperatorNames.ConcatTransformationMatrix,
          nums([
            cosDeg(options.rotate),
            sinDeg(options.rotate),
            -sinDeg(options.rotate),
            cosDeg(options.rotate),
            point.x,
            point.y,
          ]),
        ),
        PDFOperator.of(
          PDFOperatorNames.ConcatTransformationMatrix,
          nums([1, 0, 0, 1, -point.x, -point.y]),
        ),
      );
      drawGlyphs();
      page.pushOperators(PDFOperator.of(PDFOperatorNames.PopGraphicsState));
    } else {
      drawGlyphs();
    }

    if (actualText) page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));

    if (options.underline) {
      this.line(startX, y + 1.2, startX + width, y + 1.2, {
        color: options.color ?? '#0B1B3A',
        width: 0.6,
      });
    }
    return width;
  }

  /** پاراگراف چندخطی با شکست خودکار؛ ارتفاع مصرف‌شده برمی‌گردد */
  paragraph(
    value: string,
    x: number,
    y: number,
    options: TextOptions & { maxWidth: number },
  ): number {
    const size = options.size ?? 10;
    const weight = options.weight ?? 'regular';
    const lineHeight = options.lineHeight ?? Math.round(size * 1.65);
    const lines = this.wrap(value, options.maxWidth, size, weight);
    lines.forEach((line, index) => {
      this.text(line, x, y + index * lineHeight, { ...options, weight });
    });
    return lines.length * lineHeight;
  }

  /** شکستن متن به خطوط جا‌شده در عرض مشخص */
  wrap(value: string, maxWidth: number, size: number, weight: FontWeight = 'regular'): string[] {
    const lines: string[] = [];
    for (const paragraph of value.split('\n')) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push('');
        continue;
      }
      let current = words[0];
      for (let i = 1; i < words.length; i++) {
        const candidate = `${current} ${words[i]}`;
        if (this.measure(candidate, size, weight) <= maxWidth) current = candidate;
        else {
          lines.push(current);
          current = words[i];
        }
      }
      lines.push(current);
    }
    return lines;
  }

  /** بزرگ‌ترین اندازه‌ی فونت که متن در عرض مشخص جا شود (برای نام‌های بلند) */
  fitSize(
    value: string,
    maxWidth: number,
    startSize: number,
    weight: FontWeight = 'regular',
    minSize = 6,
  ): number {
    let size = startSize;
    while (size > minSize && this.measure(value, size, weight) > maxWidth) size -= 0.25;
    return size;
  }

  /** کوتاه‌کردن با «…» تا جا‌شدن در عرض مشخص */
  ellipsize(value: string, maxWidth: number, size: number, weight: FontWeight = 'regular'): string {
    if (this.measure(value, size, weight) <= maxWidth) return value;
    const chars = [...value];
    while (chars.length > 1) {
      chars.pop();
      const candidate = `${chars.join('')}…`;
      if (this.measure(candidate, size, weight) <= maxWidth) return candidate;
    }
    return '…';
  }

  // ———— شکل‌ها ————
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    options: {
      fill?: string | Color;
      stroke?: string | Color;
      strokeWidth?: number;
      opacity?: number;
      radius?: number;
      dash?: number[];
    } = {},
  ): void {
    const top = this.map(x, y);
    const radius = options.radius ?? 0;
    const page = this.currentPage;
    if (radius > 0) {
      // مستطیل با گوشه‌های گرد (چهار کمان بزیه)
      const path = roundedRectPath(top.x, top.y - h, w, h, Math.min(radius, h / 2, w / 2));
      const hasFill = options.fill !== undefined;
      const hasStroke = options.stroke !== undefined;
      page.pushOperators(PDFOperator.of(PDFOperatorNames.PushGraphicsState));
      if (hasFill) {
        if (options.opacity !== undefined && options.opacity < 1) {
          page.pushOperators(
            PDFOperator.of(
              PDFOperatorNames.NonStrokingColorRgb,
              colorComponents(parseColor(options.fill!)),
            ),
          );
        } else {
          page.pushOperators(
            PDFOperator.of(
              PDFOperatorNames.NonStrokingColorRgb,
              colorComponents(parseColor(options.fill!)),
            ),
          );
        }
      }
      if (hasStroke) {
        page.pushOperators(
          PDFOperator.of(
            PDFOperatorNames.StrokingColorRgb,
            colorComponents(parseColor(options.stroke!)),
          ),
          PDFOperator.of(PDFOperatorNames.SetLineWidth, [asPDFNumber(options.strokeWidth ?? 0.7)]),
        );
        if (options.dash?.length) {
          page.pushOperators(
            PDFOperator.of(PDFOperatorNames.SetLineDashPattern, [
              rawArray(options.dash),
              asPDFNumber(0),
            ] as never),
          );
        }
      }
      page.pushOperators(
        PDFOperator.of(PDFOperatorNames.MoveTo, [asPDFNumber(path[0][0]), asPDFNumber(path[0][1])]),
      );
      for (const segment of path.slice(1)) {
        if (segment.length === 2) {
          page.pushOperators(
            PDFOperator.of(PDFOperatorNames.LineTo, [
              asPDFNumber(segment[0]),
              asPDFNumber(segment[1]),
            ]),
          );
        } else {
          page.pushOperators(PDFOperator.of(PDFOperatorNames.AppendBezierCurve, nums(segment)));
        }
      }
      page.pushOperators(PDFOperator.of(PDFOperatorNames.ClosePath));
      if (hasFill && hasStroke)
        page.pushOperators(PDFOperator.of(PDFOperatorNames.FillNonZeroAndStroke));
      else if (hasFill) page.pushOperators(PDFOperator.of(PDFOperatorNames.FillNonZero));
      else page.pushOperators(PDFOperator.of(PDFOperatorNames.StrokePath));
      page.pushOperators(PDFOperator.of(PDFOperatorNames.PopGraphicsState));
      void options.opacity;
      return;
    }
    page.drawRectangle({
      x: top.x,
      y: top.y - h,
      width: w,
      height: h,
      color: options.fill ? parseColor(options.fill) : undefined,
      borderColor: options.stroke ? parseColor(options.stroke) : undefined,
      borderWidth: options.stroke ? (options.strokeWidth ?? 0.7) : 0,
      borderDashArray: options.dash,
      opacity: options.opacity ?? 1,
      borderOpacity: options.opacity ?? 1,
    });
  }

  line(x1: number, y1: number, x2: number, y2: number, options: StrokeStyle = {}): void {
    this.currentPage.drawLine({
      start: this.map(x1, y1),
      end: this.map(x2, y2),
      thickness: options.width ?? 0.6,
      color: parseColor(options.color ?? '#D9E4F5'),
      dashArray: options.dash,
    });
  }

  circle(
    cx: number,
    cy: number,
    r: number,
    options: {
      fill?: string | Color;
      stroke?: string | Color;
      strokeWidth?: number;
      opacity?: number;
    } = {},
  ): void {
    const center = this.map(cx, cy);
    this.currentPage.drawCircle({
      x: center.x,
      y: center.y,
      size: r,
      color: options.fill ? parseColor(options.fill) : undefined,
      borderColor: options.stroke ? parseColor(options.stroke) : undefined,
      borderWidth: options.stroke ? (options.strokeWidth ?? 0.7) : 0,
      opacity: options.opacity ?? 1,
      borderOpacity: options.opacity ?? 1,
    });
  }

  /** خط تیره */
  dashedLine(
    x1: number,
    x2: number,
    y: number,
    color = '#B3C9EA',
    width = 0.6,
    dash = [2, 2],
  ): void {
    this.line(x1, y, x2, y, { color, width, dash });
  }

  /** تصویر (لوگو) — خطا نادیده گرفته می‌شود */
  async image(url: string, x: number, y: number, w: number, h: number, opacity = 1): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const image = /\.png$/i.test(url)
        ? await this.doc.embedPng(bytes)
        : await this.doc.embedJpg(bytes);
      const top = this.map(x, y);
      this.currentPage.drawImage(image, { x: top.x, y: top.y - h, width: w, height: h, opacity });
    } catch {
      // لوگو تزئینی است
    }
  }

  // ———— نواحی ————
  pushArea(area: { x: number; y: number; w: number; h: number }): void {
    this.contextStack.push({ ...this.context });
    this.context = {
      x: this.context.x + area.x,
      y: this.context.y + area.y,
      w: area.w,
      h: area.h,
    };
  }

  popArea(): void {
    this.context = this.contextStack.pop() ?? this.context;
  }

  get area(): { x: number; y: number; w: number; h: number } {
    return this.context;
  }

  /** اجرای رسم روی همه‌ی صفحه‌ها */
  onEachPage(render: (pageNumber: number, total: number) => void): void {
    const total = this.pages.length;
    const current = this.page;
    this.pages.forEach((page, index) => {
      this.page = page;
      this.resourceKeys.clear();
      for (const [weight, entry] of this.fonts) {
        this.resourceKeys.set(weight, page.node.newFontDictionary(entry.pdf.name, entry.pdf.ref));
      }
      render(index + 1, total);
    });
    this.page = current ?? null;
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save({ useObjectStreams: false });
  }

  async blob(): Promise<Blob> {
    const bytes = await this.save();
    return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  }
}

/** مؤلفه‌های RGB به‌صورت اعداد PDF (عدد خام JS طول استریم را خراب می‌کند) */
function colorComponents(color: Color): PDFNumber[] {
  const { red, green, blue } = color as unknown as { red: number; green: number; blue: number };
  return [asPDFNumber(red), asPDFNumber(green), asPDFNumber(blue)];
}

/** تبدیل اعداد به PDFNumber تا طول استریم درست محاسبه شود */
function nums(values: number[]): PDFNumber[] {
  return values.map((value) => asPDFNumber(value));
}

/** آرایه‌ی خام PDF (برای الگوی خط‌چین) */
function rawArray(values: number[]): string {
  return `[${values.join(' ')}]`;
}

function cosDeg(deg: number): number {
  return Math.cos((deg * Math.PI) / 180);
}

function sinDeg(deg: number): number {
  return Math.sin((deg * Math.PI) / 180);
}

/** مسیر مستطیل با گوشه‌های گرد؛ هر بخش [x,y] یا [x1,y1,x2,y2,x3,y3] */
function roundedRectPath(x: number, y: number, w: number, h: number, r: number): number[][] {
  const k = 0.5523 * r;
  return [
    [x + r, y],
    [x + w - r, y],
    [x + w - r + k, y, x + w, y + r - k, x + w, y + r],
    [x + w, y + h - r],
    [x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h],
    [x + r, y + h],
    [x + r - k, y + h, x, y + h - r + k, x, y + h - r],
    [x, y + r],
    [x, y + r - k, x + r - k, y, x + r, y],
  ];
}

/** رنگ و شفافیت برای متن (اپراتورهای خام) */
function applyColor(color: Color, _opacity: number, _page: PDFPage, _doc: PDFDocument) {
  return PDFOperator.of(PDFOperatorNames.NonStrokingColorRgb, colorComponents(color));
}

async function fetchFontBinary(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('فونت چاپ دریافت نشد؛ نصب برنامه یا اتصال شبکه را بررسی کنید.');
  }
  return response.arrayBuffer();
}

export { PDFName, PDFHexString, degrees };
