import { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/core/api/client';
import { toFaDigits } from '@/core/currency/currency';
import { formatJalaliLongISO } from '@/core/jalali/jalali';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_TONES } from './audit-labels';

/** یک رویداد دفتر حسابرسی (هم‌شکل با AuditController::serialize). */
export interface AuditEvent {
  id: number;
  action: string;
  storeId?: number | null;
  storeName?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  subjectType?: string | null;
  subjectKey?: string | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt?: string | null;
}

const cardClass = 'border-white/10 bg-white/[0.04] text-white';

/** زمان رویداد به شکل «۱۴ آبان ۱۴۰۵ — ۲۱:۳۰». */
function formatMoment(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const time = toFaDigits(
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  );

  return `${formatJalaliLongISO(iso)} — ${time}`;
}

/**
 * دفتر رویدادهای مدیر کل.
 *
 * چه کسی، کِی، در کدام فروشگاه چه کاری کرد: ورود/خروج، ساخت و ویرایش فروشگاه،
 * تغییر لایسنس، انتقال داده و پاک‌سازی.
 */
export function AuditPanel({ limit = 25 }: { limit?: number }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch<{ events: AuditEvent[] }>(
        `/api/manager/audit?limit=${limit}`,
      );
      setEvents(response.events ?? []);
    } catch {
      setError('خواندن رویدادها ممکن نشد.');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
          <History
            className="h-5 w-5 text-[var(--glass-gold,theme(colors.amber.400))]"
            aria-hidden
          />
          رویدادهای اخیر
        </h2>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw aria-hidden className={loading ? 'animate-spin' : undefined} />
          تازه‌سازی
        </Button>
      </div>

      {error && (
        <Card className={cardClass}>
          <CardContent className="p-6 text-center text-sm text-red-300">{error}</CardContent>
        </Card>
      )}

      {!error && !loading && events.length === 0 && (
        <Card className={cardClass}>
          <CardContent className="p-8 text-center text-sm text-white/60">
            هنوز رویدادی ثبت نشده است.
          </CardContent>
        </Card>
      )}

      {!error && events.length > 0 && (
        <Card className={cardClass}>
          <CardContent className="p-0">
            <ul className="divide-y divide-white/[0.06]">
              {events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                  <span
                    className={cn(
                      'rounded-lg px-2 py-0.5 text-[11px] font-bold',
                      AUDIT_ACTION_TONES[event.action] ?? 'bg-white/10 text-white/80',
                    )}
                  >
                    {AUDIT_ACTION_LABELS[event.action] ?? event.action}
                  </span>
                  <span className="font-medium text-white/90">
                    {event.userName ?? event.userEmail ?? 'سیستم'}
                  </span>
                  {event.storeName && (
                    <span className="text-xs text-white/60">· {event.storeName}</span>
                  )}
                  <span className="ms-auto text-xs text-white/50">
                    {formatMoment(event.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
