/** برچسب فارسی و رنگ هر نوع رویداد دفتر حسابرسی. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  login: 'ورود موفق',
  logout: 'خروج',
  login_failed: 'ورود ناموفق',
  login_blocked: 'ورود به حساب غیرفعال',
  store_created: 'ساخت فروشگاه',
  store_updated: 'ویرایش فروشگاه',
  store_deleted: 'حذف فروشگاه',
  license_updated: 'تغییر لایسنس',
  data_imported: 'انتقال داده از نسخهٔ آفلاین',
  data_wiped: 'پاک‌سازی دادهٔ فروشگاه',
};

/** کلاس رنگی نشان هر رویداد. */
export const AUDIT_ACTION_TONES: Record<string, string> = {
  login: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  logout: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  login_failed: 'bg-red-500/15 text-red-600 dark:text-red-300',
  login_blocked: 'bg-red-500/15 text-red-600 dark:text-red-300',
  store_created: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
  store_updated: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  store_deleted: 'bg-red-500/15 text-red-600 dark:text-red-300',
  license_updated: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  data_imported: 'bg-teal-500/15 text-teal-600 dark:text-teal-300',
  data_wiped: 'bg-red-500/15 text-red-600 dark:text-red-300',
};
