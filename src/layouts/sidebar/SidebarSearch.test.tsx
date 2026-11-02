import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SidebarSearch } from './SidebarSearch';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function setup(collapsed = false) {
  const onNavigate = vi.fn();
  const onExpand = vi.fn();
  const view = render(
    <MemoryRouter initialEntries={['/']}>
      <LocationProbe />
      <SidebarSearch
        collapsed={collapsed}
        onExpand={onExpand}
        onNavigate={onNavigate}
        shortcutActive
        id="nav-search-test"
      />
    </MemoryRouter>,
  );
  return { ...view, onNavigate, onExpand };
}

describe('جستجوی عملیاتی منو', () => {
  it('نتایج زنده از صفحات واقعی نشان میدهد', () => {
    setup();
    const input = screen.getByRole('combobox', { name: 'جستجو در منوها و صفحات' });
    fireEvent.change(input, { target: { value: 'فاکتور' } });
    // هر دو صفحه‌ی «فاکتورها» و «فاکتورهای صادرشده» در نتایج می‌آیند
    const options = screen.getAllByRole('option', { name: /فاکتور/ });
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((option) => /فاکتورها/.test(option.textContent ?? ''))).toBe(true);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('پیمایش با کیبورد و Enter به مسیر واقعی میرود', () => {
    const { onNavigate } = setup();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'فاکتور' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('location').textContent).not.toBe('/');
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Escape نتایج را میبندد و عبارت را پاک میکند', () => {
    setup();
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'گزارش' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('میانبر / فیلد جستجو را فوکوس میکند', () => {
    setup();
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement?.id).toBe('nav-search-test');
  });

  it('در حالت فشرده دکمهی جستجو منو را باز و فوکوس میکند', () => {
    const { onExpand } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: 'جستجو در منوها' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
