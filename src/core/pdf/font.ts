/**
 * خواندن فونت TrueType (sfnt) برای موتور PDF برداری
 *
 * چرا؟ متن فارسی داخل PDF باید واقعاً «متن» باشد (قابل انتخاب و جستجو) و با فونت
 * فارسی درست رندر شود. این ماژول جدول‌های cmap/glyf/loca/hmtx را از فایل TTF
 * پروژه (وزیرمتن، مجوز SIL OFL) می‌خواند و مسیر برداری هر گلیف را می‌سازد.
 */

export interface GlyphPoint {
  x: number;
  y: number;
  /** نقطه‌ی روی منحنی (on-curve) یا نقطه‌ی کنترل (off-curve) */
  onCurve: boolean;
}

export interface GlyphOutline {
  /** هر کنتور یک آرایه از نقاط به ترتیب: [onCurve, offCurve(control), onCurve, ...] */
  contours: GlyphPoint[][];
  advanceWidth: number;
}

export interface FontMetrics {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lineGap: number;
  capHeight: number;
  xHeight: number;
  numGlyphs: number;
  /** نام خانواده‌ی فونت (برای متادیتای PDF) */
  familyName: string;
}

const COMPOSITE_FLAGS = {
  ARG_1_AND_2_ARE_WORDS: 0x0001,
  ARGS_ARE_XY_VALUES: 0x0002,
  WE_HAVE_A_SCALE: 0x0008,
  MORE_COMPONENTS: 0x0020,
  WE_HAVE_AN_X_AND_Y_SCALE: 0x0040,
  WE_HAVE_A_TWO_BY_TWO: 0x0080,
} as const;

interface TableRecord {
  offset: number;
  length: number;
}

function f2dot14(value: number): number {
  // 16bit signed / 16384
  return (value << 16) >> 16 === value ? value / 16384 : (value - 0x10000) / 16384;
}

export class TrueTypeFont {
  private readonly view: DataView;
  private readonly tables = new Map<string, TableRecord>();
  private readonly loca: number[];
  private readonly advances: number[];
  private readonly cmap = new Map<number, number>();
  private readonly outlineCache = new Map<number, GlyphOutline>();
  readonly metrics: FontMetrics;

  /** بایت‌های فونت برای جاسازی در PDF */
  readonly bytes: Uint8Array;

  constructor(buffer: ArrayBuffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
    this.readTableDirectory();
    const head = this.table('head');
    const maxp = this.table('maxp');
    const hhea = this.table('hhea');
    const unitsPerEm = this.view.getUint16(head.offset + 18, false) || 1000;
    const numGlyphs = this.view.getUint16(maxp.offset + 4, false);
    const numberOfHMetrics = this.view.getUint16(hhea.offset + 34, false);
    const ascender = this.view.getInt16(hhea.offset + 4, false);
    const descender = this.view.getInt16(hhea.offset + 6, false);
    const lineGap = this.view.getInt16(hhea.offset + 8, false);
    let capHeight = Math.round(unitsPerEm * 0.7);
    let xHeight = Math.round(unitsPerEm * 0.5);
    const os2 = this.tables.get('OS/2');
    if (os2 && os2.length >= 90) {
      capHeight = this.view.getInt16(os2.offset + 88, false) || capHeight;
      xHeight = this.view.getInt16(os2.offset + 86, false) || xHeight;
    }
    this.loca = this.readLoca(head, numGlyphs);
    this.advances = this.readAdvances(hhea, numberOfHMetrics, numGlyphs);
    this.readCmap();
    this.metrics = {
      unitsPerEm,
      ascender,
      descender,
      lineGap,
      capHeight,
      xHeight,
      numGlyphs,
      familyName: this.readFamilyName(),
    };
  }

  private readTableDirectory(): void {
    const numTables = this.view.getUint16(4, false);
    for (let i = 0; i < numTables; i++) {
      const record = 12 + i * 16;
      const tag = String.fromCharCode(
        this.view.getUint8(record),
        this.view.getUint8(record + 1),
        this.view.getUint8(record + 2),
        this.view.getUint8(record + 3),
      );
      this.tables.set(tag, {
        offset: this.view.getUint32(record + 8, false),
        length: this.view.getUint32(record + 12, false),
      });
    }
  }

