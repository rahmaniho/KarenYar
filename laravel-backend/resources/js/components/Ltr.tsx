import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * LTR-isolated inline span for standalone left-to-right values
 * (phone numbers, emails, tracking codes) inside RTL Persian text.
 * The dir="ltr" attribute applies unicode-bidi: isolate per HTML spec.
 */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={cn('unicode-bidi-isolate', className)}>
      {children}
    </span>
  );
}
