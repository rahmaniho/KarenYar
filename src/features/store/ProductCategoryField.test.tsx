import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductCategoryField } from './ProductCategoryField';
import { CATEGORY_COLORS, type ProductCategory } from './product-categories';

const categories: ProductCategory[] = [
  { id: '1', name: 'عمومی', color: CATEGORY_COLORS[0] },
  { id: '2', name: 'لوازم جانبی', color: CATEGORY_COLORS[1] },
];

describe('فیلد دستهبندی هنگام ورود کالا', () => {
  it('دستههای موجود بهصورت دکمه قابل انتخاباند', () => {
    const onChange = vi.fn();
    render(<ProductCategoryField value="" onChange={onChange} categories={categories} />);
    fireEvent.click(screen.getByRole('button', { name: /لوازم جانبی/ }));
    expect(onChange).toHaveBeenCalledWith('لوازم جانبی');
  });

  it('هر نام دلخواهی قابل تایپ است و بهعنوان دستهی تازه اعلام میشود', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ProductCategoryField value="قطعات یدکی 🚀" onChange={onChange} categories={categories} />,
    );
    const input = container.querySelector<HTMLInputElement>('#p-category')!;
    expect(input.value).toBe('قطعات یدکی 🚀');
    fireEvent.change(input, { target: { value: 'My Category' } });
    expect(onChange).toHaveBeenCalledWith('My Category');
    expect(screen.getByText(/هر نام دلخواهی مجاز است/)).toBeInTheDocument();
  });

  it('پیام خطای اعتبارسنجی نمایش داده میشود', () => {
    render(
      <ProductCategoryField
        value=""
        onChange={() => undefined}
        categories={categories}
        error="دستهبندی را وارد کنید."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('دستهبندی را وارد کنید.');
  });

  it('همهی نامها در datalist پیشنهاد میشوند', () => {
    const { container } = render(
      <ProductCategoryField value="" onChange={() => undefined} categories={categories} />,
    );
    const options = container.querySelectorAll('#p-categories option');
    expect([...options].map((o) => o.getAttribute('value'))).toEqual(['عمومی', 'لوازم جانبی']);
  });
});
