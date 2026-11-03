/**
 * Comprehensive tests for the Persian text engine (shaping, bidi, normalization, digits).
 * Sample strings are the ones required by the typography specification.
 */
import { describe, expect, it } from 'vitest';
import {
  bidiReorder,
  bidiReorderCells,
  faNumber,
  isPersianText,
  normalizeForSearch,
  normalizePersian,
  presentationToBase,
  shapePersian,
  toVisualText,
} from './persian';

/** code points of a string */
const cps = (s: string): number[] => [...s].map((c) => c.codePointAt(0) ?? 0);
const hex = (s: string): string =>
  cps(s)
    .map((c) => c.toString(16).toUpperCase().padStart(4, '0'))
    .join(' ');

/** The 9 sample strings required by the typography spec */
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
];

describe('normalizePersian', () => {
  it('converts Arabic Yeh/Kaf/Tah-Marbuta to Persian', () => {
    expect(normalizePersian('ي ك ة')).toBe('ی ک ه');
  });
  it('strips harakat and RLM/LRM but keeps ZWNJ', () => {
    expect(normalizePersian('م\u064e\u0650روم')).toBe('مروم');
    expect(normalizePersian('سلام\u064b\u200f\u200e')).toBe('سلام');
    expect(normalizePersian('می\u200cروم')).toBe('می\u200cروم');
  });
});

describe('normalizeForSearch', () => {
  it('removes ZWNJ and converts Persian digits for search', () => {
    expect(normalizeForSearch('می\u200cروم ۱۲۳')).toBe('میروم 123');
  });
});

describe('shapePersian — letter joining forms', () => {
  it('سلام: sin initial + lam-alef final ligature + mim final (joined to lam)', () => {
    expect(hex(shapePersian('سلام'))).toBe('FEB3 FEFC FEE2');
  });
  it('دارو: waw after dal must be isolated (dal does not join forward)', () => {
    expect(hex(shapePersian('دارو'))).toBe('FEA9 FE8D FEAD FEED');
  });
  it('حساب‌ها: ba after alef is isolated, ha after ZWNJ is initial', () => {
    expect(hex(shapePersian('حساب‌ها'))).toBe('FEA3 FEB4 FE8D FE8F 200C FEEB FE8E');
  });
  it('می‌روم: ZWNJ breaks the join (ye final, dal isolated)', () => {
    expect(hex(shapePersian('می‌روم'))).toBe('FEE3 FBFD 200C FEAD FEED FEE1');
  });
  it('بلا: lam-alef after a joining letter takes the final ligature form (FEFC)', () => {
    expect(hex(shapePersian('بلا'))).toBe('FE91 FEFC');
  });
  it('لآ: lam-alef-madda ligature, isolated FEF5 and final FEF6', () => {
    expect(hex(shapePersian('لآ'))).toBe('FEF5');
    expect(hex(shapePersian('بلآ'))).toBe('FE91 FEF6');
  });
  it('Latin and digits pass through untouched', () => {
    expect(shapePersian('INV-1024 09152521166 10%')).toBe('INV-1024 09152521166 10%');
    expect(shapePersian('۱۲۳۴')).toBe('۱۲۳۴');
  });
  it('tatweel (U+0640) joins both sides', () => {
    // ب + tatweel + ا : tatweel is dual-joining, so ba is medial and alef is final
    const shaped = hex(shapePersian('ب\u0640ا'));
    expect(shaped).toBe('FE91 0640 FE8E');
  });
  it('all sample strings shape fully (no base Arabic letter left) and keep ZWNJ', () => {
    for (const s of SAMPLES) {
      const shaped = shapePersian(s);
      for (const ch of shaped) {
        const cp = ch.codePointAt(0) ?? 0;
        const isArabicLetter = cp >= 0x0621 && cp <= 0x064a && cp !== 0x0640;
        if (isArabicLetter) throw new Error(`unshaped letter U+${cp.toString(16)} in "${s}"`);
      }
      if (s.includes('\u200c')) expect(shaped).toContain('\u200c');
    }
  });
});