  private table(tag: string): TableRecord {
    const record = this.tables.get(tag);
    if (!record) throw new Error(`جدول «${tag}» در فونت پیدا نشد.`);
    return record;
  }

  private readLoca(head: TableRecord, numGlyphs: number): number[] {
    const loca = this.table('loca');
    const longFormat = this.view.getInt16(head.offset + 50, false) === 1;
    const out: number[] = [];
    for (let i = 0; i <= numGlyphs; i++) {
      out.push(
        longFormat
          ? this.view.getUint32(loca.offset + i * 4, false)
          : this.view.getUint16(loca.offset + i * 2, false) * 2,
      );
    }
    return out;
  }

  private readAdvances(hhea: TableRecord, numberOfHMetrics: number, numGlyphs: number): number[] {
    const hmtx = this.table('hmtx');
    const out: number[] = [];
    let last = 0;
    for (let i = 0; i < numGlyphs; i++) {
      if (i < numberOfHMetrics) last = this.view.getUint16(hmtx.offset + i * 4, false);
      out.push(last);
    }
    void hhea;
    return out;
  }

  private readFamilyName(): string {
    const name = this.tables.get('name');
    if (!name) return 'Vazirmatn';
    const count = this.view.getUint16(name.offset + 2, false);
    const stringOffset = name.offset + this.view.getUint16(name.offset + 4, false);
    for (let i = 0; i < count; i++) {
      const record = name.offset + 6 + i * 12;
      const platformId = this.view.getUint16(record, false);
      const nameId = this.view.getUint16(record + 6, false);
      if (nameId !== 1) continue;
      const length = this.view.getUint16(record + 8, false);
      const offset = stringOffset + this.view.getUint16(record + 10, false);
      let text = '';
      if (platformId === 3 || platformId === 0) {
        for (let k = 0; k < length; k += 2) {
          text += String.fromCharCode(this.view.getUint16(offset + k, false));
        }
      } else {
        for (let k = 0; k < length; k++)
          text += String.fromCharCode(this.view.getUint8(offset + k));
      }
      if (text.trim()) return text.trim();
    }
    return 'Vazirmatn';
  }

