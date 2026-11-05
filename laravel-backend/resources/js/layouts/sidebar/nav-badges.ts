import type { AppAlert } from '@/features/alerts/alerts';

export interface NavBadge {
  count: number;
  danger: boolean;
}

/**
 * تعداد هشدارهای واقعی به تفکیک مسیر منو.
 * مسیرها دقیقاً همان `to` هستند که `computeAlerts` تولید میکند؛ هیچ اعلان ساختگی ساخته نمیشود.
 */
export function alertsByPath(alerts: AppAlert[]): Record<string, NavBadge> {
  const out: Record<string, NavBadge> = {};
  for (const alert of alerts) {
    const badge = (out[alert.to] ??= { count: 0, danger: false });
    badge.count += 1;
    if (alert.severity === 'danger') badge.danger = true;
  }
  return out;
}
