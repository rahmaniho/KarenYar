import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** ترکیب کلاس‌های Tailwind به سبک shadcn/ui */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
