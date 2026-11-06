/**
 * کلاینت HTTP سرویس لایسنس (staging/production).
 * پاسخ‌ها هرگز کش نمی‌شوند و کوکی ارسال نمی‌شود.
 */
import { LicenseError } from '../license-core';
import type { ServerLicenseConfig } from './config';
import type { DeviceIdentity } from './device-identity';
import { bytesToBase64Url, verifyLicenseToken } from './token';

export const LICENSE_PRODUCT_CODE = 'hesabyar';

export class ServerLicenseError extends LicenseError {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServerLicenseError';
  }
}

/** پاسخ‌هایی که یعنی دستگاه/لایسنس دیگر معتبر نیست (نه خطای موقت شبکه). */
export const PERMANENT_REJECTION_CODES: ReadonlySet<string> = new Set([
  'device_or_license_invalid',
  'license_or_device_not_found',
  'device_not_active',
  'license_not_active',
  'product_not_active',
  'customer_not_active',
  'license_expired',
  'device_mismatch',
]);

export interface LicenseSession {
  token: string;
  kid: string;
  issuerPublicKeyB64: string;
  updatedAt: string;
  /** انقضای خود لایسنس از پاسخ سرور؛ null یعنی مادام‌العمر، undefined یعنی نامشخص */
  licenseExpiresAt?: string | null;
}

interface IssuedTokenResponse {
  ok: true;
  token: string;
  kid: string;
  issuer_public_key_b64: string;
}

function isIssuedTokenResponse(data: unknown): data is IssuedTokenResponse {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Record<string, unknown>;
  return (
    candidate.ok === true &&
    typeof candidate.token === 'string' &&
    typeof candidate.kid === 'string' &&
    typeof candidate.issuer_public_key_b64 === 'string'
  );
}

async function postJson(
  config: ServerLicenseConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ServerLicenseError(
      'network_error',
      'ارتباط با سرور لایسنس برقرار نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.',
    );
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // پاسخ غیر JSON — مثل خطای موقت هاست
  }
  if (!response.ok || !data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    const code =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `http_${response.status}`;
    throw new ServerLicenseError(code, `سرور لایسنس پاسخ ناموفق داد (${code}).`);
  }
  return data;
}

async function toSession(
  config: ServerLicenseConfig,
  data: unknown,
  deviceKeyId: string,
): Promise<LicenseSession> {
  if (!isIssuedTokenResponse(data)) {
    throw new ServerLicenseError('invalid_response', 'پاسخ سرور لایسنس معتبر نیست.');
  }
  if (config.issuerPublicKeyB64 && data.issuer_public_key_b64 !== config.issuerPublicKeyB64) {
    throw new ServerLicenseError(
      'issuer_key_mismatch',
      'کلید عمومی سرور با کلید ثبت‌شده در برنامه یکی نیست.',
    );
  }
  // امضا و ادعاها همین‌جا آفلاین بررسی می‌شوند؛ پاسخ سرور بدون امضای معتبر پذیرفته نمی‌شود.
  await verifyLicenseToken(data.token, {
    publicKeyB64: data.issuer_public_key_b64,
    kid: data.kid,
    environment: config.environment,
    product: LICENSE_PRODUCT_CODE,
    deviceKeyId,
  });
  const license = (data as { license?: unknown }).license;
  let licenseExpiresAt: string | null | undefined;
  if (license && typeof license === 'object') {
    const value = (license as { license_expires_at?: unknown }).license_expires_at;
    if (typeof value === 'string' && value !== '') licenseExpiresAt = value;
    else if (value === null) licenseExpiresAt = null;
  }
  return {
    token: data.token,
    kid: data.kid,
    issuerPublicKeyB64: data.issuer_public_key_b64,
    updatedAt: new Date().toISOString(),
    licenseExpiresAt,
  };
}

export async function activateWithServer(
  config: ServerLicenseConfig,
  activationCode: string,
  device: DeviceIdentity,
  deviceLabel: string,
): Promise<LicenseSession> {
  const data = await postJson(config, '/activations.php', {
    activation_code: activationCode,
    device_key_id: device.deviceKeyId,
    device_public_key_b64: device.publicKeyB64,
    device_label: deviceLabel.slice(0, 190),
    product_code: LICENSE_PRODUCT_CODE,
  });
  return toSession(config, data, device.deviceKeyId);
}

export async function refreshWithServer(
  config: ServerLicenseConfig,
  device: DeviceIdentity,
): Promise<LicenseSession> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new ServerLicenseError('webcrypto_missing', 'رمزنگاری امن در دسترس نیست.');
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const message = [
    'karen-license-refresh-v1',
    LICENSE_PRODUCT_CODE,
    device.deviceKeyId,
    String(timestamp),
    nonce,
  ].join('\n');
  const signature = await subtle.sign(
    { name: 'Ed25519' },
    device.privateKey,
    new TextEncoder().encode(message),
  );
  const data = await postJson(config, '/refresh.php', {
    device_key_id: device.deviceKeyId,
    product_code: LICENSE_PRODUCT_CODE,
    timestamp,
    nonce,
    signature_b64: bytesToBase64Url(new Uint8Array(signature)),
  });
  return toSession(config, data, device.deviceKeyId);
}
