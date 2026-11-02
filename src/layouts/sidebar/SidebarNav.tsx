import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { toFaDigits } from '@/core/currency/currency';
import { cn } from '@/lib/utils';
import { NAV_GROUPS } from '../nav-items';
import type { NavBadge } from './nav-badges';
import type { SidebarUi } from './useSidebarUi';
import { SidebarTooltip } from './SidebarTooltip';

interface SidebarNavProps {
  ui: SidebarUi;
  collapsed: boolean;
  badges: Record<string, NavBadge>;
  onNavigate: () => void;
}

/** فهرست کامل منوها — همان گروهها و مسیرهای قبلی، با گروههای تاشو و نشانگر هشدار واقعی */
export function SidebarNav({ ui, collapsed, badges, onNavigate }: SidebarNavProps) {
  const reduceMotion = useReducedMotion();

  return (
    <nav
      className="sidebar-scroll relative z-0 min-h-0 flex-1 overflow-y-auto px-3 pb-3"
      aria-label="ناوبری اصلی"
    >
      {NAV_GROUPS.map((group, index) => {
        const isOpen = ui.isGroupOpen(group.id);
        return (
          <div key={group.id} className={cn(index > 0 && (collapsed ? 'mt-2' : 'mt-3'))}>
            {collapsed ? (
              <>
                {index > 0 && <div className="nav-group-rule mx-auto mb-2 h-px w-9" />}
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const badge = badges[item.to];
                    return (
                      <li key={item.to}>
                        <SidebarTooltip label={item.label}>
                          <NavLink
                            to={item.to}
                            end={item.end}
                            onClick={onNavigate}
                            aria-label={item.label}
                            className={({ isActive }) =>
                              cn(
                                'nav-item flex h-11 w-full items-center justify-center rounded-xl',
                                isActive && 'is-active',
                              )
                            }
                          >
                            <span className="nav-item-icon relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                              <item.icon className="h-[18px] w-[18px]" aria-hidden />
                              {badge && (
                                <span
                                  className="nav-dot absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full"
                                  data-danger={badge.danger}
                                  aria-hidden
                                />
                              )}
                            </span>
                          </NavLink>
                        </SidebarTooltip>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => ui.toggleGroup(group.id)}
                  aria-expanded={isOpen}
                  aria-controls={`nav-group-${group.id}`}
                  className="nav-group-label group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10.5px] font-bold transition hover:text-[var(--glass-ink)]"
                >
                  <span className="h-1 w-1 shrink-0 rounded-full bg-[#d6b46a]/80" />
                  <span className="flex-1 text-start">{group.title}</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                      !isOpen && '-rotate-90',
                    )}
                    aria-hidden
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.ul
                      id={`nav-group-${group.id}`}
                      key="items"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-0.5 overflow-hidden pb-1 pt-0.5"
                    >
                      {group.items.map((item) => {
                        const badge = badges[item.to];
                        return (
                          <li key={item.to}>
                            <NavLink
                              to={item.to}
                              end={item.end}
                              onClick={onNavigate}
                              className={({ isActive }) =>
                                cn(
                                  'nav-item mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium',
                                  isActive && 'is-active',
                                )
                              }
                            >
                              <span className="nav-item-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                                <item.icon className="h-[17px] w-[17px]" aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-start">
                                {item.label}
                              </span>
                              {badge && (
                                <span
                                  className="nav-badge flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                                  data-danger={badge.danger}
                                  aria-label={`${toFaDigits(String(badge.count))} هشدار`}
                                >
                                  {toFaDigits(String(badge.count))}
                                </span>
                              )}
                            </NavLink>
                          </li>
                        );
                      })}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        );
      })}
    </nav>
  );
}
