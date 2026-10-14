import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatAmountInput, parseAmountInput, toEnDigits } from '@/core/currency/currency';
import { cn } from '@/lib/utils';

interface AmountInputProps {
  /** مقدار عددی در واحد نمایشی فعلی (تومان/ریال) */
  value: number;
  onChange: (value: number) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  autoFocus?: boolean;
}

/**
 * ورودی مبلغ: هنگام تایپ ارقام فارسی/انگلیسی را می‌پذیرد و هنگام خروج از فوکوس،
 * جداکننده‌ی هزارگان فارسی نمایش می‌دهد.
 */
export function AmountInput({
  value,
  onChange,
  id,
  placeholder = '۰',
  disabled,
  className,
  autoFocus,
  ...rest
}: AmountInputProps) {
  const [text, setText] = useState(() => (value ? formatAmountInput(String(value)) : ''));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(value ? formatAmountInput(String(value)) : '');
    }
  }, [value]);

  return (
    <Input
      id={id}
      inputMode="decimal"
      dir="ltr"
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={rest['aria-label']}
      className={cn('text-left', className)}
      placeholder={placeholder}
      value={text}
      onFocus={() => {
        focusedRef.current = true;
        // هنگام ویرایش، عدد خام بدون جداکننده نشان داده می‌شود
        if (value) setText(String(value));
      }}
      onBlur={() => {
        focusedRef.current = false;
        setText(value ? formatAmountInput(String(value)) : '');
      }}
      onChange={(e) => {
        const raw = toEnDigits(e.target.value).replace(/[٬،,\s]/g, '');
        setText(raw);
        const parsed = parseAmountInput(raw);
        onChange(parsed ?? 0);
      }}
    />
  );
}
