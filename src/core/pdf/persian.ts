/**
 * آماده‌سازی متن فارسی/عربی برای چاپ و PDF
 *
 * کارهایی که انجام می‌شود:
 * ۱) نرمال‌سازی نویسه‌ها (ی/ک عربی، اعراب اضافی، نیم‌فاصله → فاصله‌ی نازک)
 * ۲) تبدیل به «شکل‌های نمایشی» فارسی (Presentation Forms-B) چون موتور PDF به GSUB
 *    دسترسی ندارد؛ وزیرمتن همه‌ی این شکل‌ها را در cmap دارد
 * ۳) چینش راست‌به‌چپ (bidi ساده برای فارسی + لاتین/ریال/درصد)
 * ۴) اعداد: ارقام فارسی و جداکننده‌ی هزارگان فارسی
 */
import { toFaDigits } from '@/core/currency/currency';

/** نیم‌فاصله‌ی نمایشی — در فونت وزیرمتن بدون شکستن شکل حروف نمایش داده می‌شود */
export const ZWNJ_SPACED = '\u200c';
/** فاصله‌ی نازک برای جلوگیری از چسبیدن کلمات (در متادیتای PDF استفاده می‌شود) */
const THIN_SPACE = '\u2009';

/** اعراب و علامت‌های ترکیبی که در متن‌های ورودی معمولاً ناخواسته‌اند */
const HARAKAT = /[\u064b-\u0652\u0653-\u0655\u0670]/g;

/** نرمال‌سازی پایه — بدون تغییر معنا */
export function normalizePersian(input: string): string {
  return input
    .replace(/\u064a/g, 'ی') // ي عربی
    .replace(/ى/g, 'ی')
    .replace(/\u0643/g, 'ک') // ك عربی
    .replace(/\u0629/g, 'ه') // ة
    .replace(HARAKAT, '')
    .replace(/\u200f|\u200e/g, '');
}

/** نرمال‌سازی متن برای جستجو: بدون نیم‌فاصله، ارقام انگلیسی */
export function normalizeForSearch(input: string): string {
  return normalizePersian(input)
    .replace(/\u200c/g, '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fa-IR');
}

/** نویسه‌ی نیم‌فاصله برای تایپوگرافی متادیتا */
export function typographicText(input: string): string {
  return normalizePersian(input).replace(/\u200c/g, THIN_SPACE);
}

export type JoinForm = 'isolated' | 'final' | 'initial' | 'medial';

interface LetterForms {
  isolated: number;
  final: number;
  initial: number;
  medial: number;
}

