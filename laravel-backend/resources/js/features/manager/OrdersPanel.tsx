import { useCallback, useEffect, useState } from 'react';
import { Check, Receipt, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/core/api/client';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { formatJalaliLongISO } from '@/core/jalali/jalali';
import { cn } from '@/lib/utils';
import {
  GATEWAY_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  type BillingOrder,
} from '../billing/billing-labels';

interface OrdersResponse {
  orders: BillingOrder[];
  totals: {
    pending: number;
    paid_this_month: number;
    revenue_this_month: number;
  };
}

const cardClass = 'border-white/10 bg-white/[0.04] text-white';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errors) {
      const first = Object.values(error.errors).flat().find(Boolean);
      if (first) return first;
    }
    return error.message;
  }
  return 'ارتباط با سرور برقرار نشد.';
}

/**
 * سفارش‌ها و تأیید پرداخت‌های کارت‌به‌کارت — فقط مدیر کل.
 *
 * اینجا نقطهٔ کنترل پول است: هر سفارش «در انتظار» تا وقتی مدیر رسید را
 * نبیند پرداخت‌شده نمی‌شود، و تأیید مدیر همان مسیر تمدید لایسنس را اجرا
 * می‌کند (با ثبت در دفتر رویدادها).
 */
export function OrdersPanel({ limit = 30 }: { limit?: number }) {
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<OrdersResponse>(`/api/manager/orders?limit=${limit}`);
      setData(response);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (order: BillingOrder, action: 'approve' | 'reject') => {
    setBusy(order.id);
    try {
      await apiFetch(`/api/manager/orders/${order.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(
          action === 'reject' ? { reason: 'رد شده توسط مدیر' } : { reference: null },
        ),
      });
      toast.success(
        action === 'approve' ? 'پرداخت تأیید و لایسنس فروشگاه تمدید شد.' : 'سفارش لغو شد.',
      );
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
          <Receipt
            className="h-5 w-5 text-[var(--glass-gold,theme(colors.amber.400))]"
            aria-hidden
          />
          سفارش‌ها و پرداخت‌ها
        </h2>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw aria-hidden className={loading ? 'animate-spin' : undefined} />
          تازه‌سازی
        </Button>
      </div>

      {data && (
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Card className={cardClass}>
            <CardContent className="p-4">
              <p className="text-xs text-white/60">در انتظار تأیید</p>
              <p className="mt-1 text-xl font-extrabold">
                {toFaDigits(String(data.totals.pending))}
              </p>
            </CardContent>
          </Card>
          <Card className={cardClass}>
            <CardContent className="p-4">
              <p className="text-xs text-white/60">پرداخت‌های این ماه</p>
              <p className="mt-1 text-xl font-extrabold">
                {toFaDigits(String(data.totals.paid_this_month))}
              </p>
            </CardContent>
          </Card>
          <Card className={cardClass}>
            <CardContent className="p-4">
              <p className="text-xs text-white/60">درآمد این ماه</p>
              <p className="mt-1 text-xl font-extrabold">
                {formatMoney(data.totals.revenue_this_month, 'toman')}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {error && (
        <Card className={cardClass}>
          <CardContent className="p-6 text-center text-sm text-red-300">{error}</CardContent>
        </Card>
      )}

      {!error && !loading && data?.orders.length === 0 && (
        <Card className={cardClass}>
          <CardContent className="p-8 text-center text-sm text-white/60">
            هنوز سفارشی ثبت نشده است.
          </CardContent>
        </Card>
      )}

      {!error && data && data.orders.length > 0 && (
        <Card className={cardClass}>
          <CardContent className="p-0">
            <ul className="divide-y divide-white/[0.06]">
              {data.orders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                  <span
                    className={cn(
                      'rounded-lg px-2 py-0.5 text-[11px] font-bold',
                      ORDER_STATUS_TONES[order.status],
                    )}
                  >
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </span>
                  <span className="font-medium text-white/90">
                    #{toFaDigits(String(order.id))} · {order.store_name ?? 'فروشگاه'}
                  </span>
                  <span className="text-xs text-white/60">{order.plan_label}</span>
                  <span className="text-xs text-white/70">
                    {formatMoney(order.amount, 'toman')}
                  </span>
                  <span className="text-xs text-white/50">
                    {GATEWAY_LABELS[order.gateway] ?? order.gateway}
                  </span>
                  <span className="ms-auto text-xs text-white/50">
                    {order.created_at ? formatJalaliLongISO(order.created_at) : '—'}
                  </span>

                  {order.status === 'pending' && (
                    <span className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="neon"
                        onClick={() => void act(order, 'approve')}
                        disabled={busy === order.id}
                      >
                        <Check aria-hidden />
                        تأیید پرداخت
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void act(order, 'reject')}
                        disabled={busy === order.id}
                      >
                        <X aria-hidden />
                        رد
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
