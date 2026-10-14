#!/usr/bin/env node
/**
 * به‌روزرسانی نرخ‌های پیش‌فرض ارز، طلا، نقره و سکه در برنامه
 * ─────────────────────────────────────────────────────────────
 * نرخ‌های بازار آزاد را از وب‌سرویس‌های عمومی می‌خواند و بخش مشخص‌شده با
 * نشانگرهای <auto-rates> در src/core/calc/units.ts را بازنویسی می‌کند.
 *
 * اجرا:
 *   npm run rates:update                      ← دریافت زنده از اینترنت
 *   node scripts/update-rates.mjs --dry-run   ← فقط نمایش، بدون نوشتن
 *   node scripts/update-rates.mjs --from-file fixture.json [--target units-copy.ts]
 *
 * منابع (به‌ترتیب تلاش؛ اولین پاسخ سالم برنده است):
 *   ۱) BrsApi رایگان بدون کلید (v2 و v1) — https://brsapi.ir
 *   ۲) BrsApi Pro با کلید BRSAPI_KEY (کلید رایگان از سایتشان بگیرید)؛
 *      اگر کلید ندهید از کلید تستِ عمومیِ منتشرشده در مستندات خود BrsApi استفاده می‌شود.
 *   ۳) TGJU ajax (call1.tgju.org)
 *
 * قیمت‌ها ممکن است ریالی باشند؛ با نرخ دلار تشخیص داده و به تومان تبدیل می‌شوند.
 * اگر هیچ منبعی پاسخ سالم ندهد، فایل دست‌نخورده می‌ماند و اسکریپت با خطا خارج می‌شود
 * (در GitHub Actions این گام continue-on-error است تا انتشار هرگز متوقف نشود).
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TARGET = path.join(SCRIPT_DIR, '..', 'src', 'core', 'calc', 'units.ts');
const DEMO_KEY = 'FreeSV0E1LSgB9RDjuf0QorSLViX8pPG'; // کلید تست عمومی مستندات BrsApi

/** کدهای مقصد در برنامه + راه‌های پیدا کردنشان در پاسخ منابع مختلف */
const TARGETS = [
  { code: 'USD', label: 'دلار آمریکا', min: 20_000, max: 2_000_000, symbols: ['usd', 'price_dollar_rl'], names: ['دلار آمریکا'] },
  { code: 'EUR', label: 'یورو', min: 20_000, max: 2_500_000, symbols: ['eur', 'price_eur'], names: ['یورو'] },
  { code: 'GBP', label: 'پوند انگلیس', min: 20_000, max: 3_000_000, symbols: ['gbp', 'price_gbp'], names: ['پوند انگلیس', 'پوند'] },
  { code: 'AED', label: 'درهم امارات', min: 5_000, max: 600_000, symbols: ['aed', 'price_aed'], names: ['درهم امارات', 'درهم'] },
  { code: 'CAD', label: 'دلار کانادا', min: 10_000, max: 1_500_000, symbols: ['cad', 'price_cad'], names: ['دلار کانادا'] },
  { code: 'TRY', label: 'لیر ترکیه', min: 500, max: 50_000, symbols: ['try', 'price_try'], names: ['لیر ترکیه', 'لیر'] },
  { code: 'GOLD18', label: 'طلای ۱۸ عیار (هر گرم)', min: 2_000_000, max: 120_000_000, symbols: ['geram18', 'irg18', 'tgju_gold_irg18'], names: ['گرم طلای 18 عیار', 'طلای 18 عیار'] },
  { code: 'GOLD24', label: 'طلای ۲۴ عیار (هر گرم)', min: 2_500_000, max: 160_000_000, symbols: ['geram24', 'gold_24k'], names: ['گرم طلای 24 عیار', 'طلای 24 عیار'] },
  { code: 'SILVER999', label: 'نقره ۹۹۹ (هر گرم)', min: 50_000, max: 3_000_000, symbols: ['silver_999', 'silver999', 'silver'], names: ['نقره 999', 'گرم نقره 999', 'نقره'] },
  { code: 'SEKEE', label: 'سکه امامی', min: 30_000_000, max: 1_500_000_000, symbols: ['sekee', 'retail_sekee'], names: ['سکه امامی'] },
  { code: 'NIM', label: 'نیم سکه', min: 15_000_000, max: 900_000_000, symbols: ['nim', 'retail_nim'], names: ['نیم سکه'] },
  { code: 'ROB', label: 'ربع سکه', min: 8_000_000, max: 700_000_000, symbols: ['rob', 'retail_rob'], names: ['ربع سکه'] },
];
const REQUIRED = ['USD', 'GOLD18'];

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faToEnDigits = (s) => String(s).replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
const enToFaDigits = (s) => String(s).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
const normalizeText = (s) => faToEnDigits(s ?? '').replace(/[\s‌]/g, '').toLowerCase();

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(faToEnDigits(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** همه‌ی آیتم‌های قیمت را از شکل‌های مختلف پاسخ یکدست بیرون می‌کشد: [{symbol, name, price}] */
function flattenPayload(payload) {
  const items = [];
  const push = (symbol, name, raw) => {
    const price = toNumber(raw?.price ?? raw?.last ?? raw?.p ?? raw?.value);
    if (price > 0) items.push({ symbol: normalizeText(symbol ?? raw?.symbol ?? raw?.code), name: normalizeText(name ?? raw?.name ?? raw?.title), price });
  };
  if (!payload || typeof payload !== 'object') return items;
  if (payload.current && typeof payload.current === 'object') {
    for (const [key, value] of Object.entries(payload.current)) push(key, '', value);
  }
  for (const section of ['gold', 'currency', 'coin', 'cryptocurrency']) {
    if (Array.isArray(payload[section])) for (const item of payload[section]) push(item?.symbol ?? item?.code, item?.name ?? item?.title, item);
  }
  if (Array.isArray(payload)) for (const item of payload) push(item?.symbol ?? item?.code, item?.name ?? item?.title, item);
  return items;
}

function extractRates(payload) {
  const items = flattenPayload(payload);
  if (items.length === 0) return null;
  const bySymbol = new Map(items.map((i) => [i.symbol, i.price]));
  const byName = new Map(items.map((i) => [i.name, i.price]));

  const rawUsd = TARGETS[0].symbols.map((s) => bySymbol.get(s)).find(Boolean) ??
    TARGETS[0].names.map((n) => byName.get(normalizeText(n))).find(Boolean) ?? 0;
  if (!rawUsd) return null;
  const divisor = rawUsd >= 1_000_000 ? 10 : 1; // ریال → تومان

  const rates = {};
  for (const t of TARGETS) {
    let raw = t.symbols.map((s) => bySymbol.get(s)).find(Boolean);
    if (!raw) raw = t.names.map((n) => byName.get(normalizeText(n))).find(Boolean);
    if (!raw) continue;
    const toman = Math.round(raw / divisor);
    if (toman < t.min || toman > t.max) {
      console.warn(`⚠ نرخ ${t.code} خارج از بازه‌ی سلامت بود و رد شد: ${toman.toLocaleString('en-US')} تومان`);
      continue;
    }
    rates[t.code] = toman;
  }
  return rates;
}

async function fetchJson(url, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'KarenYar-RatesBot/1.0 (+https://github.com/rahmaniho/KarenYar)', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRates() {
  const key = process.env.BRSAPI_KEY || DEMO_KEY;
  const sources = [
    ['BrsApi v2 (بدون کلید)', 'https://brsapi.ir/FreeTsetmcBourseApi/Api_Free_Gold_Currency_v2.json'],
    ['BrsApi v1 (بدون کلید)', 'https://brsapi.ir/FreeTsetmcBourseApi/Api_Free_Gold_Currency.json'],
    ['BrsApi Pro', `https://Api.BrsApi.ir/Market/Gold_Currency_Pro.php?key=${encodeURIComponent(key)}&section=gold%2Ccurrency`],
    ['TGJU', 'https://call1.tgju.org/ajax.json'],
  ];
  for (const [name, url] of sources) {
    try {
      console.log(`→ تلاش از منبع: ${name}`);
      const rates = extractRates(await fetchJson(url));
      if (rates && REQUIRED.every((c) => rates[c])) return { source: name, rates };
      console.warn(`  پاسخ این منبع کامل نبود.`);
    } catch (error) {
      console.warn(`  ناموفق: ${error.message}`);
    }
  }
  return null;
}

/** تاریخ امروز شمسی مثل «۲۳ مهر ۱۴۰۵» */
function todayJalaliFa() {
  const parts = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return enToFaDigits(`${get('day')} ${get('month')} ${get('year')}`).replace(/\s+/g, ' ').trim();
}

const formatRate = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fromFile = args.includes('--from-file') ? args[args.indexOf('--from-file') + 1] : null;
  const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : DEFAULT_TARGET;

  let result = null;
  if (fromFile) {
    console.log(`→ خواندن از فایل محلی: ${fromFile}`);
    const rates = extractRates(JSON.parse(await readFile(fromFile, 'utf8')));
    if (rates && REQUIRED.every((c) => rates[c])) result = { source: 'فایل محلی', rates };
  } else {
    result = await fetchRates();
  }
  if (!result) {
    console.error('✗ هیچ منبعی نرخ سالم نداد؛ فایل بدون تغییر ماند.');
    process.exit(1);
  }
  console.log(`✓ منبع: ${result.source} — ${Object.keys(result.rates).length} نرخ دریافت شد.`);

  const sourceText = await readFile(target, 'utf8');
  const existing = {};
  for (const m of sourceText.matchAll(/code: '([A-Z0-9-]+)'[^}]*?rateToToman: ([\d_]+)/g)) {
    existing[m[1]] = Number(m[2].replace(/_/g, ''));
  }

  const lines = TARGETS.filter((t) => result.rates[t.code] ?? existing[t.code]).map((t) => {
    const value = result.rates[t.code] ?? existing[t.code];
    const fresh = result.rates[t.code] ? '' : ' // (از منبع امروز نیامد؛ مقدار قبلی حفظ شد)';
    return `  { code: '${t.code}', label: '${t.label}', rateToToman: ${formatRate(value)} },${fresh}`;
  });

  const blockRe = /(  \/\/ <auto-rates>[^\n]*\n)[\s\S]*?(  \/\/ <\/auto-rates>)/;
  if (!blockRe.test(sourceText)) {
    console.error('✗ نشانگرهای <auto-rates> در فایل مقصد پیدا نشد.');
    process.exit(1);
  }
  const updated = sourceText
    .replace(blockRe, `$1${lines.join('\n')}\n$2`)
    .replace(/export const CURRENCY_RATES_UPDATED_AT = '[^']*';/, `export const CURRENCY_RATES_UPDATED_AT = '${todayJalaliFa()}';`);

  if (dryRun) {
    console.log('— حالت dry-run؛ خطوط جدید:');
    console.log(lines.join('\n'));
    return;
  }
  await writeFile(target, updated, 'utf8');
  console.log(`✓ فایل به‌روز شد: ${path.relative(process.cwd(), target)} (تاریخ نمایشی: ${todayJalaliFa()})`);
}

main().catch((error) => {
  console.error('✗ خطای پیش‌بینی‌نشده:', error);
  process.exit(1);
});
