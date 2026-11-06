import { describe, expect, it } from 'vitest';
import type { AppAlert } from '@/features/alerts/alerts';
import { alertsByPath } from './nav-badges';

function alert(id: string, to: string, severity: AppAlert['severity']): AppAlert {
  return { id, kind: 'low-stock', severity, title: `هشدار ${id}`, to };
}

describe('نشانگرهای هشدار منو', () => {
  it('فقط هشدارهای واقعی را بر اساس مسیر مقصد گروهبندی میکند', () => {
    const badges = alertsByPath([
      alert('a', '/store/products', 'warning'),
      alert('b', '/store/products', 'danger'),
      alert('c', '/personal/debts', 'warning'),
    ]);
    expect(badges).toEqual({
      '/store/products': { count: 2, danger: true },
      '/personal/debts': { count: 1, danger: false },
    });
  });

  it('بدون هشدار، هیچ Badge ساختگی نمیسازد', () => {
    expect(alertsByPath([])).toEqual({});
  });
});
