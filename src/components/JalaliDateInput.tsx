import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatJalaliLong, parseJalaliDateString, toJalaliInputString } from '@/core/jalali/jalali';
import { toEnDigits } from '@/core/currency/currency';
import { cn } from '@/lib/utils';

interface JalaliDateInputProps {
  /** تاریخ میلادی ISO */
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** ورودی تاریخ شمسی با قالب ۱۴۰۴-۰۷-۱۴ + پیش‌نمایش خوانا و اعتبارسنجی */
export function JalaliDateInput({
  value,
  onChange,
  id,
  disabled,
  className,
  ...rest
}: JalaliDateInputProps) {
  const [text, setText] = useState(() => (value ? toJalaliInputString(new Date(value)) : ''));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(value ? toJalaliInputString(new Date(value)) : '');
    if (!value) setError(null);
  }, [value]);

  const commit = (raw: string) => {
    const normalized = toEnDigits(raw).replace(/\//g, '-').trim();
    setText(normalized);
    if (!normalized) {
      setError('تاریخ را وارد کنید.');
      return;
    }
    const parsed = parseJalaliDateString(normalized);
    if (!parsed) {
      setError('تاریخ شمسی معتبر نیست. مثال: 1404-07-14');
      return;
    }
    setError(null);
    onChange(parsed.toISOString());
  };

  return (
    <div className={className}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <CalendarDays className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={id}
            dir="ltr"
            disabled={disabled}
            aria-label={rest['aria-label']}
            aria-invalid={!!error}
            className={cn('ps-9 text-left', error && 'border-destructive')}
            placeholder="1404-07-14"
            value={text}
            onChange={(e) => setText(toEnDigits(e.target.value))}
            onBlur={(e) => commit(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => {
            const today = new Date();
            setText(toJalaliInputString(today));
            setError(null);
            onChange(today.toISOString());
          }}
        >
          امروز
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : (
        value && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {formatJalaliLong(new Date(value))}
          </p>
        )
      )}
    </div>
  );
}
