import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, CheckCircle2, Receipt, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { formatJalaliLongISO } from '@/core/jalali/jalali';
import { adminApi } from './admin-api';
import { useAdminContext } from './admin-context';
import {
  EmptyState,
  KpiCard,
  LoadingRows,
  Pagination,
  Panel,
  Pill,
  RefreshButton,
} from './admin-ui';
import { errorMessage, useAsync } from './admin-lib';
import {
  GATEWAY_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  ORDER_TYPE_LABELS,
  type AdminOrder,
} from './admin-types';

type Action = { kind: 'approve' | 'reject' | 'void'; order: AdminOrder } | null;

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const { reloadDashboard } = useAdminContext();

  const { data, loading, error, reload } = useAsync(
    () => adminApi.orders({ status: status || undefined, q: query || undefined, page, limit: 12 }),
    [status, query, page],
  );

  const orders = useMemo(() => data?.orders ?? [], [data]);

  const open = (kind: 'approve' | 'reject' | 'void', order: AdminOrder) => {
    setAction({ kind, order });
    setReason('');
    setReference('');
  };

  const close = () => setAction(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!action) return;

    setBusy(true);
    try {
      if (action.kind === 'approve') {
        await adminApi.approveOrder(action.order.id, reference.trim(), reason.trim() || undefined);
        toast.success('پرداخت تأیید شد و اشتراک فعال/تمدید شد.');
      } else if (action.kind === 'reject') {
        await adminApi.rejectOrder(action.order.id, reason.trim());
        toast.success('سفارش لغو شد.');
      } else {
        await adminApi.voidOrder(action.order.id, reason.trim());
        toast.success('پرداخت باطل شد؛ رکوردها برای حسابرسی حفظ شدند.');
      }
      close();
      await reload();
      void reloadDashboard(true);
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="در انتظار تأیید" value={`${toFaDigits(data?.totals.pending ?? 0)} سفارش`} icon={Receipt} tone="warning" hint={formatMoney(data?.totals.pending_amount ?? 0, 'toman')} />
        <KpiCard label="پرداخت این ماه" value={`${toFaDigits(data?.totals.paid_this_month ?? 0)} مورد`} icon={CheckCircle2} tone="neon" />
        <KpiCard label="درآمد این ماه" value={formatMoney(data?.totals.revenue_this_month ?? 0, 'toman')} icon={CheckCircle2} tone="info" />
        <KpiCard label="صفحه" value={`${toFaDigits(page)} از ${toFaDigits(data?.meta.last_page ?? 1)}`} icon={Receipt} hint={`${toFaDigits(data?.meta.total ?? 0)} سفارش`} />
      </div>

      <Panel
        title="سفارش‌ها و پرداخت‌ها"
        subtitle="تأیید دستی فقط با شمارهٔ پیگیری بانکی انجام می‌شود"
        icon={Receipt}
        actions={<RefreshButton onClick={() => void reload()} loading={loading} />}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(term.trim());
            }}
          >
            <Search className="absolute end-2.5 top-2.5 h-4 w-4 text-white/35" aria-hidden />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="نام فروشگاه، شمارهٔ پیگیری یا کوپن"
              aria-label="جست‌وجوی سفارش"
              className="h-9 w-64 border-white/10 bg-white/[0.05] pe-8 text-white placeholder:text-white/35"
            />
          </form>
          <Select
            value={status || 'all'}
            onValueChange={(value) => {
              setPage(1);
              const next = new URLSearchParams(params);
              if (value === 'all') next.delete('status');
              else next.set('status', value);
              setParams(next, { replace: true });
            }}
          >
            <SelectTrigger className="h-9 w-44 border-white/10 bg-white/[0.05] text-white" aria-label="وضعیت سفارش">
              <SelectValue placeholder="همهٔ وضعیت‌ها" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
              <SelectItem value="pending">در انتظار پرداخت</SelectItem>
              <SelectItem value="paid">پرداخت‌شده</SelectItem>
              <SelectItem value="failed">ناموفق</SelectItem>
              <SelectItem value="canceled">لغوشده</SelectItem>
              <SelectItem value="voided">باطل‌شده</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && <p className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        {loading && !data && <LoadingRows rows={5} />}
        {!loading && orders.length === 0 && <EmptyState text="سفارشی با این شرایط پیدا نشد." />}

        {orders.length > 0 && (
          <ul className="divide-y divide-white/[0.06]">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center gap-2 px-1 py-3 text-xs">
                <Pill tone={ORDER_STATUS_TONES[order.status]}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</Pill>
                <span className="text-sm font-bold text-white/90">#{toFaDigits(order.id)}</span>
                <span className="text-white/70">{order.store_name ?? 'فروشگاه'}</span>
                <span className="text-white/45">{order.plan_label}</span>
                <span className="text-white/45">{ORDER_TYPE_LABELS[order.type] ?? order.type}</span>
                <span className="text-white/45">
                  {toFaDigits(order.seats)} کاربر · {toFaDigits(order.months)} ماه
                </span>
                <span className="font-bold text-emerald-300">{formatMoney(order.amount, 'toman')}</span>
                <span className="text-white/40">{GATEWAY_LABELS[order.gateway] ?? order.gateway}</span>
                {order.reference_id && (
                  <span dir="ltr" className="text-white/50">
                    {order.reference_id}
                  </span>
                )}
                {order.invoice_number && <span className="text-white/35">فاکتور {order.invoice_number}</span>}
                <span className="ms-auto text-[10px] text-white/35">
                  {order.created_at ? formatJalaliLongISO(order.created_at) : '—'}
                </span>

                <span className="flex w-full items-center gap-2 sm:w-auto">
                  {order.status === 'pending' && (
                    <>
                      <Button size="sm" variant="neon" onClick={() => open('approve', order)}>
                        <CheckCircle2 aria-hidden />
                        تأیید پرداخت
                      </Button>
                      <Button size="sm" variant="outline" className="border-white/15 text-white/80" onClick={() => open('reject', order)}>
                        <XCircle aria-hidden />
                        رد
                      </Button>
                    </>
                  )}
                  {order.status === 'paid' && (
                    <Button size="sm" variant="outline" className="border-white/15 text-white/70" onClick={() => open('void', order)}>
                      <Ban aria-hidden />
                      ابطال
                    </Button>
                  )}
                  {order.status === 'voided' && order.void_reason && (
                    <span className="text-[10px] text-fuchsia-300">دلیل ابطال: {order.void_reason}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {data && <Pagination meta={data.meta} onChange={setPage} />}
      </Panel>

      <Dialog open={action !== null} onOpenChange={(open2) => !open2 && close()}>
        <DialogContent className="border-white/10 bg-[#0b1424] text-white sm:max-w-md">
          {action && (
            <form onSubmit={submit} className="space-y-3">
              <DialogHeader>
                <DialogTitle>
                  {action.kind === 'approve' ? 'تأیید پرداخت دستی' : action.kind === 'reject' ? 'رد سفارش' : 'ابطال پرداخت'}
                </DialogTitle>
                <DialogDescription className="text-white/50">
                  سفارش #{toFaDigits(action.order.id)} · {action.order.store_name ?? 'فروشگاه'} ·{' '}
                  {formatMoney(action.order.amount, 'toman')} · {toFaDigits(action.order.seats)} کاربر ·{' '}
                  {toFaDigits(action.order.months)} ماه
                </DialogDescription>
              </DialogHeader>

              {action.kind === 'approve' && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="order-reference">شمارهٔ پیگیری بانکی (الزامی)</Label>
                    <Input
                      id="order-reference"
                      dir="ltr"
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      required
                      minLength={3}
                      maxLength={120}
                      className="border-white/10 bg-white/[0.05] text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="order-note">یادداشت (اختیاری)</Label>
                    <Input
                      id="order-note"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="مثلاً رسید واتساپ بررسی شد"
                      className="border-white/10 bg-white/[0.05] text-white"
                    />
                  </div>
                  <p className="rounded-xl bg-amber-500/10 p-2 text-[11px] text-amber-200">
                    این عملیات اشتراک را فعال/تمدید می‌کند و در دفتر رویدادها با نام شما ثبت می‌شود.
                  </p>
                </>
              )}

              {action.kind !== 'approve' && (
                <div className="space-y-1">
                  <Label htmlFor="order-reason">
                    {action.kind === 'reject' ? 'دلیل رد سفارش (الزامی)' : 'دلیل ابطال پرداخت (الزامی)'}
                  </Label>
                  <Input
                    id="order-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    required
                    minLength={3}
                    maxLength={300}
                    className="border-white/10 bg-white/[0.05] text-white"
                  />
                  <p className="text-[11px] text-white/45">
                    {action.kind === 'void'
                      ? 'ابطال، رکورد پرداخت و فاکتور را باطل می‌کند اما آن‌ها را حذف نمی‌کند و اشتراک را خودکار قطع نمی‌کند.'
                      : 'سفارش لغو می‌شود و مبلغی دریافت نمی‌گردد؛ رکورد برای حسابرسی باقی می‌ماند.'}
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="ghost" className="text-white/70" onClick={close} disabled={busy}>
                  انصراف
                </Button>
                <Button type="submit" variant={action.kind === 'approve' ? 'neon' : 'destructive'} disabled={busy}>
                  {action.kind === 'approve' ? 'تأیید و فعال‌سازی' : action.kind === 'reject' ? 'رد سفارش' : 'ابطال پرداخت'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
