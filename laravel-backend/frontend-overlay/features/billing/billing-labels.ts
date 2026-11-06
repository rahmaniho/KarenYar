/**
 * برچسب‌ها و نوع‌های مشترک بخش فروش/تمدید.
 *
 * جدا از کامپوننت نگه داشته شده تا Fast Refresh وات‌چ‌داگ نگیرد و تست‌ها هم
 * بتوانند همان برچسب‌ها را assert کنند.
 */
import type { LicenseTier } from '@/store/auth-store';

export interface BillingPlan {
  key: string;
  label: string;
  tier: LicenseTier;
  months: number | null;
  amount: number;
  is_lifetime: boolean;
  description: string;
}

export interface BillingGateway {
  key: string;
  label: string;
}

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'canceled';

export interface BillingOrder {
  id: number;
  store_name?: string | null;
  plan: string;
  plan_label: string;
  tier: LicenseTier;
  months: number;
  is_lifetime: boolean;
  amount: number;
  status: OrderStatus;
  gateway: string;
  reference_id: string | null;
  paid_at: string | null;
  created_at: string | null;
  instructions?: string | null;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'در انتظار پرداخت',
  paid: 'پرداخت‌شده',
  failed: 'ناموفق',
  canceled: 'لغو‌شده',
};

export const ORDER_STATUS_TONES: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  canceled: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
};

/** سطح نمایشی: لایسنس می‌تواند «رایگان» هم باشد. */
export type DisplayTier = LicenseTier | 'free';

export const TIER_LABELS: Record<DisplayTier, string> = {
  free: 'رایگان',
  pro: 'حرفه‌ای',
  proplus: 'کامل (Pro+)',
};

export const GATEWAY_LABELS: Record<string, string> = {
  manual: 'کارت به کارت / واریز بانکی',
  zarinpal: 'درگاه زرین‌پال',
};

/** «ماهانه» / «سالانه» / «مادام‌العمر» */
export function planPeriodLabel(plan: BillingPlan): string {
  if (plan.is_lifetime) return 'مادام‌العمر';
  if (plan.months === 12) return 'یک‌ساله';
  if (plan.months === 1) return 'یک‌ماهه';
  return plan.months ? `${plan.months} ماهه` : '';
}

/** پیام وضعیت لایسنس برای نمایش در کارت اشتراک. */
export function licenseStatusMessage(
  license: {
    is_lifetime: boolean;
    is_active: boolean;
    days_remaining: number | null;
    is_trial?: boolean;
  } | null,
): string {
  if (!license) return 'هنوز لایسنسی برای این فروشگاه صادر نشده است.';
  if (!license.is_active)
    return 'این لایسنس از طرف پشتیبانی غیرفعال شده است؛ داده‌های شما محفوظ است.';
  if (license.is_lifetime) return 'لایسنس مادام‌العمر فعال است؛ نیازی به تمدید نیست.';

  const days = license.days_remaining ?? 0;
  if (license.days_remaining !== null && days <= 0) {
    return 'اعتبار لایسنس به پایان رسیده است. با تمدید، همهٔ امکانات بلافاصله برمی‌گردد.';
  }
  if (license.is_trial) {
    return `دورهٔ آزمایشی رایگان — ${days} روز باقی مانده است.`;
  }
  return `اشتراک فعال است — ${days} روز تا تمدید بعدی.`;
}

/** پرداخت در انتظار تأیید مدیر (کارت‌به‌کارت) — متن راهنما. */
export function manualInstructions(order: BillingOrder | null): string | null {
  if (!order || order.status !== 'pending') return null;
  return order.instructions ?? null;
}
