/**
 * تیپ‌ها و برچسب‌های مشترک پنل مدیریت.
 *
 * همهٔ مبالغ «تومان» و همهٔ تاریخ‌ها ISO از سرور می‌آیند؛ نمایش جلالی و ارقام فارسی
 * در لایهٔ نمایش انجام می‌شود.
 */
import type { StoreLicense } from '@/store/auth-store';

export interface DashboardKpis {
  revenue_today: number;
  revenue_month: number;
  revenue_prev_month: number;
  revenue_year: number;
  growth_month_pct: number;
  mrr: number;
  arr: number;
  orders_pending: number;
  orders_pending_amount: number;
  subs_active: number;
  subs_trial: number;
  subs_expiring_7: number;
  subs_expired: number;
  subs_suspended: number;
  stores_total: number;
  stores_archived: number;
  stores_new_month: number;
}

export interface AdminOrder {
  id: number;
  store_id: number;
  store_name?: string | null;
  plan: string;
  plan_label: string;
  tier: string;
  type: OrderType;
  months: number;
  seats: number;
  amount: number;
  status: OrderStatus;
  gateway: string;
  reference_id: string | null;
  paid_at: string | null;
  created_at: string | null;
  invoice_number?: string | null;
  invoice_voided?: boolean;
  voided_at?: string | null;
  void_reason?: string | null;
  is_voided?: boolean;
  coupon_code?: string | null;
  discount?: number;
}

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'canceled' | 'voided';
export type OrderType = 'new' | 'renewal' | 'upgrade' | 'seats';

export interface RevenuePoint {
  month: string;
  label: string;
  amount: number;
  orders: number;
}

export interface PlanBreakdown {
  plan: string;
  name: string;
  orders: number;
  revenue: number;
  subscribers: number;
}

export interface DashboardData {
  generated_at: string;
  kpis: DashboardKpis;
  revenue_trend: RevenuePoint[];
  plan_breakdown: PlanBreakdown[];
  status_breakdown: { key: string; label: string; value: number }[];
  recent_orders: AdminOrder[];
  expiring_soon: {
    license_id: number;
    store_id: number;
    store_name: string | null;
    plan_code: string | null;
    seats: number;
    expires_at: string | null;
    days_remaining: number | null;
    is_trial: boolean;
  }[];
  top_coupons: { code: string; uses: number; revenue: number }[];
}

export interface AdminStore {
  id: number;
  name: string;
  slug: string;
  owner_name: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  archived_at: string | null;
  is_archived: boolean;
  /** فروشگاه آزمایشی کوتاه‌عمر (دمو) — از آمار درآمد/مشترکان جدا است */
  is_demo?: boolean;
  demo_expires_at?: string | null;
  users_count?: number;
  active_users_count?: number;
  license: StoreLicense | null;
  created_at: string | null;
}

export interface Subscriber {
  license_id: number;
  store_id: number;
  store_name: string | null;
  owner_name: string | null;
  phone: string | null;
  store_archived: boolean;
  plan_code: string | null;
  tier: string;
  seats: number;
  active_users: number;
  status: string;
  is_active: boolean;
  is_trial: boolean;
  is_lifetime: boolean;
  starts_at: string | null;
  expires_at: string | null;
  days_remaining: number | null;
  last_transaction: string | null;
  last_amount: number | null;
}

export interface SubscriberDetail {
  subscriber: Subscriber;
  payments: {
    id: number;
    plan: string;
    type: string;
    seats: number;
    months: number;
    amount: number;
    status: string;
    gateway: string;
    reference_id: string | null;
    paid_at: string | null;
    voided_at: string | null;
    void_reason: string | null;
    created_at: string | null;
  }[];
  attempts: {
    id: number;
    order_id: number;
    gateway: string;
    amount: number;
    status: string;
    reference_id: string | null;
    verified_at: string | null;
    created_at: string | null;
  }[];
  history: {
    id: number;
    action: string;
    reason: string | null;
    payload: Record<string, unknown> | null;
    actor_id: number | null;
    created_at: string | null;
  }[];
  users: { id: number; name: string; email: string; is_active: boolean; last_login_at: string | null }[];
}

export interface AdminPlan {
  code: string;
  name: string;
  tier: 'pro' | 'proplus';
  description?: string | null;
  base_monthly: number;
  extra_user_monthly: number;
  min_seats: number;
  max_seats: number;
  is_lifetime: boolean;
  is_active: boolean;
  features: string[];
  sort_order?: number;
  sales?: { orders: number; revenue: number };
}

export interface AdminCoupon {
  id: number;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  plan_code: string | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  is_usable: boolean;
  description?: string | null;
}

export interface ManagerAccount {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
  is_self: boolean;
}

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

export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار پرداخت',
  paid: 'پرداخت‌شده',
  failed: 'ناموفق',
  canceled: 'لغوشده',
  voided: 'باطل‌شده',
};

export const ORDER_STATUS_TONES: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-300',
  paid: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-red-500/15 text-red-300',
  canceled: 'bg-slate-500/15 text-slate-300',
  voided: 'bg-fuchsia-500/15 text-fuchsia-300',
};

