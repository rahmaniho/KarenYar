import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'hesabyar-nav-ui';

/**
 * فقط تنظیمات ظاهری منو ذخیره میشود (فشرده/باز و گروههای بسته).
 * هیچ اطلاعات کاربری، نشست، پین یا دادهی مالی در localStorage قرار نمیگیرد.
 */
interface NavUiState {
  collapsed: boolean;
  closedGroups: string[];
}

export interface SidebarUi {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  isGroupOpen: (id: string) => boolean;
  toggleGroup: (id: string) => void;
}

/** در تبلت (۷۶۸–۱۰۲۳px) پیشفرض فشرده است تا عرض محتوا حفظ شود */
function defaultCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= 768 && window.innerWidth < 1024;
}

const DEFAULT_STATE: NavUiState = { collapsed: false, closedGroups: [] };

function read(): NavUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE, collapsed: defaultCollapsed() };
    const parsed = JSON.parse(raw) as Partial<NavUiState>;
    return {
      collapsed: typeof parsed.collapsed === 'boolean' ? parsed.collapsed : defaultCollapsed(),
      closedGroups: Array.isArray(parsed.closedGroups)
        ? parsed.closedGroups.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function useSidebarUi(): SidebarUi {
  const [state, setState] = useState<NavUiState>(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // مرورگر خصوصی / حافظهی پر — وضعیت منو در همان نشست همچنان حفظ میشود
    }
  }, [state]);

  const setCollapsed = useCallback(
    (collapsed: boolean) => setState((s) => ({ ...s, collapsed })),
    [],
  );

  const toggleCollapsed = useCallback(
    () => setState((s) => ({ ...s, collapsed: !s.collapsed })),
    [],
  );

  const isGroupOpen = useCallback(
    (id: string) => !state.closedGroups.includes(id),
    [state.closedGroups],
  );

  const toggleGroup = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      closedGroups: s.closedGroups.includes(id)
        ? s.closedGroups.filter((g) => g !== id)
        : [...s.closedGroups, id],
    }));
  }, []);

  return {
    collapsed: state.collapsed,
    setCollapsed,
    toggleCollapsed,
    isGroupOpen,
    toggleGroup,
  };
}