/** جدول شکل‌های چهارگانه‌ی حروف فارسی/عربی (Unicode Presentation Forms-B) */
const LETTERS: Record<number, LetterForms> = (() => {
  const map: Record<number, LetterForms> = {};
  /** ترتیب: [کد حرف, isolated, final, initial, medial] — مقدار 0 یعنی این شکل وجود ندارد */
  const table: number[][] = [
    [0x0621, 0xfe80, 0, 0, 0],
    [0x0622, 0xfe81, 0xfe82, 0, 0],
    [0x0623, 0xfe83, 0xfe84, 0, 0],
    [0x0624, 0xfe85, 0xfe86, 0, 0],
    [0x0625, 0xfe87, 0xfe88, 0, 0],
    [0x0626, 0xfe89, 0xfe8a, 0xfe8b, 0xfe8c],
    [0x0627, 0xfe8d, 0xfe8e, 0, 0],
    [0x0628, 0xfe8f, 0xfe90, 0xfe91, 0xfe92],
    [0x0629, 0xfe93, 0xfe94, 0, 0],
    [0x062a, 0xfe95, 0xfe96, 0xfe97, 0xfe98],
    [0x062b, 0xfe99, 0xfe9a, 0xfe9b, 0xfe9c],
    [0x062c, 0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
    [0x062d, 0xfea1, 0xfea2, 0xfea3, 0xfea4],
    [0x062e, 0xfea5, 0xfea6, 0xfea7, 0xfea8],
    [0x062f, 0xfea9, 0xfeaa, 0, 0],
    [0x0630, 0xfeab, 0xfeac, 0, 0],
    [0x0631, 0xfead, 0xfeae, 0, 0],
    [0x0632, 0xfeaf, 0xfeb0, 0, 0],
    [0x0633, 0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4],
    [0x0634, 0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
    [0x0635, 0xfeb9, 0xfeba, 0xfebb, 0xfebc],
    [0x0636, 0xfebd, 0xfebe, 0xfebf, 0xfec0],
    [0x0637, 0xfec1, 0xfec2, 0xfec3, 0xfec4],
    [0x0638, 0xfec5, 0xfec6, 0xfec7, 0xfec8],
    [0x0639, 0xfec9, 0xfeca, 0xfecb, 0xfecc],
    [0x063a, 0xfecd, 0xfece, 0xfecf, 0xfed0],
    [0x0641, 0xfed1, 0xfed2, 0xfed3, 0xfed4],
    [0x0642, 0xfed5, 0xfed6, 0xfed7, 0xfed8],
    [0x0643, 0xfed9, 0xfeda, 0xfedb, 0xfedc],
    [0x0644, 0xfedd, 0xfede, 0xfedf, 0xfee0],
    [0x0645, 0xfee1, 0xfee2, 0xfee3, 0xfee4],
    [0x0646, 0xfee5, 0xfee6, 0xfee7, 0xfee8],
    [0x0647, 0xfee9, 0xfeea, 0xfeeb, 0xfeec],
    [0x0648, 0xfeed, 0xfeee, 0, 0],
    [0x0649, 0xfbe8, 0xfbe9, 0, 0],
    [0x064a, 0xfef1, 0xfef2, 0xfef3, 0xfef4],
    [0x067e, 0xfb56, 0xfb57, 0xfb58, 0xfb59], // پ
    [0x0686, 0xfb7a, 0xfb7b, 0xfb7c, 0xfb7d], // چ
    [0x0698, 0xfb8a, 0xfb8b, 0, 0], // ژ
    [0x06a9, 0xfb8e, 0xfb8f, 0xfb90, 0xfb91], // ک
    [0x06af, 0xfb92, 0xfb93, 0xfb94, 0xfb95], // گ
    [0x06cc, 0xfbfc, 0xfbfd, 0xfbfe, 0xfbff], // ی فارسی
    [0x0640, 0x0640, 0x0640, 0x0640, 0x0640], // کشیده
    // اعداد و علائم فارسی که به حرف بعدی نمی‌چسبند (در متن ترکیبی)
    [0x06f0, 0x06f0, 0, 0, 0],
    [0x06f1, 0x06f1, 0, 0, 0],
    [0x06f2, 0x06f2, 0, 0, 0],
    [0x06f3, 0x06f3, 0, 0, 0],
    [0x06f4, 0x06f4, 0, 0, 0],
    [0x06f5, 0x06f5, 0, 0, 0],
    [0x06f6, 0x06f6, 0, 0, 0],
    [0x06f7, 0x06f7, 0, 0, 0],
    [0x06f8, 0x06f8, 0, 0, 0],
    [0x06f9, 0x06f9, 0, 0, 0],
  ];
  for (const [cp, isolated, final, initial, medial] of table) {
    map[cp] = {
      isolated,
      final: final || isolated,
      initial: initial || isolated,
      medial: medial || isolated,
    };
  }
  return map;
})();

/**
 * Does the letter join the NEXT letter (to its left)? True iff it has a real
 * "initial" form distinct from "isolated" (the table fills missing forms with
 * the isolated codepoint, so inequality means the form really exists).
 * Exception: tatweel (U+0640) joins both sides although all four forms match.
 */
function joinsNext(cp: number): boolean {
  if (cp === 0x0640) return true; // tatweel
  const forms = LETTERS[cp];
  if (!forms) return false;
  return forms.initial !== forms.isolated;
}

/** Does the letter accept a join from the PREVIOUS letter (to its right)? */
function joinsPrevious(cp: number): boolean {
  if (cp === 0x0640) return true; // tatweel
  const forms = LETTERS[cp];
  if (!forms) return false;
  return forms.final !== forms.isolated;
}

/**
 * تبدیل متن به شکل‌های نمایشی فارسی (جایگزین GSUB در موتور PDF)
 * نویسه‌های غیرعربی (لاتین، رقم، فاصله، علائم) بدون تغییر می‌مانند.
 */
export function shapePersian(text: string): string {
  const cps = [...normalizePersian(text)].map((ch) => ch.codePointAt(0) ?? 0);
  const out: number[] = [];
  // بعد از ligature لا/لآ، حرف قبلیِ واقعی «لام» است که به حرف بعدی می‌چسبد
  let prevJoinsOverride = false;
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    if (cp === 0x200c) {
      out.push(cp);
      prevJoinsOverride = false; // نیم‌فاصله اتصال را می‌شکند
      continue;
    }
    const forms = LETTERS[cp];
    if (!forms) {
      out.push(cp);
      prevJoinsOverride = false;
      continue;
    }
    // لا: لام + الف → گلیف لا
    if (cp === 0x0644 && i + 1 < cps.length && (cps[i + 1] === 0x0627 || cps[i + 1] === 0x0622)) {
      const alef = cps[i + 1];
      const prevJoins = prevJoinsOverride || (i > 0 && joinsNext(cps[i - 1]));
      const ligatures: Record<number, [number, number]> = {
        0x0627: [0xfefb, 0xfefc],
        0x0622: [0xfef5, 0xfef6],
      };
      const pair = ligatures[alef];
      out.push(prevJoins ? pair[1] : pair[0]);
      i++;
      prevJoinsOverride = true; // حرف بعدی به «لام» می‌چسبد
      continue;
    }
    const prev = i > 0 ? cps[i - 1] : 0;
    const next = i + 1 < cps.length ? cps[i + 1] : 0;
    const prevJoins = prevJoinsOverride || (prev !== 0 && joinsNext(prev));
    prevJoinsOverride = false;
    const nextJoins = next !== 0 && joinsPrevious(next);
    const form: JoinForm = prevJoins
      ? nextJoins
        ? 'medial'
        : 'final'
      : nextJoins
        ? 'initial'
        : 'isolated';
    out.push(forms[form]);
  }
  return String.fromCodePoint(...out);
}

/** ارقام (لاتین/عربی/فارسی) در متن راست‌به‌چپ به‌صورت چپ‌به‌راست نمایش داده می‌شوند */
export function isDigitChar(cp: number): boolean {
  return (
    (cp >= 0x30 && cp <= 0x39) || (cp >= 0x0660 && cp <= 0x0669) || (cp >= 0x06f0 && cp <= 0x06f9)
  );
}

/** آیا نویسه جهت راست‌به‌چپ دارد؟ */
function isRtlChar(cp: number): boolean {
  if (isDigitChar(cp)) return false;
  return (
    (cp >= 0x0590 && cp <= 0x08ff) ||
    (cp >= 0xfb1d && cp <= 0xfdfd) ||
    (cp >= 0xfe70 && cp <= 0xfefc)
  );
}

function isNeutral(cp: number): boolean {
  return (
    cp === 0x20 ||
    (cp >= 0x09 && cp <= 0x0d) ||
    // zero-width format chars (ZWNJ/ZWJ/word-joiner/BOM) behave as neutral (UAX#9 BN)
    cp === 0x200c ||
    cp === 0x200d ||
    cp === 0x2060 ||
    cp === 0xfeff ||
    // math signs: minus, plus-minus, multiply, divide, less/greater-or-equal
    cp === 0x2212 ||
    cp === 0x00b1 ||
    cp === 0x00d7 ||
    cp === 0x00f7 ||
    cp === 0x2264 ||
    cp === 0x2265 ||
    // punctuation
    '.,:;!?()[]{}-+/\\|\'"<>~^&*،؛؟٬٫…–—«»‹›٪'.includes(String.fromCodePoint(cp))
  );
}

/**
 * چینش bidi سبک (کافی برای فاکتور): بلوک‌های فارسی به ترتیب معکوس،
 * اعداد و واژه‌های لاتین به ترتیب اصلی خود می‌مانند.
 */
/** جفت‌های آینه‌ای: در متن راست‌به‌چپ شکل ظاهری‌شان برعکس می‌شود (UAX#9, L4) */
const MIRROR_PAIRS: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
};

