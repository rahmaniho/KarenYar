/**
 * راستی‌آزمایی آفلاین توکن لایسنس HY2 با کلید عمومی Ed25519 issuer.
 *
 * قالب: HY2.<header-b64url>.<claims-b64url>.<signature-b64url>
 * امضا روی رشته‌ی «header.claims» است. این بررسی جای بررسی آنلاین سرور
 * (لغو دستگاه/لایسنس) را نمی‌گیرد؛ برای مصرف آفلاین بین دو بررسی است.
 */
import { LicenseError } from '../license-core';

export interface LicenseTokenHeader {
  alg: string;
  typ: string;
  kid: string;
  env: string;
}

export interface LicenseTokenClaims {
  iss: string;
  aud: string;
  env: string;
  /** کد مشتری */
  sub: string;
  /** شناسه‌ی عمومی لایسنس */
  jti: string;
  product: string;
  plan: string;
  features: string[];
  device_key_id: string;
  device_id: number;
  max_devices: number;
  iat: number;
  nbf: number;
  exp: number;
  /** انقضای خود لایسنس (epoch seconds) — اختیاری؛ null یعنی مادام‌العمر */
  license_exp?: number | null;
}

export interface VerifiedToken {
  header: LicenseTokenHeader;
  claims: LicenseTokenClaims;
}

export interface VerifyTokenOptions {
  publicKeyB64: string;
  kid: string;
  environment: string;
  product: string;
  deviceKeyId: string;
  nowMs?: number;
  clockSkewSeconds?: number;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function base64UrlToBytes(text: string): Uint8Array {
  const normalized = text.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const STRING_CLAIMS = [
  'iss',
  'aud',
  'env',
  'sub',
  'jti',
  'product',
  'plan',
  'device_key_id',
] as const;
const INT_CLAIMS = ['device_id', 'max_devices', 'iat', 'nbf', 'exp'] as const;

/** WebCrypto در تایپ‌های جدید فقط ArrayBuffer خالص می‌پذیرد (نه SharedArrayBuffer). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function invalid(): never {
  throw new LicenseError('توکن لایسنس معتبر نیست. برنامه را دوباره فعال‌سازی کنید.');
}

export async function verifyLicenseToken(
  token: string,
  options: VerifyTokenOptions,
): Promise<VerifiedToken> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new LicenseError('مرورگر شما از رمزنگاری امن پشتیبانی نمی‌کند.');

  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'HY2' || token.length > 8192) invalid();

  let header: LicenseTokenHeader;
  let claims: LicenseTokenClaims;
  let signature: Uint8Array;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
    claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[2])));
    signature = base64UrlToBytes(parts[3]);
  } catch {
    return invalid();
  }
  if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object') invalid();
  if (header.alg !== 'EdDSA' || header.typ !== 'hesabyar-license') invalid();
  if (typeof header.kid !== 'string' || header.kid !== options.kid) invalid();
  if (header.env !== options.environment || claims.env !== options.environment) invalid();
  if (signature.length !== 64) invalid();

  for (const field of STRING_CLAIMS) {
    const value = (claims as unknown as Record<string, unknown>)[field];
    if (typeof value !== 'string' || value === '') invalid();
  }
  for (const field of INT_CLAIMS) {
    const value = (claims as unknown as Record<string, unknown>)[field];
    if (!Number.isInteger(value)) invalid();
  }
  if (
    !Array.isArray(claims.features) ||
    !claims.features.every((feature) => typeof feature === 'string')
  ) {
    invalid();
  }
  if (claims.product !== options.product || claims.device_key_id !== options.deviceKeyId) invalid();

  let publicKey: CryptoKey;
  let valid = false;
  try {
    const raw = base64UrlToBytes(options.publicKeyB64);
    if (raw.length !== 32) invalid();
    publicKey = await subtle.importKey('raw', toArrayBuffer(raw), { name: 'Ed25519' }, false, [
      'verify',
    ]);
    valid = await subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      toArrayBuffer(signature),
      new TextEncoder().encode(`${parts[1]}.${parts[2]}`),
    );
  } catch (error) {
    if (error instanceof LicenseError) throw error;
    invalid();
  }
  if (!valid) throw new LicenseError('امضای توکن لایسنس معتبر نیست.');

  const now = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const skew = options.clockSkewSeconds ?? 60;
  if (claims.exp <= now)
    throw new LicenseError('توکن لایسنس منقضی شده است؛ برنامه را به اینترنت وصل کنید.');
  if (claims.nbf > now + skew || claims.iat > now + skew) invalid();

  return { header, claims };
}
