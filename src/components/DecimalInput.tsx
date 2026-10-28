import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { parseAmountInput } from '@/core/currency/currency';
import { Input } from './ui/input';

type DecimalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number;
  onChange: (value: number) => void;
};

/** متن موقت مثل «۰٫» هنگام تایپ حفظ می‌شود؛ مقدار عددی همیشه معتبر و قابل محاسبه است. */
export function DecimalInput({ value, onChange, onFocus, onBlur, ...props }: DecimalInputProps) {
  const display = Number.isFinite(value) && value !== 0 ? String(value) : '';
  const [text, setText] = useState(display);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(display);
  }, [display]);

  return (
    <Input
      {...props}
      dir="ltr"
      inputMode="decimal"
      value={text}
      onFocus={(event) => {
        focused.current = true;
        event.currentTarget.select();
        onFocus?.(event);
      }}
      onChange={(event) => {
        setText(event.target.value);
        onChange(parseAmountInput(event.target.value) ?? 0);
      }}
      onBlur={(event) => {
        focused.current = false;
        setText(display);
        onBlur?.(event);
      }}
    />
  );
}