/**
 * نسخه‌ی generic همان الگوریتم bidi روی آرایه‌ی «سلول‌ها».
 * کاربرد: موتور PDF هر گلیف را با موقعیت دقیق خودش (Tm) رسم می‌کند، پس ترتیب
 * انتشار Tj در استریم محتوا می‌تواند «منطقی» باشد (برای کپی/جستجو در همه‌ی خواننده‌ها)
 * و در همان حال هر گلیف در جای دیداری درست قرار می‌گیرد.
 */
export function bidiReorderCells<T>(
  cells: T[],
  codePointOf: (cell: T) => number,
  withChar: (cell: T, ch: string) => T,
): T[] {
  const cps = cells.map(codePointOf);
  // طبقه‌بندی ساده‌ی UAX#9: RTL، LTR، اعداد و خنثی
  type Kind = 'rtl' | 'ltr' | 'num' | 'neutral';
  const kind = (cp: number): Kind =>
    isNeutral(cp) ? 'neutral' : isDigitChar(cp) ? 'num' : isRtlChar(cp) ? 'rtl' : 'ltr';
  const kinds: Kind[] = cps.map(kind);

  // اعداد + جداکننده‌های داخلی (٬ ٫ , . / : -) یک «توکن عدد» چپ‌به‌راست می‌سازند
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] !== 'num') continue;
    let j = i + 1;
    while (
      j < kinds.length &&
      (kinds[j] === 'num' ||
        (kinds[j] === 'neutral' &&
          '٬٫,.:/-'.includes(String.fromCodePoint(cps[j])) &&
          kinds[j + 1] === 'num'))
    ) {
      if (kinds[j] === 'neutral') kinds[j] = 'num';
      kinds[j] = 'num';
      j++;
    }
    kinds[i] = 'ltr';
    for (let k = i + 1; k < j; k++) kinds[k] = 'ltr';
    i = j - 1;
  }

  // N1/N2: خنثی‌های بین دو بلوک هم‌جهت همان جهت را می‌گیرند، وگرنه جهت پاراگراف (RTL)
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] !== 'neutral') continue;
    let j = i;
    while (j < kinds.length && kinds[j] === 'neutral') j++;
    const before = i > 0 ? kinds[i - 1] : null;
    const after = j < kinds.length ? kinds[j] : null;
    // N1/N2: دو طرف هم‌جهت → همان جهت؛ در غیر این صورت (یا نبود یک طرف) جهت پاراگراف که RTL است
    const dir: Kind = before && after && before === after ? before : 'rtl';
    for (let k = i; k < j; k++) kinds[k] = dir;
    i = j - 1;
  }
  if (kinds.length && kinds[0] === 'neutral') kinds[0] = 'rtl';

  const runs: { rtl: boolean; cells: T[] }[] = [];
  for (let i = 0; i < cps.length; i++) {
    const rtl = kinds[i] === 'rtl';
    const ch = String.fromCodePoint(cps[i]);
    // پرانتز، گیومه و کروشه در بلوک راست‌به‌چپ باید آینه شوند
    const glyph = rtl && MIRROR_PAIRS[ch] ? MIRROR_PAIRS[ch] : ch;
    const cell = glyph === ch ? cells[i] : withChar(cells[i], glyph);
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl) last.cells.push(cell);
    else runs.push({ rtl, cells: [cell] });
  }
  return runs
    .map((run) => (run.rtl ? [...run.cells].reverse() : run.cells))
    .reverse()
    .reduce<T[]>((acc, run) => acc.concat(run), []);
}

