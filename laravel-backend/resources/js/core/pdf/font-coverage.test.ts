/**
 * Font coverage tests: every glyph the PDF engine can draw (shaping output)
 * plus all UI-critical code points must exist in the embedded TTF fonts,
 * otherwise pdf-lib would draw .notdef boxes (glyph 0, advance 908).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fontkit from '@pdf-lib/fontkit';
import { loadTrueTypeFont, type TrueTypeFont } from './font';
import { shapePersian } from './persian';

const WEIGHTS = ['Regular', 'Medium', 'Bold'] as const;
const FONT_DIR = 'public/fonts';
const TTF_DIR = 'resources/js/assets/fonts';

function loadFont(weight: string): TrueTypeFont {
  const buf = readFileSync(`${TTF_DIR}/Vazirmatn-${weight}.ttf`);
  return loadTrueTypeFont(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  );
}

/** every code point the shaper can emit, computed from real shaping output */
function shapedOutputCodePoints(): Set<number> {
  const letters = [
    0x0621, 0x0622, 0x0623, 0x0624, 0x0625, 0x0626, 0x0627, 0x0628, 0x0629, 0x062a, 0x062b, 0x062c,
    0x062d, 0x062e, 0x062f, 0x0630, 0x0631, 0x0632, 0x0633, 0x0634, 0x0635, 0x0636, 0x0637, 0x0638,
    0x0639, 0x063a, 0x0640, 0x0641, 0x0642, 0x0643, 0x0644, 0x0645, 0x0646, 0x0647, 0x0648, 0x0649,
    0x064a, 0x067e, 0x0686, 0x0698, 0x06a9, 0x06af, 0x06cc,
  ];
  // shape every letter in all joining contexts: X l X, X ZWNJ X, plus lam-alef ligatures
  const samples = [
    String.fromCodePoint(...letters),
    ...letters.map((l) => `ب${String.fromCodePoint(l)}ا`),
    ...letters.map((l) => `ب\u200c${String.fromCodePoint(l)}`),
    'لا لآ',
  ];
  const out = new Set<number>();
  for (const s of samples) for (const ch of shapePersian(s)) out.add(ch.codePointAt(0) ?? 0);
  return out;
}

const MUST_HAVE = [
  0x20,
  0x200c,
  0x200d,
  0x00a0,
  0x06f0,
  0x06f1,
  0x06f2,
  0x06f3,
  0x06f4,
  0x06f5,
  0x06f6,
  0x06f7,
  0x06f8,
  0x06f9,
  0x0660,
  0x0669,
  0x30,
  0x39,
  0x41,
  0x61,
  0x7a, // Latin letters+digits
  0x066a,
  0x066b,
  0x066c, // ٪ ٫ ٬
  0x060c,
  0x061b,
  0x061f, // ، ؛ ؟
  0x2026,
  0x2013,
  0x2014,
  0x00ab,
  0x00bb,
  0x2018,
  0x2019,
  0x201c,
  0x201d,
  0x2022,
  0x2039,
  0x203a,
  0x2b,
  0x25,
  0x2d,
  0xd7,
  0x2212,
  0x40,
  0x2f,
  0x28,
  0x29,
  0x5f,
  0x7c, // punctuation/symbols
];

describe('font coverage (resources/js/assets/fonts TTF, bundled into the app)', () => {
  const shaped = shapedOutputCodePoints();

  it('shaper output is non-trivial (sanity)', () => {
    expect(shaped.size).toBeGreaterThan(40);
  });

  for (const weight of WEIGHTS) {
    it(`${weight}: covers all shaped presentation forms`, () => {
      const font = loadFont(weight);
      const missing = [...shaped].filter((cp) => !font.hasGlyph(cp));
      expect(missing.map((c) => `U+${c.toString(16).toUpperCase()}`)).toEqual([]);
    });

    it(`${weight}: covers must-have code points`, () => {
      const font = loadFont(weight);
      const missing = MUST_HAVE.filter((cp) => !font.hasGlyph(cp));
      expect(missing.map((c) => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`)).toEqual([]);
    });

    it(`${weight}: ZWNJ is zero-width (no gap/box in PDF)`, () => {
      const font = loadFont(weight);
      expect(font.advanceWidth(font.glyphId(0x200c))).toBe(0);
    });

    it(`${weight}: metrics are sane`, () => {
      const font = loadFont(weight);
      expect(font.metrics.unitsPerEm).toBeGreaterThan(0);
      expect(font.metrics.numGlyphs).toBeGreaterThan(500);
      expect(font.metrics.familyName.toLowerCase()).toContain('vazirmatn');
    });
  }

  it('web fonts are the variable woff2 pair from the Qazvintasvir repo (arabic + latin subsets)', () => {
    // فونت وب: جفت woff2 متغیر (wght 100-900) از مخزن
    // github.com/rahmaniho/Qazvintasvir — @font-face در globals.css به همین دو فایل اشاره می‌کند
    const arabicBuf = readFileSync(`${FONT_DIR}/vazirmatn-arabic-wght-normal.woff2`);
    const latinBuf = readFileSync(`${FONT_DIR}/vazirmatn-latin-wght-normal.woff2`);
    expect(arabicBuf.byteLength).toBeGreaterThan(30_000);
    expect(latinBuf.byteLength).toBeGreaterThan(20_000);
    expect(readFileSync(`${FONT_DIR}/LICENSE-vazirmatn.txt`, 'utf-8')).toMatch(
      /OPEN FONT LICENSE/i,
    );
    const arabic = fontkit.create(new Uint8Array(arabicBuf)) as fontkit.Font;
    const latin = fontkit.create(new Uint8Array(latinBuf)) as fontkit.Font;
    // زیرمجموعه‌ی عربی: حروف فارسی و شکل‌های نمایشی (FB50–FEFF) + ارقام فارسی + ٪
    const aSet = new Set<number>(arabic.characterSet);
    for (const cp of [0x0641, 0xfee4, 0xfefb, 0x06f0, 0x066a, 0x066c])
      expect(aSet.has(cp)).toBe(true);
    // زیرمجموعه‌ی لاتین: ارقام ASCII و … و −
    const lSet = new Set<number>(latin.characterSet);
    for (const cp of [0x0030, 0x0041, 0x2026, 0x2212]) expect(lSet.has(cp)).toBe(true);
  });
});
