/**
 * کلاینت HTTP لاراول.
 *
 * احراز هویت با نشست/کوکی انجام می‌شود. توکن CSRF از کوکی XSRF-TOKEN خوانده و
 * در هدر می‌رود (روش استاندارد axios)؛ کوکی روی هر پاسخ تازه می‌شود، پس پس از
 * ورود/خروج هم معتبر می‌ماند. همهٔ درخواست‌ها JSON هستند و کوکی نشست همراه می‌رود.
 */
import { APP_BASE_URL } from '@/lib/utils';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') {
    return '';
  }
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * توکن CSRF را از کوکی `XSRF-TOKEN` می‌خوانیم (روش استاندارد axios).
 *
 * کوکی روی هر پاسخ از سرور تازه می‌شود، پس بعد از ورود/خروج که توکن چرخیده
 * می‌شود، بلافاصله همگام است. اگر کوکی نبود، به متای صفحه برمی‌گردیم.
 */
function csrfHeaders(): Record<string, string> {
  const xsrf = readCookie('XSRF-TOKEN');
  if (xsrf) {
    return { 'X-XSRF-TOKEN': xsrf };
  }
  if (typeof document === 'undefined') {
    return {};
  }
  const meta = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  return meta ? { 'X-CSRF-TOKEN': meta } : {};
}

export function apiUrl(path: string): string {
  return `${APP_BASE_URL}${path.replace(/^\//, '')}`;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  for (const [key, value] of Object.entries(csrfHeaders())) {
    headers.set(key, value);
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
    credentials: 'same-origin',
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const payload = data as { message?: unknown; errors?: Record<string, string[]> } | null;
    const message =
      payload && typeof payload.message === 'string' && payload.message
        ? payload.message
        : `خطای سرور (${response.status})`;
    throw new ApiError(response.status, message, payload?.errors);
  }

  return data as T;
}
