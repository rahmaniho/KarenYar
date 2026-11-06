import type { ComponentType, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toFaDigits } from '@/core/currency/currency';
import { cn } from '@/lib/utils';
import type { PageMeta } from './admin-types';

export function Panel({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur', className)}>
      <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-4 py-3">
        {Icon && <Icon className="h-4 w-4 text-emerald-300" />}
        <div className="me-auto">
          <h2 className="text-sm font-extrabold text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-white/45">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: 'default' | 'neon' | 'danger' | 'warning' | 'info';
  trend?: number | null;
}) {
  const tones: Record<string, string> = {
    default: 'bg-white/10 text-white',
    neon: 'bg-emerald-400/15 text-emerald-300',
    danger: 'bg-red-500/15 text-red-300',
    warning: 'bg-amber-500/15 text-amber-300',
    info: 'bg-sky-500/15 text-sky-300',
  };

  return (
    <Card className="border-white/10 bg-white/[0.04] text-white">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] text-white/50">{label}</p>
            <p className="mt-0.5 truncate text-lg font-extrabold">{value}</p>
            <div className="mt-0.5 flex items-center gap-1">
              {typeof trend === 'number' && (
                <span
                  className={cn(
                    'rounded px-1 text-[10px] font-bold',
                    trend >= 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300',
                  )}
                >
                  {trend >= 0 ? '▲' : '▼'} {toFaDigits(Math.abs(trend))}٪
                </span>
              )}
              {hint && <p className="truncate text-[10px] text-white/40">{hint}</p>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/50">{text}</p>;
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-xl bg-white/[0.06]" />
      ))}
    </div>
  );
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading} className="border-white/15 text-white">
      <RefreshCw aria-hidden className={loading ? 'animate-spin' : undefined} />
      تازه‌سازی
    </Button>
  );
}

export function Pagination({ meta, onChange }: { meta: PageMeta; onChange: (page: number) => void }) {
  if (meta.last_page <= 1) {
    return (
      <p className="mt-3 text-[11px] text-white/40">مجموع: {toFaDigits(meta.total)} مورد</p>
    );
  }

  const pages = Array.from({ length: meta.last_page }, (_, index) => index + 1)
    .filter((page) => Math.abs(page - meta.page) <= 2 || page === 1 || page === meta.last_page)
    .slice(0, 9);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-white/60">
      <Button
        size="sm"
        variant="ghost"
        className="text-white/70"
        disabled={meta.page <= 1}
        onClick={() => onChange(meta.page - 1)}
        aria-label="صفحهٔ قبل"
      >
        <ChevronRight aria-hidden />
      </Button>
      {pages.map((page) => (
        <Button
          key={page}
          size="sm"
          variant={page === meta.page ? 'default' : 'ghost'}
          className={page === meta.page ? '' : 'text-white/70'}
          onClick={() => onChange(page)}
        >
          {toFaDigits(page)}
        </Button>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="text-white/70"
        disabled={meta.page >= meta.last_page}
        onClick={() => onChange(meta.page + 1)}
        aria-label="صفحهٔ بعد"
      >
        <ChevronLeft aria-hidden />
      </Button>
      <span className="ms-auto text-[11px] text-white/40">
        {toFaDigits(meta.total)} مورد · صفحهٔ {toFaDigits(meta.page)} از {toFaDigits(meta.last_page)}
      </span>
    </div>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold', tone ?? 'bg-white/10 text-white/70')}>
      {children}
    </span>
  );
}