  private readCmap(): void {
    const cmap = this.table('cmap');
    const count = this.view.getUint16(cmap.offset + 2, false);
    const subtables: { platform: number; encoding: number; offset: number; format: number }[] = [];
    for (let i = 0; i < count; i++) {
      const record = cmap.offset + 4 + i * 8;
      const platform = this.view.getUint16(record, false);
      const encoding = this.view.getUint16(record + 2, false);
      const offset = cmap.offset + this.view.getUint32(record + 4, false);
      subtables.push({ platform, encoding, offset, format: this.view.getUint16(offset, false) });
    }
    const format12 = subtables.find((s) => s.format === 12);
    const format4 = subtables
      .filter((s) => s.format === 4)
      .sort((a, b) => {
        // ترجیح سکوی یونیکد (3/10 یا 0/x) سپس 3/1
        const score = (s: typeof a) =>
          s.platform === 3 && s.encoding === 10 ? 0 : s.platform === 0 ? 1 : 2;
        return score(a) - score(b);
      })[0];
    if (format12) {
      const groups = this.view.getUint32(format12.offset + 12, false);
      for (let i = 0; i < groups; i++) {
        const group = format12.offset + 16 + i * 12;
        const start = this.view.getUint32(group, false);
        const end = this.view.getUint32(group + 4, false);
        const startGlyph = this.view.getUint32(group + 8, false);
        for (let cp = start; cp <= end && cp - start < 0x20000; cp++) {
          this.cmap.set(cp, startGlyph + (cp - start));
        }
      }
      return;
    }
    if (format4) {
      const segCount = this.view.getUint16(format4.offset + 6, false) / 2;
      const endCodes = format4.offset + 14;
      const startCodes = endCodes + segCount * 2 + 2;
      const idDeltas = startCodes + segCount * 2;
      const idRangeOffsets = idDeltas + segCount * 2;
      for (let s = 0; s < segCount; s++) {
        const end = this.view.getUint16(endCodes + s * 2, false);
        const start = this.view.getUint16(startCodes + s * 2, false);
        const delta = this.view.getInt16(idDeltas + s * 2, false);
        const rangeOffsetPos = idRangeOffsets + s * 2;
        const rangeOffset = this.view.getUint16(rangeOffsetPos, false);
        for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
          let glyph: number;
          if (rangeOffset === 0) {
            glyph = (cp + delta) & 0xffff;
          } else {
            const index = rangeOffsetPos + rangeOffset + (cp - start) * 2;
            glyph = this.view.getUint16(index, false);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) this.cmap.set(cp, glyph);
        }
      }
    }
  }

  /** شناسه‌ی گلیف برای یک نویسه (یا 0 اگر نبود) */
  glyphId(codePoint: number): number {
    return this.cmap.get(codePoint) ?? 0;
  }

  /** code point matching a glyph id (reverse cmap lookup, used to audit drawn PDF glyphs) */
  private reverseCmap: Map<number, number> | null = null;

  codePointForGlyph(glyphId: number): number | undefined {
    if (!this.reverseCmap) {
      this.reverseCmap = new Map();
      for (const [cp, gid] of this.cmap)
        if (!this.reverseCmap.has(gid)) this.reverseCmap.set(gid, cp);
    }
    return this.reverseCmap.get(glyphId);
  }

  hasGlyph(codePoint: number): boolean {
    return this.cmap.has(codePoint);
  }

  /** همه‌ی نگاشت‌های cmap به‌صورت [codePoint, glyphId] (برای ساخت ToUnicode) */
  cmapEntries(): [number, number][] {
    return [...this.cmap.entries()];
  }

  advanceWidth(glyphId: number): number {
    return this.advances[glyphId] ?? this.advances[this.advances.length - 1] ?? 0;
  }

  /** عرض متن با فونت واحد (font units) — ورودی: رشته‌ی آماده‌ی نمایش */
  measureText(text: string): number {
    let width = 0;
    for (const ch of text) width += this.advanceWidth(this.glyphId(ch.codePointAt(0) ?? 0));
    return width;
  }

  /** عرض متن به نقطه (pt) برای اندازه‌ی مشخص */
  widthOfTextAtSize(text: string, size: number): number {
    return (this.measureText(text) * size) / this.metrics.unitsPerEm;
  }

  /** مسیر برداری گلیف (کش‌شده) */
  outline(glyphId: number, depth = 0): GlyphOutline {
    const cached = this.outlineCache.get(glyphId);
    if (cached) return cached;
    const outline = this.buildOutline(glyphId, depth);
    this.outlineCache.set(glyphId, outline);
    return outline;
  }

  private buildOutline(glyphId: number, depth: number): GlyphOutline {
    const glyph = this.table('glyf');
    const advanceWidth = this.advanceWidth(glyphId);
    const start = this.loca[glyphId];
    const end = this.loca[glyphId + 1];
    if (start === undefined || end === undefined || end <= start)
      return { contours: [], advanceWidth };
    if (depth > 4) return { contours: [], advanceWidth };
    const base = glyph.offset + start;
    const contours: GlyphPoint[][] = [];
    const numberOfContours = this.view.getInt16(base, false);

    if (numberOfContours < 0) {
      // گلیف ترکیبی
      let offset = base + 10;
      let flags = 0;
      do {
        flags = this.view.getUint16(offset, false);
        const componentGlyph = this.view.getUint16(offset + 2, false);
        offset += 4;
        let arg1: number;
        let arg2: number;
        if (flags & COMPOSITE_FLAGS.ARG_1_AND_2_ARE_WORDS) {
          arg1 = this.view.getInt16(offset, false);
          arg2 = this.view.getInt16(offset + 2, false);
          offset += 4;
        } else {
          arg1 = this.view.getInt8(offset);
          arg2 = this.view.getInt8(offset + 1);
          offset += 2;
        }
        let a = 1;
        let b = 0;
        let c = 0;
        let d = 1;
        if (flags & COMPOSITE_FLAGS.WE_HAVE_A_SCALE) {
          a = d = f2dot14(this.view.getInt16(offset, false));
          offset += 2;
        } else if (flags & COMPOSITE_FLAGS.WE_HAVE_AN_X_AND_Y_SCALE) {
          a = f2dot14(this.view.getInt16(offset, false));
          d = f2dot14(this.view.getInt16(offset + 2, false));
          offset += 4;
        } else if (flags & COMPOSITE_FLAGS.WE_HAVE_A_TWO_BY_TWO) {
          a = f2dot14(this.view.getInt16(offset, false));
          b = f2dot14(this.view.getInt16(offset + 2, false));
          c = f2dot14(this.view.getInt16(offset + 4, false));
          d = f2dot14(this.view.getInt16(offset + 6, false));
          offset += 8;
        }
        const dx = flags & COMPOSITE_FLAGS.ARGS_ARE_XY_VALUES ? arg1 : 0;
        const dy = flags & COMPOSITE_FLAGS.ARGS_ARE_XY_VALUES ? arg2 : 0;
        const child = this.outline(componentGlyph, depth + 1);
        for (const contour of child.contours) {
          contours.push(
            contour.map((point) => ({
              x: a * point.x + c * point.y + dx,
              y: b * point.x + d * point.y + dy,
              onCurve: point.onCurve,
            })),
          );
        }
      } while (flags & COMPOSITE_FLAGS.MORE_COMPONENTS);
      return { contours, advanceWidth };
    }

    if (numberOfContours === 0) return { contours, advanceWidth };

    const endPoints: number[] = [];
    for (let i = 0; i < numberOfContours; i++) {
      endPoints.push(this.view.getUint16(base + 10 + i * 2, false));
    }
    const pointCount = endPoints[endPoints.length - 1] + 1;
    let offset = base + 10 + numberOfContours * 2;
    const instructionLength = this.view.getUint16(offset, false);
    offset += 2 + instructionLength;

    const flags: number[] = [];
    while (flags.length < pointCount) {
      const flag = this.view.getUint8(offset++);
      flags.push(flag);
      if (flag & 0x08) {
        let repeat = this.view.getUint8(offset++);
        while (repeat-- > 0 && flags.length < pointCount) flags.push(flag);
      }
    }
    const xs: number[] = [];
    let x = 0;
    for (const flag of flags) {
      if (flag & 0x02) {
        const delta = this.view.getUint8(offset++);
        x += flag & 0x10 ? delta : -delta;
      } else if (!(flag & 0x10)) {
        x += this.view.getInt16(offset, false);
        offset += 2;
      }
      xs.push(x);
    }
    const ys: number[] = [];
    let y = 0;
    for (const flag of flags) {
      if (flag & 0x04) {
        const delta = this.view.getUint8(offset++);
        y += flag & 0x20 ? delta : -delta;
      } else if (!(flag & 0x20)) {
        y += this.view.getInt16(offset, false);
        offset += 2;
      }
      ys.push(y);
    }

    let pointIndex = 0;
    for (const endPoint of endPoints) {
      const contour: GlyphPoint[] = [];
      while (pointIndex <= endPoint) {
        contour.push({
          x: xs[pointIndex],
          y: ys[pointIndex],
          onCurve: (flags[pointIndex] & 1) === 1,
        });
        pointIndex++;
      }
      contours.push(contour);
    }
    return { contours, advanceWidth };
  }
}

/** ساخت فونت از فایل TTF (ArrayBuffer) */
export function loadTrueTypeFont(buffer: ArrayBuffer): TrueTypeFont {
  return new TrueTypeFont(buffer);
}
