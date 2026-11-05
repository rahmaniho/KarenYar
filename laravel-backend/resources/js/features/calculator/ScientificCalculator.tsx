import { useCallback, useEffect, useRef, useState } from 'react';
import { Delete, History, Sigma, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalcError, evaluate, type AngleMode } from '@/core/calc/calculator-engine';
import { formatDecimal, parseAmountInput, toEnDigits, toFaDigits } from '@/core/currency/currency';
import { cn } from '@/lib/utils';

interface HistoryEntry {
  expr: string;
  result: string;
}

const HISTORY_KEY = 'hesabyar-calc-history';

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryEntry[];
  } catch {
    return [];
  }
}

const BASIC_KEYS: { label: string; value: string; kind?: 'op' | 'action' | 'equals' }[] = [
  { label: 'C', value: 'clear', kind: 'action' },
  { label: '(', value: '(' },
  { label: ')', value: ')' },
  { label: '÷', value: '/', kind: 'op' },
  { label: '۷', value: '7' },
  { label: '۸', value: '8' },
  { label: '۹', value: '9' },
  { label: '×', value: '*', kind: 'op' },
  { label: '۴', value: '4' },
  { label: '۵', value: '5' },
  { label: '۶', value: '6' },
  { label: '−', value: '-', kind: 'op' },
  { label: '۱', value: '1' },
  { label: '۲', value: '2' },
  { label: '۳', value: '3' },
  { label: '+', value: '+', kind: 'op' },
  { label: '±', value: 'negate', kind: 'action' },
  { label: '۰', value: '0' },
  { label: '.', value: '.' },
  { label: '=', value: 'equals', kind: 'equals' },
];

const SCIENTIFIC_KEYS: { label: string; value: string }[] = [
  { label: 'sin', value: 'sin(' },
  { label: 'cos', value: 'cos(' },
  { label: 'tan', value: 'tan(' },
  { label: 'π', value: 'pi' },
  { label: 'ln', value: 'ln(' },
  { label: 'log', value: 'log(' },
  { label: '√', value: 'sqrt(' },
  { label: 'e', value: 'e' },
  { label: 'x²', value: '^2' },
  { label: 'xʸ', value: '^' },
  { label: 'n!', value: '!' },
  { label: '%', value: '%' },
  { label: 'asin', value: 'asin(' },
  { label: 'acos', value: 'acos(' },
  { label: 'atan', value: 'atan(' },
  { label: '|x|', value: 'abs(' },
];

