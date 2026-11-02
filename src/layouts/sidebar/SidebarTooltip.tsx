import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';

interface TooltipPosition {
  top: number;
  left: number;
}

/**
 * تولتیپ فارسی مخصوص حالت فشرده.
 * از Portal استفاده میکند تا `backdrop-filter` / `transform` بدنهی شیشهای،
 * مختصات `position: fixed` را تغییر ندهد. فقط هنگام Hover/Focus ساخته میشود.
 */
export function SidebarTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const show = (event: SyntheticEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // سایدبار در RTL سمت راست است؛ تولتیپ در سمت چپ آیکون قرار میگیرد
    setPosition({ top: rect.top + rect.height / 2, left: rect.left - 12 });
  };
  const hide = () => setPosition(null);

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {position &&
        createPortal(
          <span
            className="sidebar-tooltip"
            style={{ top: position.top, left: position.left }}
            role="tooltip"
          >
            {label}
          </span>,
          document.body,
        )}
    </div>
  );
}
