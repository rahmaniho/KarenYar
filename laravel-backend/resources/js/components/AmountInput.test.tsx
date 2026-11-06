import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AmountInput } from './AmountInput';

function CashInput() {
  const [value, setValue] = useState(198_000);
  return (
    <>
      <AmountInput aria-label="وجه نقد" value={value} onChange={setValue} />
      <output data-testid="amount">{value}</output>
    </>
  );
}

describe('ورودی مبلغ', () => {
  it('focus متن مبلغ را عوض نمی‌کند و انتخاب کامل برای جایگزینی مبلغ حفظ می‌شود', () => {
    render(<CashInput />);
    const input = screen.getByRole('textbox', { name: 'وجه نقد' }) as HTMLInputElement;
    const formatted = input.value;
    fireEvent.focus(input);
    expect(input.value).toBe(formatted);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(formatted.length);
    fireEvent.change(input, { target: { value: '250000' } });
    expect(screen.getByTestId('amount')).toHaveTextContent('250000');
    fireEvent.blur(input);
    expect(input).toHaveValue('۲۵۰٬۰۰۰');
  });

  it('مبلغ فارسی با جداکننده را می‌پذیرد و مقدار نامعتبر به حساب وارد نمی‌کند', () => {
    const onChange = vi.fn();
    render(<AmountInput aria-label="مبلغ فارسی" value={0} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'مبلغ فارسی' });
    fireEvent.change(input, { target: { value: '۲۵۰٬۰۰۰' } });
    expect(onChange).toHaveBeenLastCalledWith(250_000);
    fireEvent.change(input, { target: { value: '--' } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});