export function ScientificCalculator() {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<string | null>(null);
  /** آخرین جواب عددی — برای ادامه‌ی محاسبه از روی نتیجه (ANS) */
  const [ans, setAns] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scientific, setScientific] = useState(false);
  const [angleMode, setAngleMode] = useState<AngleMode>('deg');
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const displayRef = useRef<HTMLDivElement>(null);

  const persistHistory = (next: HistoryEntry[]) => {
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const calculate = useCallback(() => {
    if (!expr.trim()) return;
    try {
      const value = evaluate(expr, angleMode);
      const formatted = formatDecimal(value, 10);
      setAns(value);
      setResult(formatted);
      setError(null);
      persistHistory([{ expr, result: formatted }, ...history].slice(0, 20));
    } catch (err) {
      setError(err instanceof CalcError ? err.message : 'خطا در محاسبه');
      setResult(null);
    }
  }, [expr, angleMode, history]);

  const press = useCallback(
    (value: string) => {
      setError(null);
      if (value === 'clear') {
        setExpr('');
        setResult(null);
        return;
      }
      if (value === 'equals') {
        calculate();
        return;
      }
      if (value === 'negate') {
        // ± روی کل عبارت اعمال می‌شود: «3+5» ← «-(3+5)» و برعکس
        setExpr((prev) => {
          if (!prev) return prev;
          if (prev.startsWith('-(') && prev.endsWith(')')) return prev.slice(2, -1);
          const hasBinaryOp = /[+*/%^!]/.test(prev) || prev.slice(1).includes('-');
          if (hasBinaryOp) return `-(${prev})`;
          return prev.startsWith('-') ? prev.slice(1) : `-${prev}`;
        });
        return;
      }
      // اگر نتیجه نمایش داده شده و کلید عددی زده شد، از نو شروع کن
      if (result !== null && /^[0-9.(]|sin|cos|tan|ln|log|sqrt|asin|acos|atan|abs/.test(value)) {
        setExpr(value);
        setResult(null);
        return;
      }
      if (result !== null && '+-*/^%!'.includes(value)) {
        // ادامه از روی جواب قبلی (ANS)، نه عبارت قدیمی
        if (ans !== null) setExpr(`${ans}${value}`);
        setResult(null);
        return;
      }
      setExpr((prev) => prev + value);
    },
    [calculate, result, ans],
  );

  const backspace = useCallback(() => {
    setError(null);
    setResult(null);
    setExpr((prev) => {
      // حذف توکن تابعی مثل sin( به‌صورت یکجا
      const funcMatch = prev.match(/(asin|acos|atan|sin|cos|tan|log|sqrt|abs|ln)\($/);
      if (funcMatch) return prev.slice(0, prev.length - funcMatch[0].length);
      return prev.slice(0, -1);
    });
  }, []);

  // پشتیبانی از صفحه‌کلید فیزیکی
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input, textarea, select')) return;
      const key = toEnDigits(event.key);
      if (/^[0-9.]$/.test(key)) press(key);
      else if ('+-*/%^!()'.includes(key)) press(key);
      else if (key === 'Enter' || key === '=') {
        event.preventDefault();
        calculate();
      } else if (key === 'Backspace') backspace();
      else if (key === 'Escape') press('clear');
      displayRef.current?.scrollIntoView({ block: 'nearest' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, calculate, backspace]);

  const displayExpr = toFaDigits(
    expr.replaceAll('*', '×').replaceAll('/', '÷').replaceAll('-', '−'),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sigma className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
            ماشین‌حساب
          </CardTitle>
          <div className="flex items-center gap-2">
            <div
              className="flex rounded-lg bg-muted p-0.5 text-xs"
              role="group"
              aria-label="حالت زاویه"
            >
              {(['deg', 'rad'] as AngleMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAngleMode(mode)}
                  aria-pressed={angleMode === mode}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-semibold transition',
                    angleMode === mode ? 'bg-card shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {mode === 'deg' ? 'درجه' : 'رادیان'}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant={scientific ? 'default' : 'outline'}
              onClick={() => setScientific((v) => !v)}
              aria-pressed={scientific}
            >
              علمی
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* نمایشگر */}
          <div
            ref={displayRef}
            className="rounded-xl bg-navy-900 px-4 py-4 text-white dark:bg-navy-950"
            aria-live="polite"
          >
            <div dir="ltr" className="min-h-6 break-all text-left text-lg text-white/80">
              {displayExpr || '0'}
            </div>
            <div
              dir="ltr"
              className="min-h-9 break-all text-left text-3xl font-extrabold text-neon-400"
            >
              {error ? '' : (result ?? '')}
            </div>
            {error && (
              <p role="alert" className="text-left text-sm text-red-300">
                {error}
              </p>
            )}
          </div>

          {scientific && (
            <div className="grid grid-cols-4 gap-1.5" aria-label="کلیدهای علمی">
              {SCIENTIFIC_KEYS.map((key) => (
                <Button
                  key={key.label}
                  variant="secondary"
                  className="h-10 text-[13px] font-semibold"
                  onClick={() => press(key.value)}
                >
                  {key.label}
                </Button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5" aria-label="صفحه‌کلید ماشین‌حساب">
            {BASIC_KEYS.map((key) => (
              <Button
                key={key.label}
                variant={
                  key.kind === 'equals'
                    ? 'neon'
                    : key.kind === 'op'
                      ? 'secondary'
                      : key.kind === 'action'
                        ? 'outline'
                        : 'default'
                }
                className={cn(
                  'h-12 text-lg font-bold',
                  key.kind !== 'equals' &&
                    key.kind !== 'op' &&
                    key.kind !== 'action' &&
                    'bg-card text-foreground shadow-sm ring-1 ring-border hover:bg-secondary',
                  key.label === 'C' && 'text-destructive',
                )}
                onClick={() => press(key.value)}
                aria-label={key.label === 'C' ? 'پاک کردن' : key.label}
              >
                {key.label}
              </Button>
            ))}
            <Button
              variant="outline"
              className="col-span-4 h-10"
              onClick={backspace}
              aria-label="حذف آخرین نویسه"
            >
              <Delete className="h-5 w-5" />
              حذف
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            با صفحه‌کلید فیزیکی هم می‌توانید تایپ کنید — Enter برای محاسبه
          </p>
        </CardContent>
      </Card>

      {/* تاریخچه */}
      <Card className="h-fit">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
            تاریخچه
          </CardTitle>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => persistHistory([])}
              aria-label="پاک کردن تاریخچه"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              هنوز محاسبه‌ای انجام نشده است.
            </p>
          ) : (
            <ul className="divide-y">
              {history.map((entry, i) => (
                <li key={i}>
                  <button
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-secondary"
                    onClick={() => {
                      setExpr(entry.expr);
                      setResult(entry.result);
                      setAns(parseAmountInput(entry.result));
                      setError(null);
                    }}
                  >
                    <span dir="ltr" className="truncate text-sm text-muted-foreground">
                      {toFaDigits(entry.expr.replaceAll('*', '×').replaceAll('/', '÷'))}
                    </span>
                    <span dir="ltr" className="font-bold text-primary dark:text-neon-400">
                      {entry.result}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
