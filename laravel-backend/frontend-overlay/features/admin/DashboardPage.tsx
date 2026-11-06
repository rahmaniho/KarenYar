import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowLeftRight,
  BellRing,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  Layers,
  Receipt,
  Store,
  Ticket,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { formatJalaliLongISO } from '@/core/jalali/jalali';
import { cn } from '@/lib/utils';
import { useAdminContext } from './admin-context';
import {
  EmptyState,
  KpiCard,
  LoadingRows,
  Panel,
  Pill,
  RefreshButton,
} from './admin-ui';
import { GATEWAY_LABELS, ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from './admin-types';

const STATUS_COLORS = ['#34d399', '#38bdf8', '#fbbf24', '#f87171', '#f472b6'];

export function DashboardPage() {
  const { dashboard, dashboardLoading, reloadDashboard } = useAdminContext();
  const navigate = useNavigate();

  const kpis = dashboard?.kpis;
  const chartData = useMemo(
    () => (dashboard?.revenue_trend ?? []).map((point) => ({ ...point, label: point.label })),
    [dashboard],
  );

  if (!dashboard) {
    return (
      <div className="space-y-4">
        <LoadingRows rows={3} />
        <LoadingRows rows={2} />
      </div>
    );
  }

  const statusData = dashboard.status_breakdown.filter((item) => item.value > 0);

  return (
    <div className="space-y-4">
      {/* نوار اقدام سریع */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-gradient-to-l from-emerald-500/10 via-transparent to-sky-500/10 p-3">
        <div className="me-auto">
          <p className="text-sm font-extrabold">نمای کلی کسب‌وکار</p>
          <p className="text-[11px] text-white/50">
            آخرین به‌روزرسانی: {formatJalaliLongISO(dashboard.generated_at)} · همهٔ اعداد از دادهٔ واقعی
          </p>
        </div>
        {kpis && kpis.orders_pending > 0 && (
          <Button variant="neon" size="sm" onClick={() => navigate('/admin/orders?status=pending')}>
            <CreditCard aria-hidden />
            {toFaDigits(kpis.orders_pending)} پرداخت در انتظار تأیید
          </Button>
        )}
        <Button variant="outline" size="sm" className="border-white/15 text-white" onClick={() => navigate('/admin/stores?new=1')}>
          <Store aria-hidden />
          فروشگاه جدید
        </Button>
        <RefreshButton onClick={() => void reloadDashboard()} loading={dashboardLoading} />
      </div>

      {/* KPI ها */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="درآمد این ماه"
          value={formatMoney(kpis?.revenue_month ?? 0, 'toman')}
          icon={CircleDollarSign}
          tone="neon"
          trend={kpis?.growth_month_pct ?? 0}
          hint={`ماه قبل: ${formatMoney(kpis?.revenue_prev_month ?? 0, 'toman')}`}
        />
        <KpiCard
          label="MRR برآوردی"
          value={formatMoney(kpis?.mrr ?? 0, 'toman')}
          icon={TrendingUp}
          tone="info"
          hint={`سالانه: ${formatMoney(kpis?.arr ?? 0, 'toman')}`}
        />
        <KpiCard
          label="مشترکان فعال"
          value={`${toFaDigits(kpis?.subs_active ?? 0)} فروشگاه`}
          icon={Users}
          hint={`${toFaDigits(kpis?.subs_trial ?? 0)} آزمایشی · ${toFaDigits(kpis?.subs_expired ?? 0)} منقضی`}
        />
        <KpiCard
          label="پرداخت در انتظار"
          value={formatMoney(kpis?.orders_pending_amount ?? 0, 'toman')}
          icon={Receipt}
          tone="warning"
          hint={`${toFaDigits(kpis?.orders_pending ?? 0)} سفارش نیازمند بررسی`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="فروشگاه‌ها"
          value={`${toFaDigits(kpis?.stores_total ?? 0)} فعال`}
          icon={Store}
          hint={`${toFaDigits(kpis?.stores_new_month ?? 0)} جدید این ماه · ${toFaDigits(kpis?.stores_archived ?? 0)} آرشیو`}
        />
        <KpiCard
          label="نزدیک انقضا (۷ روز)"
          value={`${toFaDigits(kpis?.subs_expiring_7 ?? 0)} مورد`}
          icon={CalendarClock}
          tone="warning"
          hint="نیازمند پیگیری تمدید"
        />
        <KpiCard
          label="تعلیق‌شده"
          value={`${toFaDigits(kpis?.subs_suspended ?? 0)} مورد`}
          icon={AlertTriangle}
          tone="danger"
          hint="دسترسی بسته، داده حفظ شده"
        />
        <KpiCard
          label="درآمد امروز"
          value={formatMoney(kpis?.revenue_today ?? 0, 'toman')}
          icon={ArrowLeftRight}
          hint={`سال جاری: ${formatMoney(kpis?.revenue_year ?? 0, 'toman')}`}
        />
      </div>

      {/* نمودارها */}
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel
          title="روند درآمد ۱۲ ماه"
          subtitle="مجموع پرداخت‌های تأییدشده (تومان)"
          icon={TrendingUp}
          className="xl:col-span-2"
        >
          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#39ff88" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#39ff88" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: number) => (value >= 1_000_000 ? `${value / 1_000_000}M` : `${value / 1000}k`)}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0b1424',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12,
                    fontSize: 12,
                    direction: 'rtl',
                  }}
                  formatter={(value: number) => [formatMoney(value, 'toman'), 'درآمد']}
                />
                <Area type="monotone" dataKey="amount" stroke="#39ff88" strokeWidth={2} fill="url(#revenueFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="ترکیب مشترکان" subtitle="وضعیت اشتراک فروشگاه‌ها" icon={Users}>
          {statusData.length === 0 ? (
            <EmptyState text="هنوز اشتراکی ثبت نشده است." />
          ) : (
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="label" innerRadius={52} outerRadius={82} paddingAngle={3}>
                    {statusData.map((entry, index) => (
                      <Cell key={entry.key} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#0b1424',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 12,
                      fontSize: 12,
                      direction: 'rtl',
                    }}
                    formatter={(value: number, name: string) => [`${toFaDigits(value)} فروشگاه`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="-mt-2 flex flex-wrap justify-center gap-2 text-[11px] text-white/60">
                {statusData.map((entry, index) => (
                  <span key={entry.key} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: STATUS_COLORS[index % STATUS_COLORS.length] }}
                    />
                    {entry.label} ({toFaDigits(entry.value)})
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="درآمد و فروش هر پلن" subtitle="پرداخت‌های تأییدشده" icon={Layers}>
          {dashboard.plan_breakdown.length === 0 ? (
            <EmptyState text="پلنی ثبت نشده است." />
          ) : (
            <div className="h-56" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.plan_breakdown} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(value: number) => (value >= 1_000_000 ? `${value / 1_000_000}M` : `${value / 1000}k`)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0b1424',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 12,
                      fontSize: 12,
                      direction: 'rtl',
                    }}
                    formatter={(value: number) => [formatMoney(value, 'toman'), 'درآمد']}
                  />
                  <Bar dataKey="revenue" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="mt-2 space-y-1 text-xs text-white/60">
            {dashboard.plan_breakdown.map((plan) => (
              <li key={plan.plan} className="flex items-center gap-2">
                <span className="font-bold text-white/80">{plan.name}</span>
                <span className="text-white/40">{toFaDigits(plan.subscribers)} مشترک</span>
                <span className="ms-auto">{formatMoney(plan.revenue, 'toman')}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="آخرین پرداخت‌ها" subtitle="۸ سفارش اخیر" icon={Receipt} actions={<Button asChild size="sm" variant="ghost" className="text-white/70"><Link to="/admin/orders">همه</Link></Button>}>
          {dashboard.recent_orders.length === 0 ? (
            <EmptyState text="سفارشی ثبت نشده است." />
          ) : (
            <ul className="divide-y divide-white/[0.06] text-xs">
              {dashboard.recent_orders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Pill tone={ORDER_STATUS_TONES[order.status]}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</Pill>
                  <span className="font-bold text-white/85">{order.store_name ?? 'فروشگاه'}</span>
                  <span className="text-white/40">{GATEWAY_LABELS[order.gateway] ?? order.gateway}</span>
                  <span className="ms-auto font-bold text-emerald-300">{formatMoney(order.amount, 'toman')}</span>
                  <span className="w-full text-[10px] text-white/35 sm:w-auto">
                    {order.created_at ? formatJalaliLongISO(order.created_at) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="نزدیک انقضا" subtitle="۱۴ روز آینده" icon={BellRing}>
          {dashboard.expiring_soon.length === 0 ? (
            <EmptyState text="هیچ اشتراکی نزدیک انقضا نیست." />
          ) : (
            <ul className="space-y-2 text-xs">
              {dashboard.expiring_soon.map((item) => (
                <li key={item.license_id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white/85">{item.store_name ?? '—'}</span>
                    {item.is_trial && <Pill tone="bg-sky-500/15 text-sky-300">آزمایشی</Pill>}
                    <span className="ms-auto font-bold text-amber-300">
                      {toFaDigits(item.days_remaining ?? 0)} روز
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-white/40">
                    <span>{item.plan_code ?? '—'}</span>
                    <span>{toFaDigits(item.seats)} کاربر</span>
                    <Link className="ms-auto text-emerald-300 hover:underline" to={`/admin/subscribers?license=${item.license_id}`}>
                      مدیریت
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="کدهای تخفیف پرمصرف" subtitle="بر اساس سفارش‌های پرداخت‌شده" icon={Ticket}>
          {dashboard.top_coupons.length === 0 ? (
            <EmptyState text="کوپنی استفاده نشده است." />
          ) : (
            <ul className="space-y-2 text-xs">
              {dashboard.top_coupons.map((coupon) => (
                <li key={coupon.code} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                  <span dir="ltr" className="font-mono text-[11px] text-white/80">
                    {coupon.code}
                  </span>
                  <span className="text-white/40">{toFaDigits(coupon.uses)} استفاده</span>
                  <span className="ms-auto text-emerald-300">{formatMoney(coupon.revenue, 'toman')}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="اقدام‌های پیشنهادی" subtitle="اولویت امروز" icon={AlertTriangle}>
          <div className="space-y-2 text-xs">
            <ActionRow
              label="تأیید پرداخت‌های دستی"
              value={`${toFaDigits(kpis?.orders_pending ?? 0)} مورد`}
              tone={cn((kpis?.orders_pending ?? 0) > 0 ? 'text-amber-300' : 'text-white/40')}
              to="/admin/orders?status=pending"
            />
            <ActionRow
              label="تمدید اشتراک‌های نزدیک انقضا"
              value={`${toFaDigits(kpis?.subs_expiring_7 ?? 0)} مورد`}
              tone={cn((kpis?.subs_expiring_7 ?? 0) > 0 ? 'text-amber-300' : 'text-white/40')}
              to="/admin/subscribers?status=active"
            />
            <ActionRow
              label="بررسی اشتراک‌های منقضی"
              value={`${toFaDigits(kpis?.subs_expired ?? 0)} مورد`}
              tone={cn((kpis?.subs_expired ?? 0) > 0 ? 'text-red-300' : 'text-white/40')}
              to="/admin/subscribers?status=expired"
            />
            <ActionRow
              label="فروشگاه‌های آرشیوشده"
              value={`${toFaDigits(kpis?.stores_archived ?? 0)} مورد`}
              tone="text-white/40"
              to="/admin/stores?status=archived"
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ActionRow({ label, value, tone, to }: { label: string; value: string; tone: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 transition-colors hover:bg-white/[0.07]"
    >
      <span className="text-white/75">{label}</span>
      <span className={cn('ms-auto font-bold', tone)}>{value}</span>
    </Link>
  );
}
