import type { ComponentType } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: 'navy' | 'neon' | 'danger' | 'warning' | 'success';
}

const TONES: Record<NonNullable<StatCardProps['tone']>, string> = {
  navy: 'bg-navy-900 text-white dark:bg-navy-700',
  neon: 'bg-accent text-accent-foreground',
  danger: 'bg-destructive text-destructive-foreground',
  warning: 'bg-warning text-warning-foreground',
  success: 'bg-success text-success-foreground',
};

export function StatCard({ title, value, hint, icon: Icon, tone = 'navy' }: StatCardProps) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="truncate text-base font-extrabold sm:text-lg">{value}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}
