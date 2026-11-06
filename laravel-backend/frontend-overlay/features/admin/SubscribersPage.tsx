import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Search, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { formatJalaliLongISO } from '@/core/jalali/jalali';
import { cn } from '@/lib/utils';
import { adminApi } from './admin-api';
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
  LICENSE_STATUS_LABELS,
  LICENSE_STATUS_TONES,
  type AdminPlan,
  type Subscriber,
} from './admin-types';

type DetailTab = 'summary' | 'payments' | 'history' | 'users';

export function SubscribersPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const plan = params.get('plan') ?? '';
  const queryParam = params.get('q') ?? '';
  const licenseParam = Number(params.get('license') ?? 0);

  const [page, setPage] = useState(1);
  const [term, setTerm] = useState(queryParam);
  const [detailId, setDetailId] = useState<number | null>(licenseParam || null);
  const [tab, setTab] = useState<DetailTab>('summary');
  const [busy, setBusy] = useState(false);

  const [extendForm, setExtendForm] = useState({ months: '1', seats: '', plan_code: '', reason: '' });
  const [seatsForm, setSeatsForm] = useState({ seats: '', reason: '' });
  const [statusForm, setStatusForm] = useState({ status: 'suspended', reason: '' });

  const list = useAsync(
    () =>
      adminApi.subscribers({
        q: queryParam || undefined,
        status: status || undefined,
        plan_code: plan || undefined,
        page,
        limit: 12,
      }),
    [queryParam, status, plan, page],
  );

  const plansState = useAsync(() => adminApi.plans(), []);
  const plans: AdminPlan[] = useMemo(() => plansState.data?.plans ?? [], [plansState.data]);

  const detail = useAsync(
    () => (detailId ? adminApi.subscriber(detailId) : Promise.resolve(null)),
    [detailId],
  );

  useEffect(() => {
    if (detail.data?.subscriber) {
      const subscriber = detail.data.subscriber;
      setExtendForm({
        months: '1',
        seats: String(subscriber.seats),
        plan_code: subscriber.plan_code ?? '',
        reason: '',
      });
      setSeatsForm({ seats: String(subscriber.seats), reason: '' });
      setStatusForm({ status: subscriber.status === 'suspended' ? 'active' : 'suspended', reason: '' });
      setTab('summary');
    }
  }, [detail.data?.subscriber]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const openDetail = (id: number) => {
    setDetailId(id);
    const next = new URLSearchParams(params);
    next.set('license', String(id));
    setParams(next, { replace: true });
  };

  const closeDetail = () => {
    setDetailId(null);
    const next = new URLSearchParams(params);
    next.delete('license');
    setParams(next, { replace: true });
  };

  const refreshAll = async () => {
    await list.reload();
    if (detailId) await detail.reload(true);
  };

  const extend = async (event: FormEvent) => {
    event.preventDefault();
    if (!detailId) return;
    setBusy(true);
    try {
      await adminApi.extendSubscriber(detailId, {
        months: Number(extendForm.months),
        seats: extendForm.seats ? Number(extendForm.seats) : null,
        plan_code: extendForm.plan_code || null,
        reason: extendForm.reason.trim(),
      });
      toast.success('اشتراک تمدید و در تاریخچه ثبت شد.');
      await refreshAll();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const changeSeats = async (event: FormEvent) => {
    event.preventDefault();
    if (!detailId) return;
    setBusy(true);
    try {
      await adminApi.setSubscriberSeats(detailId, Number(seatsForm.seats), seatsForm.reason.trim());
      toast.success('سقف کاربران به‌روزرسانی شد.');
      await refreshAll();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (event: FormEvent) => {
    event.preventDefault();
    if (!detailId) return;
    setBusy(true);
    try {
      await adminApi.setSubscriberStatus(detailId, statusForm.status as 'active' | 'suspended' | 'canceled', statusForm.reason.trim());
      toast.success('وضعیت اشتراک تغییر کرد.');
      await refreshAll();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const subscribers = list.data?.subscribers ?? [];
  const stats = list.data?.stats;
  const subscriber = detail.data?.subscriber ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="کل مشترکان" value={`${toFaDigits(stats?.total ?? 0)} مورد`} icon={Users} />
        <KpiCard label="فعال" value={`${toFaDigits(stats?.active ?? 0)} مورد`} icon={Users} tone="neon" hint={`${toFaDigits(stats?.trial ?? 0)} آزمایشی`} />
        <KpiCard label="نزدیک انقضا" value={`${toFaDigits(stats?.expiring_soon ?? 0)} مورد`} icon={CalendarClock} tone="warning" />
        <KpiCard label="درآمد این ماه" value={formatMoney(stats?.revenue_month ?? 0, 'toman')} icon={Users} tone="info" hint={`کل: ${formatMoney(stats?.revenue_total ?? 0, 'toman')}`} />
      </div>

      <Panel
        title="مشترکان"
        subtitle="جست‌وجو، فیلتر و مدیریت اشتراک با ثبت دلیل"
        icon={Users}
        actions={<RefreshButton onClick={() => void list.reload()} loading={list.loading} />}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              setParam('q', term.trim());
            }}
          >
            <Search className="absolute end-2.5 top-2.5 h-4 w-4 text-white/35" aria-hidden />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="نام فروشگاه، مالک، موبایل یا ایمیل"
              aria-label="جست‌وجوی مشترک"
              className="h-9 w-64 border-white/10 bg-white/[0.05] pe-8 text-white placeholder:text-white/35"
            />
          </form>

          <Select value={status || 'all'} onValueChange={(value) => setParam('status', value === 'all' ? '' : value)}>
            <SelectTrigger className="h-9 w-40 border-white/10 bg-white/[0.05] text-white" aria-label="وضعیت اشتراک">
              <SelectValue placeholder="همهٔ وضعیت‌ها" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
              <SelectItem value="active">فعال</SelectItem>
              <SelectItem value="expired">منقضی</SelectItem>
              <SelectItem value="suspended">تعلیق</SelectItem>
              <SelectItem value="pending">در انتظار پرداخت</SelectItem>
              <SelectItem value="canceled">لغوشده</SelectItem>
            </SelectContent>
          </Select>

          <Select value={plan || 'all'} onValueChange={(value) => setParam('plan', value === 'all' ? '' : value)}>
            <SelectTrigger className="h-9 w-36 border-white/10 bg-white/[0.05] text-white" aria-label="پلن">
              <SelectValue placeholder="همهٔ پلن‌ها" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ پلن‌ها</SelectItem>
              {plans.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {list.error && <p className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{list.error}</p>}
        {list.loading && !list.data && <LoadingRows rows={5} />}
        {!list.loading && subscribers.length === 0 && <EmptyState text="مشترکی با این شرایط پیدا نشد." />}

        {subscribers.length > 0 && (
          <ul className="divide-y divide-white/[0.06]">
            {subscribers.map((item) => (
              <li key={item.license_id} className="flex flex-wrap items-center gap-2 py-3 text-xs">
                <Pill tone={LICENSE_STATUS_TONES[item.status]}>{LICENSE_STATUS_LABELS[item.status] ?? item.status}</Pill>
                <span className="text-sm font-bold text-white/90">{item.store_name ?? '—'}</span>
                {item.store_archived && <Pill tone="bg-orange-500/15 text-orange-300">آرشیو</Pill>}
                <span className="text-white/50">{item.owner_name ?? '—'}</span>
                <span dir="ltr" className="text-white/40">
                  {item.phone ?? ''}
                </span>
                <span className="text-white/55">
                  {item.plan_code ?? '—'} · {toFaDigits(item.active_users)}/{toFaDigits(item.seats)} کاربر
                </span>
                <span className="text-white/40">
                  {item.is_lifetime ? 'مادام‌العمر' : item.expires_at ? formatJalaliLongISO(item.expires_at) : '—'}
                </span>
                {typeof item.days_remaining === 'number' && !item.is_lifetime && (
                  <span className={cn('font-bold', item.days_remaining <= 7 ? 'text-amber-300' : 'text-white/40')}>
                    {toFaDigits(item.days_remaining)} روز
                  </span>
                )}
                {item.last_amount !== null && (
                  <span className="text-white/40">آخرین پرداخت: {formatMoney(item.last_amount, 'toman')}</span>
                )}
                <Button size="sm" variant="outline" className="ms-auto border-white/15 text-white/80" onClick={() => openDetail(item.license_id)}>
                  <UserCog aria-hidden />
                  مدیریت
                </Button>
              </li>
            ))}
          </ul>
        )}

        {list.data && <Pagination meta={list.data.meta} onChange={setPage} />}
      </Panel>

      <Dialog open={detailId !== null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/10 bg-[#0b1424] text-white sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>مدیریت مشترک — {subscriber?.store_name ?? '…'}</DialogTitle>
            <DialogDescription className="text-white/50">
              {subscriber
                ? `${subscriber.owner_name ?? 'بدون مالک'} · ${subscriber.phone ?? '—'} · ${subscriber.plan_code ?? '—'} · ${toFaDigits(subscriber.active_users)}/${toFaDigits(subscriber.seats)} کاربر`
                : 'در حال بارگذاری…'}
            </DialogDescription>
          </DialogHeader>

          {detail.loading && !detail.data && <LoadingRows rows={3} />}
          {detail.error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{detail.error}</p>}

          {detail.data && subscriber && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['summary', 'خلاصه'],
                    ['payments', `پرداخت‌ها (${toFaDigits(detail.data.payments.length)})`],
                    ['history', 'تاریخچه'],
                    ['users', `کاربران (${toFaDigits(detail.data.users.length)})`],
                  ] as const
                ).map(([key, label]) => (
                  <Button key={key} size="sm" variant={tab === key ? 'default' : 'ghost'} className={tab === key ? '' : 'text-white/60'} onClick={() => setTab(key)}>
                    {label}
                  </Button>
                ))}
              </div>

              {tab === 'summary' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Info label="وضعیت" value={LICENSE_STATUS_LABELS[subscriber.status] ?? subscriber.status} />
                  <Info label="سطح" value={subscriber.tier} />
                  <Info label="شروع" value={subscriber.starts_at ? formatJalaliLongISO(subscriber.starts_at) : '—'} />
                  <Info label="انقضا" value={subscriber.is_lifetime ? 'مادام‌العمر' : subscriber.expires_at ? formatJalaliLongISO(subscriber.expires_at) : '—'} />
                  <Info label="کاربران فعال" value={`${toFaDigits(subscriber.active_users)} از ${toFaDigits(subscriber.seats)}`} />
                  <Info label="آخرین تراکنش" value={subscriber.last_transaction ?? '—'} />
                </div>
              )}

              {tab === 'payments' && (
                <ul className="divide-y divide-white/[0.06] text-xs">
                  {detail.data.payments.length === 0 && <EmptyState text="پرداختی ثبت نشده است." />}
                  {detail.data.payments.map((payment) => (
                    <li key={payment.id} className="flex flex-wrap items-center gap-2 py-2">
                      <Pill tone={payment.status === 'paid' ? 'bg-emerald-500/15 text-emerald-300' : payment.status === 'voided' ? 'bg-fuchsia-500/15 text-fuchsia-300' : 'bg-white/10 text-white/60'}>
                        {payment.status}
                      </Pill>
                      <span className="text-white/70">#{toFaDigits(payment.id)}</span>
                      <span className="text-white/50">{payment.plan}</span>
                      <span className="text-white/50">
                        {toFaDigits(payment.seats)} کاربر · {toFaDigits(payment.months)} ماه
                      </span>
                      <span className="font-bold text-emerald-300">{formatMoney(payment.amount, 'toman')}</span>
                      <span className="text-white/35">{payment.reference_id ?? '—'}</span>
                      <span className="ms-auto text-[10px] text-white/35">
                        {payment.created_at ? formatJalaliLongISO(payment.created_at) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {tab === 'history' && (
                <ul className="divide-y divide-white/[0.06] text-xs">
                  {detail.data.history.length === 0 && <EmptyState text="تاریخچه‌ای ثبت نشده است." />}
                  {detail.data.history.map((row) => (
                    <li key={row.id} className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white/80">{row.action}</span>
                        {row.reason && <span className="text-amber-300">دلیل: {row.reason}</span>}
                        <span className="ms-auto text-[10px] text-white/35">{row.created_at ? formatJalaliLongISO(row.created_at) : '—'}</span>
                      </div>
                      {row.payload && (
                        <pre dir="ltr" className="mt-1 overflow-x-auto rounded-lg bg-black/30 p-2 text-[10px] text-white/40">
                          {JSON.stringify(row.payload)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {tab === 'users' && (
                <ul className="divide-y divide-white/[0.06] text-xs">
                  {detail.data.users.length === 0 && <EmptyState text="کاربری ثبت نشده است." />}
                  {detail.data.users.map((user) => (
                    <li key={user.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="font-bold text-white/80">{user.name}</span>
                      <span dir="ltr" className="text-white/40">
                        {user.email}
                      </span>
                      <Pill tone={user.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/50'}>
                        {user.is_active ? 'فعال' : 'غیرفعال'}
                      </Pill>
                      <span className="ms-auto text-[10px] text-white/35">
                        {user.last_login_at ? formatJalaliLongISO(user.last_login_at) : 'بدون ورود'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid gap-3 border-t border-white/10 pt-3 md:grid-cols-3">
                <form onSubmit={extend} className="space-y-2 rounded-xl border border-white/10 p-3">
                  <p className="text-xs font-bold text-white/80">تمدید / اصلاح دوره</p>
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    value={extendForm.months}
                    onChange={(event) => setExtendForm({ ...extendForm, months: event.target.value })}
                    aria-label="ماه تمدید"
                    className="border-white/10 bg-white/[0.05] text-white"
                  />
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    value={extendForm.seats}
                    onChange={(event) => setExtendForm({ ...extendForm, seats: event.target.value })}
                    aria-label="سقف کاربران در تمدید"
                    className="border-white/10 bg-white/[0.05] text-white"
                  />
                  <Select value={extendForm.plan_code || 'same'} onValueChange={(value) => setExtendForm({ ...extendForm, plan_code: value === 'same' ? '' : value })}>
                    <SelectTrigger className="h-9 border-white/10 bg-white/[0.05] text-white" aria-label="پلن تمدید">
                      <SelectValue placeholder="پلن فعلی" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same">پلن فعلی</SelectItem>
                      {plans.map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={extendForm.reason}
                    onChange={(event) => setExtendForm({ ...extendForm, reason: event.target.value })}
                    placeholder="دلیل (الزامی)"
                    aria-label="دلیل تمدید"
                    required
                    className="border-white/10 bg-white/[0.05] text-white"
                  />
                  <Button type="submit" size="sm" variant="neon" disabled={busy || extendForm.reason.trim().length < 3}>
                    ثبت تمدید
                  </Button>
                </form>

                <form onSubmit={changeSeats} className="space-y-2 rounded-xl border border-white/10 p-3">
                  <p className="text-xs font-bold text-white/80">تغییر سقف کاربران</p>
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    value={seatsForm.seats}
                    onChange={(event) => setSeatsForm({ ...seatsForm, seats: event.target.value })}
                    aria-label="سقف کاربران"
                    className="border-white/10 bg-white/[0.05] text-white"
                  />
                  <Input
                    value={seatsForm.reason}
                    onChange={(event) => setSeatsForm({ ...seatsForm, reason: event.target.value })}
                    placeholder="دلیل (الزامی)"
                    aria-label="دلیل تغییر سقف"
                    required
                    className="border-white/10 bg-white/[0.05] text-white"
                  />
                  <Button type="submit" size="sm" variant="outline" className="border-white/15 text-white/80" disabled={busy || seatsForm.reason.trim().length < 3}>
                    ذخیرهٔ سقف
                  </Button>
                </form>

                <form onSubmit={changeStatus} className="space-y-2 rounded-xl border border-white/10 p-3">
                  <p className="text-xs font-bold text-white/80">وضعیت اشتراک</p>
                  <Select value={statusForm.status} onValueChange={(value) => setStatusForm({ ...statusForm, status: value })}>
                    <SelectTrigger className="h-9 border-white/10 bg-white/[0.05] text-white" aria-label="وضعیت جدید">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">فعال</SelectItem>
                      <SelectItem value="suspended">تعلیق</SelectItem>
                      <SelectItem value="canceled">لغو</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={statusForm.reason}
                    onChange={(event) => setStatusForm({ ...statusForm, reason: event.target.value })}
                    placeholder="دلیل (الزامی)"
                    aria-label="دلیل تغییر وضعیت"
                    required
                    className="border-white/10 bg-white/[0.05] text-white"
                  />
                  <Button type="submit" size="sm" variant="outline" className="border-white/15 text-white/80" disabled={busy || statusForm.reason.trim().length < 3}>
                    اعمال وضعیت
                  </Button>
                </form>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs">
      <p className="text-[10px] text-white/40">{label}</p>
      <p className="mt-0.5 font-bold text-white/85">{value}</p>
    </div>
  );
}

export type { Subscriber };
