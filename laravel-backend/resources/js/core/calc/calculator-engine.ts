/**
 * موتور ماشین‌حساب علمی — تجزیه و ارزیابی امن عبارت ریاضی (بدون eval)
 * پشتیبانی: + − × ÷ توان، پرانتز، درصد (%) و باقیمانده، فاکتوریل (!)،
 * ضرب ضمنی (مثل 2(3+1) و 2π و ‎(1+1)(2+2)‎)،
 * توابع sin cos tan asin acos atan log ln sqrt abs exp و ثابت‌های π و e
 * ارقام فارسی و نمادهای × ÷ − هم پذیرفته می‌شوند.
 */
import { toEnDigits } from '../currency/currency';

export class CalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalcError';
  }
}

export type AngleMode = 'deg' | 'rad';

type Token =
  | { type: 'number'; value: number }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'func'; value: string }
  | { type: 'const'; value: number };

const FUNCTIONS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'abs', 'exp'];

function tokenize(rawInput: string): Token[] {
  const input = toEnDigits(rawInput)
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/\s+/g, '');
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i])) num += input[i++];
      const value = Number(num);
      if (!Number.isFinite(value)) throw new CalcError('عدد نامعتبر است');
      tokens.push({ type: 'number', value });
      continue;
    }
    if ('+-*/%^!'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      let word = '';
      while (i < input.length && /[a-z]/i.test(input[i])) word += input[i++];
      const lower = word.toLowerCase();
      if (lower === 'pi') tokens.push({ type: 'const', value: Math.PI });
      else if (lower === 'e') tokens.push({ type: 'const', value: Math.E });
      else if (FUNCTIONS.includes(lower)) tokens.push({ type: 'func', value: lower });
      else throw new CalcError(`تابع ناشناخته: ${word}`);
      continue;
    }
    throw new CalcError(`نویسه‌ی نامعتبر: ${ch}`);
  }
  return tokens;
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new CalcError('فاکتوریل فقط برای اعداد صحیح نامنفی است');
  if (n > 170) throw new CalcError('عدد برای فاکتوریل خیلی بزرگ است');
  let result = 1;
  for (let k = 2; k <= n; k++) result *= k;
  return result;
}

/**
 * ضرب ضمنی: بین دو توکنِ مقدار که پشت سر هم آمده‌اند (عدد/ثابت/پرانتز بسته/فاکتوریل
 * و بعدش عدد/ثابت/پرانتز باز/تابع) یک «×» درج می‌شود؛ مثل 2(3+1) یا 3sin(90).
 * روی % دست نمی‌زنیم تا باقیمانده‌ی 10%3 و درصدِ 50% سر جایشان بمانند.
 */
