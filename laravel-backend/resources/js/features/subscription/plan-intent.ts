/**
 * «پلن انتخاب‌شده» از صفحهٔ معرفی تا صفحهٔ اشتراک.
 *
 * بازدیدکننده در لندینگ روی «شروع با این پلن» می‌زند؛ پس از ثبت‌نام، همان پلن در
 * صفحهٔ اشتراک preselected می‌شود. مبلغ نهایی همیشه در سرور محاسبه می‌شود و
 * این مقدار فقط یک ترجیح نمایشی است.
 */
const KEY = 'karo:signup-plan';

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function setPlanIntent(code: string): void {
  store()?.setItem(KEY, code);
}

/** خواندن بدون پاک‌کردن (برای تصمیم مسیر پس از ثبت‌نام). */
export function peekPlanIntent(): string | null {
  return store()?.getItem(KEY) ?? null;
}

/** خواندن و پاک‌کردن (هنگام انتخاب پیش‌فرض در صفحهٔ اشتراک). */
export function takePlanIntent(): string | null {
  const current = store();
  const value = current?.getItem(KEY) ?? null;
  current?.removeItem(KEY);
  return value;
}
