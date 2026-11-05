import { useRef } from 'react';

/**
 * برای یک محتوای درخواست ثابت، کلید تلاش را بین کلیک‌های مجدد حفظ می‌کند
 * تا خطای شبکه/تراکنش باعث ثبت دوبارهٔ پرداخت نشود.
 */
export function useAttemptKey() {
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  return (payload: object) => {
    const signature = JSON.stringify(payload);
    if (!attempt.current || attempt.current.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    return attempt.current.key;
  };
}