export function bidiReorder(text: string): string {
  return bidiReorderCells(
    [...text],
    (ch) => ch.codePointAt(0) ?? 0,
    (_ch, glyph) => glyph,
  ).join('');
}

/**
 * نگاشت شکل‌های نمایشی (Arabic Presentation Forms-B, U+FB50–U+FEFF) به نویسه‌های پایه.
 * برای ToUnicodeِ فونت لازم است: گلیف شکل نمایشی باید در متن استخراج‌شده به حرف اصلی
 * (نه به کد FBxx/FExx) نگاشت شود تا کپی/جستجو با حروف معمولی کار کند.
 * legature لا/لآ به دو نویسه‌ی «لام + الف» نگاشت می‌شود.
 */
export function presentationToBase(cp: number): number[] | null {
  if (cp < 0xfb50 || cp > 0xfeff) return null;
  // legatureهای لا/لآ که در shapePersian ساخته می‌شوند
  if (cp === 0xfefb || cp === 0xfefc) return [0x0644, 0x0627];
  if (cp === 0xfef5 || cp === 0xfef6) return [0x0644, 0x0622];
  for (const [base, forms] of Object.entries(LETTERS)) {
    const b = Number(base);
    if (
      forms.isolated === cp ||
      forms.final === cp ||
      forms.initial === cp ||
      forms.medial === cp
    ) {
      return [b];
    }
  }
  return null;
}

/** متن آماده‌ی رسم روی PDF: شکل‌دهی + چینش راست‌به‌چپ */
export function toVisualText(text: string): string {
  return bidiReorder(shapePersian(text));
}

/** ارقام فارسی + جداکننده‌ی هزارگان فارسی */
export function faNumber(value: number, maxFraction = 0): string {
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: maxFraction }).format(value);
}

/**
 * فاصله‌ی محافظت‌شده برای جلوگیری از چسبیدن عدد به واژه در چینش دوجهته
 * (در PDF به فاصله‌ی نازک تبدیل می‌شود تا همان اندازه‌ی فاصله‌ی معمولی را داشته باشد)
 */
export const WORD_JOINER = '\u2060';

/** ارقام فارسی بدون جداکننده (برای شماره‌ها/تاریخ) */
export function faDigits(value: string | number): string {
  return toFaDigits(value);
}

export function isPersianText(text: string): boolean {
  return [...text].some((ch) => isRtlChar(ch.codePointAt(0) ?? 0));
}
