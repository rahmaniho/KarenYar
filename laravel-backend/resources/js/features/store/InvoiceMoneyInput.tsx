import { useState } from 'react';
import { AmountInput } from '@/components/AmountInput';
import { fromDisplayAmountExact, toDisplayAmount } from '@/core/currency/currency';
import { useSettingsStore } from '@/store/settings-store';

/** ورودی نمایشی تومان/ریال با مقدار داخلی ثابت؛ تغییر واحد مبلغ را عوض نمی‌کند. */
export function InvoiceMoneyInput({
  value,
  onChange,
  id,
  label,
  disabled,
  className,
  onValidityChange,
}: {
  value: number;
  onChange: (toman: number) => void;
  id?: string;
  label: string;
  disabled?: boolean;
  className?: string;
  onValidityChange?: (valid: boolean) => void;
}) {
  const unit = useSettingsStore((state) => state.currencyUnit);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={className}>
      <AmountInput
        id={id}
        aria-label={label}
        aria-invalid={!!error}
        disabled={disabled}
        value={toDisplayAmount(value, unit)}
        onChange={(display) => {
          try {
            const toman = fromDisplayAmountExact(display, unit);
            setError(null);
            onValidityChange?.(true);
            onChange(toman);
          } catch (error) {
            setError(error instanceof Error ? error.message : 'مبلغ معتبر نیست.');
            onValidityChange?.(false);
          }
        }}
      />
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
