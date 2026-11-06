/**
 * نوع‌ها و موتور نمایش قیمت اشتراک.
 *
 * منبع قیمت سرور است (`subscription_plans`)؛ این ماژول فقط همان فرمول رسمی را
 * برای نمایش فوری به‌کار می‌برد و هیچ عدد ثابتی در خود ندارد. مبلغ نهایی همیشه
 * در پرداخت، دوباره در سرور محاسبه و ملاک قرار می‌گیرد.
 */

export interface SubscriptionPlan {
  code: string;
  name: string;
  tier: 'pro' | 'proplus';
  description: string | null;
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

export interface CouponRule {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
}

export interface SubscriptionQuote {
  plan_code: string;
  plan_name: string;
  tier: 'pro' | 'proplus';
  seats: number;
  extra_users: number;
  months: number;
  is_lifetime: boolean;
  base_monthly: number;
  extra_user_monthly: number;
  extra_monthly: number;
  monthly_total: number;
  base_total: number;
  extra_total: number;
  subtotal: number;
  discount: number;
  total: number;
  coupon_code: string | null;
  currency: string;
}

export interface SeatUsage {
  used: number;
  allowed: number;
  remaining: number;
  can_add: boolean;
}

/** تعداد ماه‌های مجاز — سرور همین فهرست را برمی‌گرداند. */
export const DEFAULT_ALLOWED_MONTHS = [1, 2, 3, 4, 6, 9, 12, 18, 24];

/** فرمول رسمی: (پایه + کاربران اضافه × هزینهٔ کاربر اضافه) × ماه − تخفیف */
export function computeQuote(
  plan: SubscriptionPlan,
  seats: number,
  months: number,
  coupon: CouponRule | null = null,
): SubscriptionQuote {
  const safeSeats = Math.min(
    Math.max(seats, Math.max(1, plan.min_seats)),
    Math.max(1, plan.max_seats),
  );
  const safeMonths = Math.max(1, Math.round(months));

  const extraUsers = Math.max(0, safeSeats - 1);
  const extraMonthly = plan.extra_user_monthly * extraUsers;
  const monthlyTotal = plan.base_monthly + extraMonthly;

  const baseTotal = plan.base_monthly * safeMonths;
  const extraTotal = extraMonthly * safeMonths;
  const subtotal = baseTotal + extraTotal;

  const rawDiscount = coupon
    ? coupon.type === 'percent'
      ? Math.round((subtotal * Math.min(100, Math.max(0, coupon.value))) / 100)
      : Math.max(0, coupon.value)
    : 0;
  const discount = Math.min(subtotal, rawDiscount);

  return {
    plan_code: plan.code,
    plan_name: plan.name,
    tier: plan.tier,
    seats: safeSeats,
    extra_users: extraUsers,
    months: safeMonths,
    is_lifetime: plan.is_lifetime,
    base_monthly: plan.base_monthly,
    extra_user_monthly: plan.extra_user_monthly,
    extra_monthly: extraMonthly,
    monthly_total: monthlyTotal,
    base_total: baseTotal,
    extra_total: extraTotal,
    subtotal,
    discount,
    total: subtotal - discount,
    coupon_code: coupon?.code ?? null,
    currency: 'toman',
  };
}

/** «۱۲ ماه» / «یک‌ساله» / «مادام‌العمر» */
export function durationLabel(months: number, isLifetime = false): string {
  if (isLifetime) return 'مادام‌العمر';
  if (months === 12) return 'یک‌ساله (۱۲ ماه)';
  if (months === 24) return 'دوساله (۲۴ ماه)';
  return `${months} ماه`;
}

export const STATUS_LABELS: Record<string, string> = {
  active: 'فعال',
  expired: 'منقضی‌شده',
  pending: 'در انتظار پرداخت',
  canceled: 'لغوشده',
  suspended: 'تعلیق‌شده',
  renewal_pending: 'در انتظار تمدید',
};

export const STATUS_TONES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  expired: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  canceled: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
  suspended: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  renewal_pending: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
};

export const ORDER_TYPE_LABELS: Record<string, string> = {
  new: 'خرید اولیه',
  renewal: 'تمدید',
  upgrade: 'ارتقای پلن',
  seats: 'افزایش کاربر',
};
