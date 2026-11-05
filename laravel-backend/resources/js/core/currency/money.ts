/**
 * محاسبات حساس پول: تعداد و درصد با مقیاس ثابتِ صحیح، بدون ضرب/تقسیم اعشاری.
 * خروجی مبلغ، تومان صحیح و در محدودهٔ Number.isSafeInteger است.
 * گردکردن فقط یک‌بار و در انتهای محاسبهٔ هر ردیف/درصد انجام می‌شود (نیم به بالا).
 */
const SCALE = 1_000_000n;
const MAX_MONEY = BigInt(Number.MAX_SAFE_INTEGER);

export function assertMoney(value: number, label = 'مبلغ'): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} باید تومان صحیح، غیرمنفی و در محدودهٔ مجاز باشد.`);
  }
  return value;
}

/** تبدیل دقیق عدد اعشاریِ غیرمنفی به واحد صحیح با شش رقم اعشار. */
export function decimalUnits(value: number, label = 'مقدار'): bigint {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} معتبر نیست.`);
  const normalized = String(value)
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`${label} باید عدد معمولی با حداکثر شش رقم اعشار باشد.`);
  }
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > 6) throw new Error(`${label} حداکثر شش رقم اعشار می‌تواند داشته باشد.`);
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0') || '0');
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function toSafeMoney(value: bigint): number {
  if (value < 0n || value > MAX_MONEY) throw new Error('مبلغ از محدودهٔ محاسبات ایمن خارج است.');
  return Number(value);
}

export function quantityAmount(quantity: number, unitPrice: number): number {
  assertMoney(unitPrice, 'قیمت واحد');
  return toSafeMoney(divideRounded(decimalUnits(quantity, 'تعداد') * BigInt(unitPrice), SCALE));
}

export function percentageAmount(base: number, percent: number): number {
  assertMoney(base, 'مبنای درصد');
  const units = decimalUnits(percent, 'درصد');
  if (units > 100n * SCALE) throw new Error('درصد باید بین صفر و صد باشد.');
  return toSafeMoney(divideRounded(BigInt(base) * units, 100n * SCALE));
}

export function sumMoney(values: Iterable<number>): number {
  let total = 0n;
  for (const value of values) total += BigInt(assertMoney(value));
  return toSafeMoney(total);
}