export const ORDER_TYPE_LABELS: Record<string, string> = {
  new: 'خرید جدید',
  renewal: 'تمدید',
  upgrade: 'ارتقا',
  seats: 'افزایش کاربر',
};

export const LICENSE_STATUS_LABELS: Record<string, string> = {
  active: 'فعال',
  expired: 'منقضی',
  pending: 'در انتظار پرداخت',
  suspended: 'تعلیق',
  canceled: 'لغوشده',
  renewal_pending: 'در انتظار تمدید',
};

export const LICENSE_STATUS_TONES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300',
  expired: 'bg-red-500/15 text-red-300',
  pending: 'bg-amber-500/15 text-amber-300',
  suspended: 'bg-orange-500/15 text-orange-300',
  canceled: 'bg-slate-500/15 text-slate-300',
  renewal_pending: 'bg-sky-500/15 text-sky-300',
};

export const GATEWAY_LABELS: Record<string, string> = {
  manual: 'کارت به کارت',
  zarinpal: 'زرین‌پال',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  login: 'ورود موفق',
  logout: 'خروج',
  login_failed: 'ورود ناموفق',
  login_blocked: 'ورود مسدود',
  store_created: 'ساخت فروشگاه',
  store_updated: 'ویرایش فروشگاه',
  store_archived: 'آرشیو فروشگاه',
  store_restored: 'بازگردانی فروشگاه',
  store_purged: 'حذف دائمی فروشگاه',
  store_self_registered: 'ثبت‌نام آنلاین فروشگاه',
  license_updated: 'تغییر لایسنس',
  admin_license_updated: 'تغییر لایسنس توسط مدیر',
  data_imported: 'انتقال داده از نسخهٔ آفلاین',
  data_wiped: 'پاک‌سازی دادهٔ فروشگاه',
  order_created: 'ساخت سفارش',
  order_paid: 'پرداخت تأییدشده',
  order_failed: 'پرداخت ناموفق',
  order_canceled: 'لغو سفارش',
  order_voided: 'ابطال پرداخت',
  order_manually_approved: 'تأیید دستی پرداخت',
  license_renewed: 'تمدید لایسنس',
  license_expiry_notice: 'یادآوری تمدید',
  license_expired_notice: 'اطلاع انقضا',
  subscription_started: 'شروع اشتراک',
  subscription_renewed: 'تمدید اشتراک',
  subscription_upgraded: 'ارتقای اشتراک',
  subscription_seats_changed: 'تغییر تعداد کاربران',
  subscription_status_changed: 'تغییر وضعیت اشتراک',
  subscription_manual_extended: 'تمدید دستی اشتراک',
  payment_voided: 'ابطال پرداخت (تاریخچه)',
  trial_started: 'شروع دورهٔ آزمایشی',
  plan_created: 'ساخت پلن',
  plan_updated: 'ویرایش پلن',
  plan_activated: 'فعال‌سازی پلن',
  plan_deactivated: 'غیرفعال‌سازی پلن',
  coupon_created: 'ساخت کد تخفیف',
  coupon_updated: 'ویرایش کد تخفیف',
  coupon_deleted: 'حذف کد تخفیف',
  team_user_created: 'افزودن کاربر فروشگاه',
  team_user_updated: 'ویرایش کاربر فروشگاه',
  team_user_disabled: 'غیرفعال‌سازی کاربر',
  team_user_enabled: 'فعال‌سازی کاربر',
  manager_created: 'ساخت مدیر',
  manager_updated: 'ویرایش مدیر',
  manager_deactivated: 'غیرفعال‌سازی مدیر',
};

export const AUDIT_ACTION_TONES: Record<string, string> = {
  login: 'bg-emerald-500/15 text-emerald-300',
  logout: 'bg-slate-500/15 text-slate-300',
  login_failed: 'bg-red-500/15 text-red-300',
  login_blocked: 'bg-red-500/15 text-red-300',
  store_created: 'bg-sky-500/15 text-sky-300',
  store_updated: 'bg-amber-500/15 text-amber-300',
  store_archived: 'bg-orange-500/15 text-orange-300',
  store_restored: 'bg-emerald-500/15 text-emerald-300',
  store_purged: 'bg-red-500/15 text-red-300',
  order_paid: 'bg-emerald-500/15 text-emerald-300',
  order_failed: 'bg-red-500/15 text-red-300',
  order_voided: 'bg-fuchsia-500/15 text-fuchsia-300',
  order_manually_approved: 'bg-emerald-500/15 text-emerald-300',
  license_updated: 'bg-violet-500/15 text-violet-300',
  admin_license_updated: 'bg-violet-500/15 text-violet-300',
  plan_created: 'bg-cyan-500/15 text-cyan-300',
  plan_updated: 'bg-amber-500/15 text-amber-300',
  coupon_created: 'bg-teal-500/15 text-teal-300',
  coupon_updated: 'bg-teal-500/15 text-teal-300',
  manager_created: 'bg-indigo-500/15 text-indigo-300',
};