function insertImplicitMultiplication(tokens: Token[]): Token[] {
  const endsValue = (t: Token): boolean =>
    t.type === 'number' ||
    t.type === 'const' ||
    t.type === 'rparen' ||
    (t.type === 'op' && t.value === '!');
  const startsValue = (t: Token): boolean =>
    t.type === 'number' || t.type === 'const' || t.type === 'lparen' || t.type === 'func';
  const result: Token[] = [];
  for (const token of tokens) {
    const prev = result[result.length - 1];
    if (prev && endsValue(prev) && startsValue(token)) result.push({ type: 'op', value: '*' });
    result.push(token);
  }
  return result;
}

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private angleMode: AngleMode,
  ) {}

  parse(): number {
    if (this.tokens.length === 0) throw new CalcError('عبارت خالی است');
    const value = this.parseExpr();
    if (this.pos < this.tokens.length) throw new CalcError('عبارت ناقص یا نامعتبر است');
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private parseExpr(): number {
    let value = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token?.type === 'op' && (token.value === '+' || token.value === '-')) {
        this.pos++;
        const rhs = this.parseTerm();
        value = token.value === '+' ? value + rhs : value - rhs;
      } else return value;
    }
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    for (;;) {
      const token = this.peek();
      if (token?.type !== 'op') return value;
      if (token.value === '%') {
        // ٪ هوشمند: اگر بعدش مقداری بیاید «باقیمانده» است (10%3)،
        // وگرنه درصدِ خود عدد است (50% ← ۰٫۵ و 200*10% ← ۲۰)
        const after = this.tokens[this.pos + 1];
        const followedByValue =
          after?.type === 'number' ||
          after?.type === 'const' ||
          after?.type === 'lparen' ||
          after?.type === 'func';
        this.pos++;
        if (!followedByValue) {
          value = value / 100;
          continue;
        }
        const rhs = this.parseFactor();
        if (rhs === 0) throw new CalcError('تقسیم بر صفر ممکن نیست');
        value %= rhs;
        continue;
      }
      if (token.value === '*' || token.value === '/') {
        this.pos++;
        const rhs = this.parseFactor();
        if (token.value === '*') value *= rhs;
        else {
          if (rhs === 0) throw new CalcError('تقسیم بر صفر ممکن نیست');
          value /= rhs;
        }
      } else return value;
    }
  }

  private parseFactor(): number {
    const base = this.parseUnary();
    const token = this.peek();
    if (token?.type === 'op' && token.value === '^') {
      this.pos++;
      const exponent = this.parseFactor(); // توان راست‌گرد است: ۲^۳^۲ = ۲^(۳^۲)
      return Math.pow(base, exponent);
    }
    return base;
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token?.type === 'op' && (token.value === '-' || token.value === '+')) {
      this.pos++;
      const value = this.parseUnary();
      return token.value === '-' ? -value : value;
    }
    return this.parsePostfix();
  }

  private parsePostfix(): number {
    let value = this.parsePrimary();
    for (;;) {
      const token = this.peek();
      if (token?.type === 'op' && token.value === '!') {
        this.pos++;
        value = factorial(value);
      } else return value;
    }
  }

  private parsePrimary(): number {
    const token = this.peek();
    if (!token) throw new CalcError('عبارت ناتمام است');
    if (token.type === 'number' || token.type === 'const') {
      this.pos++;
      return token.value;
    }
    if (token.type === 'lparen') {
      this.pos++;
      const value = this.parseExpr();
      if (this.peek()?.type !== 'rparen') throw new CalcError('پرانتز بسته گمشده است');
      this.pos++;
      return value;
    }
    if (token.type === 'func') {
      this.pos++;
      if (this.peek()?.type !== 'lparen')
        throw new CalcError(`بعد از ${token.value} باید پرانتز بیاید`);
      this.pos++;
      const arg = this.parseExpr();
      if (this.peek()?.type !== 'rparen') throw new CalcError('پرانتز بسته گمشده است');
      this.pos++;
      return this.applyFunction(token.value, arg);
    }
    throw new CalcError('عبارت نامعتبر است');
  }

  private toAngle(x: number): number {
    return this.angleMode === 'deg' ? (x * Math.PI) / 180 : x;
  }
  private fromAngle(x: number): number {
    return this.angleMode === 'deg' ? (x * 180) / Math.PI : x;
  }

  private applyFunction(name: string, arg: number): number {
    switch (name) {
      case 'sin':
        return Math.sin(this.toAngle(arg));
      case 'cos':
        return Math.cos(this.toAngle(arg));
      case 'tan':
        return Math.tan(this.toAngle(arg));
      case 'asin':
        if (arg < -1 || arg > 1) throw new CalcError('ورودی asin باید بین ‎-۱‎ و ۱ باشد');
        return this.fromAngle(Math.asin(arg));
      case 'acos':
        if (arg < -1 || arg > 1) throw new CalcError('ورودی acos باید بین ‎-۱‎ و ۱ باشد');
        return this.fromAngle(Math.acos(arg));
      case 'atan':
        return this.fromAngle(Math.atan(arg));
      case 'log':
        if (arg <= 0) throw new CalcError('لگاریتم عدد نامثبت تعریف نشده است');
        return Math.log10(arg);
      case 'ln':
        if (arg <= 0) throw new CalcError('لگاریتم عدد نامثبت تعریف نشده است');
        return Math.log(arg);
      case 'sqrt':
        if (arg < 0) throw new CalcError('جذر عدد منفی تعریف نشده است');
        return Math.sqrt(arg);
      case 'abs':
        return Math.abs(arg);
      case 'exp':
        return Math.exp(arg);
      default:
        throw new CalcError(`تابع ناشناخته: ${name}`);
    }
  }
}

/** ارزیابی عبارت ریاضی — در صورت خطا CalcError با پیام فارسی پرتاب می‌شود. */
export function evaluate(expression: string, angleMode: AngleMode = 'deg'): number {
  const result = new Parser(insertImplicitMultiplication(tokenize(expression)), angleMode).parse();
  if (!Number.isFinite(result) || Number.isNaN(result)) {
    throw new CalcError('نتیجه‌ی محاسبه معتبر نیست');
  }
  // حذف خطای موی اعشار (مثل 0.1+0.2)
  return Math.round(result * 1e12) / 1e12;
}
