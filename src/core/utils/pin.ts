/**
 * قفل برنامه با PIN — فقط هش SHA-256 (با Salt) نگه داشته می‌شود، هرگز خود PIN ذخیره نمی‌شود.
 * این قفل برای حریم خصوصی روی دستگاه مشترک است، نه جایگزین رمزنگاری داده.
 */
const PIN_SALT = 'karenyar-hesabyar::pin::v1::';

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,12}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('مرورگر شما از رمزنگاری امن پشتیبانی نمی‌کند.');
  const data = new TextEncoder().encode(PIN_SALT + pin);
  const digest = await subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!isValidPinFormat(pin)) return false;
  return (await hashPin(pin)) === storedHash;
}
