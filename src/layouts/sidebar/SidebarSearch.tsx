import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { searchNavItems } from '../nav-items';
import { cn } from '@/lib/utils';
import { SidebarTooltip } from './SidebarTooltip';

interface SidebarSearchProps {
  collapsed: boolean;
  onExpand: () => void;
  onNavigate: () => void;
  /** فقط نمونهای که واقعاً قابل مشاهده است به میانبر `/` گوش میدهد */
  shortcutActive: boolean;
  id: string;
}

/**
 * جستجوی عملیاتی منو — ایندکس واقعی صفحات، نتایج زنده، پیمایش با کیبورد،
 * Escape برای بستن و میانبر `/` (بدون تداخل با Ctrl+K جستجوی سراسری دادهها).
 */
export function SidebarSearch({
  collapsed,
  onExpand,
  onNavigate,
  shortcutActive,
  id,
}: SidebarSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingFocus, setPendingFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchNavItems(query), [query]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    if (!collapsed && pendingFocus) {
      inputRef.current?.focus();
      setPendingFocus(false);
    }
  }, [collapsed, pendingFocus]);

  useEffect(() => {
    if (!shortcutActive) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable)
      ) {
        return;
      }
      // داخل دیالوگها (جستجوی سراسری، هشدارها، فرمها) میانبر منو عمل نمیکند
      if (document.querySelector('[role="dialog"]:not([data-nav-drawer])')) return;
      event.preventDefault();
      if (collapsed) {
        onExpand();
        setPendingFocus(true);
      } else {
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcutActive, collapsed, onExpand]);

  const go = (to: string) => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    inputRef.current?.blur();
    navigate(to);
    onNavigate();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // Escape نتایج منو را میبندد؛ بستن کشوی موبایل فقط وقتی نتایجی باز نیست
      if (open) event.stopPropagation();
      setOpen(false);
      setQuery('');
      setActiveIndex(0);
      return;
    }
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % results.length);
      return;
    }
    if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
      return;
    }
    if (event.key === 'Enter') {
      const target = results[activeIndex] ?? results[0];
      if (target) {
        event.preventDefault();
        go(target.to);
      }
    }
  };

  if (collapsed) {
    return (
      <div className="relative z-30 px-2 pb-2">
        <SidebarTooltip label="جستجو در منوها">
          <button
            type="button"
            onClick={() => {
              onExpand();
              setPendingFocus(true);
            }}
            aria-label="جستجو در منوها"
            className="nav-item flex h-11 w-full items-center justify-center rounded-xl"
          >
            <Search className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </SidebarTooltip>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="relative z-30 px-3 pb-2"
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="glass-search flex h-11 items-center gap-2 rounded-xl px-3">
        <Search className="h-4 w-4 shrink-0 text-[var(--glass-muted)]" aria-hidden />
        <input
          id={id}
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={onInputKeyDown}
          placeholder="جستجوی منوها و صفحات…"
          aria-label="جستجو در منوها و صفحات"
          role="combobox"
          aria-expanded={open && query.trim().length > 0}
          aria-controls={open && query.trim() ? `${id}-results` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            open && results[activeIndex] ? `${id}-option-${activeIndex}` : undefined
          }
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--glass-ink)] outline-none placeholder:text-[var(--glass-dim)]"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setOpen(false);
              inputRef.current?.focus();
            }}
            aria-label="پاک کردن جستجو"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[var(--glass-muted)] transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : (
          <kbd
            className="glass-kbd hidden shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold sm:block"
            dir="ltr"
          >
            /
          </kbd>
        )}
      </div>

      {open && query.trim() && (
        <div
          id={`${id}-results`}
          role="listbox"
          aria-label="نتایج جستجوی منو"
          className="nav-search-results sidebar-scroll absolute inset-x-3 top-[calc(100%+4px)] max-h-[46dvh] overflow-y-auto rounded-2xl p-1.5"
        >
          {results.length === 0 ? (
            <p className="px-3 py-5 text-center text-xs text-[var(--glass-muted)]">
              صفحهای برای «{query}» پیدا نشد.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {results.map((entry, index) => (
                <li key={entry.to} id={`${id}-option-${index}`} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    data-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => go(entry.to)}
                    className={cn(
                      'nav-search-result flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start',
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-[var(--glass-gold)]">
                      <entry.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[var(--glass-ink)]">
                        {entry.label}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--glass-dim)]">
                        {entry.groupTitle}
                      </span>
                    </span>
                    {index === activeIndex && (
                      <CornerDownLeft
                        className="h-3.5 w-3.5 shrink-0 text-[var(--glass-dim)]"
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 border-t border-white/[0.08] px-3 pb-1 pt-2 text-[10px] leading-5 text-[var(--glass-dim)]">
            ↑ ↓ برای پیمایش · Enter برای رفتن · Esc برای بستن
            <br />
            جستجو در دادههای برنامه با <span dir="ltr">Ctrl+K</span> (نوار بالا)
          </p>
        </div>
      )}
    </div>
  );
}
