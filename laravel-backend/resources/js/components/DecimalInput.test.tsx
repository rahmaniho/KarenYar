import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DecimalInput } from './DecimalInput';

function Quantity() {
  const [value, setValue] = useState(1);
  return (
    <>
      <DecimalInput aria-label="مقدار" value={value} onChange={setValue} />
      <output data-testid="quantity">{value}</output>
    </>
  );
}

describe('ورودی اعشاری', () => {
  it('با تایپ مرحله‌به‌مرحله می‌توان مقدار کمتر از یک را وارد کرد', () => {
    render(<Quantity />);
    const input = screen.getByRole('textbox', { name: 'مقدار' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.change(input, { target: { value: '0.' } });
    expect(input).toHaveValue('0.');
    fireEvent.change(input, { target: { value: '0.25' } });
    expect(screen.getByTestId('quantity')).toHaveTextContent('0.25');
    fireEvent.blur(input);
    expect(input).toHaveValue('0.25');
  });

  it('ارقام و ممیز فارسی را می‌پذیرد و ورودی نامعتبر، مقدار صفر می‌دهد نه NaN', () => {
    render(<Quantity />);
    const input = screen.getByRole('textbox', { name: 'مقدار' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '۰٫۱۲۵' } });
    expect(screen.getByTestId('quantity')).toHaveTextContent('0.125');
    fireEvent.change(input, { target: { value: 'نامعتبر' } });
    expect(screen.getByTestId('quantity')).toHaveTextContent('0');
  });
});
