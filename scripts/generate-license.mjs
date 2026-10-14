/**
 * تولید کلید لایسنس آفلاین حساب‌یار کارن سافت (HMAC-SHA256)
 *
 * اجرا:
 *   node scripts/generate-license.mjs --tier pro --name "فروشگاه نمونه"
 *   node scripts/generate-license.mjs --tier proplus --name "شرکت نمونه" --days 365
 *
 * ⚠️ نکته‌ی امنیتی: در نسخه‌ی فروش نهایی، این اسکریپت و کلید محرمانه (SECRET)
 * باید فقط روی سیستم فروشنده بماند و هرگز همراه سورس به مشتری داده نشود.
 * برای امنیت بالاتر، لایه‌ی تأیید (LicenseVerifier) طوری طراحی شده که
 * بعداً با امضای RSA/Ed25519 و سرور جایگزین شود — بدون تغییر در بقیه‌ی کد.
 * مقدار SECRET باید با LICENSE_HMAC_SECRET در src/core/license/license-core.ts یکسان باشد.
 */
import { createHmac } from 'node:crypto';

export const LICENSE_HMAC_SECRET =
  process.env.KARENSOFT_LICENSE_SECRET ?? 'karensoft-hesabyar::license-secret::v1::CHANGE-ME';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const tier = arg('tier', 'pro');
const name = arg('name', 'کاربر حساب‌یار');
const daysRaw = arg('days', null);
if (!['pro', 'proplus'].includes(tier)) {
  console.error('خطا: --tier باید یکی از pro یا proplus باشد.');
  process.exit(1);
}

const now = new Date();
const payload = {
  v: 1,
  tier,
  name,
  iat: now.toISOString().slice(0, 10),
  exp: daysRaw ? new Date(now.getTime() + Number(daysRaw) * 86400000).toISOString().slice(0, 10) : null,
};
const payloadB64 = b64url(JSON.stringify(payload));
const sig = createHmac('sha256', LICENSE_HMAC_SECRET).update(payloadB64).digest();
const key = `KS1.${payloadB64}.${b64url(sig)}`;

console.log('\n🔑 کلید لایسنس حساب‌یار کارن سافت');
console.log('سطح:', tier === 'pro' ? 'حرفه‌ای (Lifetime)' : 'Pro+ (اشتراکی)');
console.log('نام دارنده:', name);
console.log('تاریخ صدور:', payload.iat, '| انقضا:', payload.exp ?? 'مادام‌العمر');
console.log('\n' + key + '\n');
