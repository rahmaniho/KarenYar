import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSidebarUi } from './useSidebarUi';

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true });
}

describe('وضعیت نمایش منو', () => {
  beforeEach(() => {
    localStorage.clear();
    setWidth(1440);
  });

  it('در دسکتاپ پیشفرض باز است، در تبلت پیشفرض فشرده است', () => {
    const desktop = renderHook(() => useSidebarUi());
    expect(desktop.result.current.collapsed).toBe(false);
    desktop.unmount();
    localStorage.clear();
    setWidth(820);
    const tablet = renderHook(() => useSidebarUi());
    expect(tablet.result.current.collapsed).toBe(true);
  });

  it('گروهها باز/بسته میشوند و وضعیت ذخیره میشود', () => {
    const { result, unmount } = renderHook(() => useSidebarUi());
    expect(result.current.isGroupOpen('store')).toBe(true);
    act(() => result.current.toggleGroup('store'));
    expect(result.current.isGroupOpen('store')).toBe(false);
    expect(JSON.parse(localStorage.getItem('hesabyar-nav-ui') ?? '{}').closedGroups).toContain(
      'store',
    );
    unmount();
    const next = renderHook(() => useSidebarUi());
    expect(next.result.current.isGroupOpen('store')).toBe(false);
  });

  it('فقط دو کلید ظاهری در localStorage نوشته میشود', () => {
    const { result } = renderHook(() => useSidebarUi());
    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(true);
    const stored = JSON.parse(localStorage.getItem('hesabyar-nav-ui') ?? '{}');
    expect(Object.keys(stored).sort()).toEqual(['closedGroups', 'collapsed']);
  });
});