describe('bidiReorder — bidirectional ordering', () => {
  it('pure Persian text is reversed (visual LTR order)', () => {
    expect(bidiReorder(shapePersian('سلام'))).toBe([...shapePersian('سلام')].reverse().join(''));
  });
  it('Latin digits stay LTR: phone number', () => {
    const visual = bidiReorder(shapePersian('شماره تماس: 09152521166'));
    expect(visual.startsWith('09152521166')).toBe(true);
  });
  it('Jalali date keeps its order with slashes', () => {
    const visual = bidiReorder(shapePersian('تاریخ ۱۴۰۵/۰۸/۱۳'));
    expect(visual.startsWith('۱۴۰۵/۰۸/۱۳')).toBe(true);
  });
  it('thousands separator stays inside the number', () => {
    expect(bidiReorder(shapePersian('۶۷۷٬۸۳۵٬۲۰۰'))).toBe('۶۷۷٬۸۳۵٬۲۰۰');
  });
  it('pure Latin text is untouched', () => {
    const latin = 'KarenSoft | Hesabyar | info@example.com';
    expect(bidiReorder(latin)).toBe(latin);
  });
  it('Latin tracking code with dashes keeps its order', () => {
    expect(bidiReorder('INV-1024-AB')).toBe('INV-1024-AB');
  });
  it('parentheses are mirrored and wrap the Latin word correctly', () => {
    const visual = bidiReorder(shapePersian('کالای خریداری‌شده (Product) با تخفیف'));
    const idx = visual.indexOf('Product');
    expect(idx).toBeGreaterThan(0);
    expect(visual[idx - 1]).toBe('(');
    expect(visual[idx + 'Product'.length]).toBe(')');
  });
  it('minus sign sits at the logical start (right side) of an RTL amount', () => {
    const visual = bidiReorder(shapePersian('− ۶۷۷٬۸۳۵٬۲۰۰ تومان'));
    expect(visual.endsWith('\u2212')).toBe(true);
    expect(visual).toContain('۶۷۷٬۸۳۵٬۲۰۰');
  });
  it('percent sign sits left of the digits', () => {
    const visual = bidiReorder(shapePersian('تخفیف ۱۰٪'));
    expect(visual.startsWith('٪۱۰')).toBe(true);
  });
  it('email and phone inside a Persian sentence keep their order', () => {
    const visual = bidiReorder(shapePersian('تماس: info@example.com یا 09123456789'));
    expect(visual).toContain('info@example.com');
    expect(visual.startsWith('09123456789')).toBe(true);
  });
  it('code-point multiset is preserved (modulo mirrored pairs)', () => {
    const mirror: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[' };
    const norm = (t: string) =>
      [...t]
        .map((c) => mirror[c] ?? c)
        .sort()
        .join('');
    for (const s of SAMPLES) {
      expect(norm(bidiReorder(shapePersian(s)))).toBe(norm(shapePersian(s)));
    }
  });
});

describe('toVisualText — text ready for PDF drawing', () => {
  it('all samples shape and reorder without loss of length', () => {
    for (const s of SAMPLES) {
      const visual = toVisualText(s);
      expect(visual.length).toBeGreaterThan(0);
      expect([...visual].length).toBe([...shapePersian(s)].length);
    }
  });
  it('ZWNJ survives into the visual text', () => {
    expect(toVisualText('می‌روم، کتاب‌ها')).toContain('\u200c');
  });
});

describe('faNumber', () => {
  it('formats with Persian digits and thousands separator', () => {
    expect(faNumber(677835200)).toBe('۶۷۷٬۸۳۵٬۲۰۰');
    expect(faNumber(1254, 0)).toBe('۱٬۲۵۴');
  });
});

describe('isPersianText', () => {
  it('detects Persian vs Latin', () => {
    expect(isPersianText('سلام')).toBe(true);
    expect(isPersianText('hello')).toBe(false);
    expect(isPersianText('سلام 123')).toBe(true);
  });
});

describe('bidiReorderCells', () => {
  it('matches bidiReorder on strings (permutation equivalent)', () => {
    for (const s of [...SAMPLES, 'شماره تماس: 09152521166', 'mixed (پرانتز) و 1234 test']) {
      const viaString = bidiReorder(s);
      const viaCells = bidiReorderCells(
        [...s],
        (c) => c.codePointAt(0) ?? 0,
        (_c, glyph) => glyph,
      ).join('');
      expect(viaCells).toBe(viaString);
    }
  });

  it('keeps logical indices attached to cells through reordering', () => {
    const cells = [...'سلام 12'].map((ch, i) => ({ i, ch }));
    const visual = bidiReorderCells(
      cells,
      (c) => c.ch.codePointAt(0) ?? 0,
      (c, glyph) => ({ i: c.i, ch: glyph }),
    );
    // visual order of "سلام 12" is: digits first (LTR run), then reversed Persian
    expect(visual.map((c) => c.ch).join('')).toBe('12 ' + [...'سلام'].reverse().join(''));
    // every logical index appears exactly once
    expect([...visual].map((c) => c.i).sort((a, b) => a - b)).toEqual(cells.map((c) => c.i));
  });

  it('mirrors parens inside RTL runs on cells too', () => {
    const cells = [...'(سلام)'].map((ch, i) => ({ i, ch }));
    const visual = bidiReorderCells(
      cells,
      (c) => c.ch.codePointAt(0) ?? 0,
      (c, glyph) => ({ i: c.i, ch: glyph }),
    );
    expect(visual.map((c) => c.ch).join('')).toBe(bidiReorder('(سلام)'));
    expect(visual.map((c) => c.ch).join('')).toBe('(مالس)');
  });
});

describe('presentationToBase', () => {
  it('maps presentation forms to their base letter', () => {
    expect(presentationToBase(0xfee4)).toEqual([0x0645]); // medial mim
    expect(presentationToBase(0xfe8e)).toEqual([0x0627]); // final alef
    expect(presentationToBase(0xfb92)).toEqual([0x06af]); // isolated gaf
  });

  it('maps lam-alef ligatures to two base letters', () => {
    expect(presentationToBase(0xfefb)).toEqual([0x0644, 0x0627]); // لا isolated
    expect(presentationToBase(0xfefc)).toEqual([0x0644, 0x0627]); // لا final
    expect(presentationToBase(0xfef5)).toEqual([0x0644, 0x0622]); // لآ isolated
  });

  it('returns null outside the presentation-forms range', () => {
    expect(presentationToBase(0x0645)).toBeNull();
    expect(presentationToBase(0x0041)).toBeNull();
    expect(presentationToBase(0x0020)).toBeNull();
  });
});
