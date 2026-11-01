/// <reference types="vite/client" />
/**
 * پیکربندی لایسنس سروری — بدون API همان حالت آفلاین/دمو باقی می‌ماند.
 * در حالت سروری، محیط، issuer، audience، شناسه و کلید عمومی همگی اجباری‌اند.
 * هیچ کلید خصوصی اینجا نیست؛ مقادیر اعتماد فقط از build می‌آیند، نه API یا IndexedDB.
 */
import { normalizeIssuerPublicKey } from './public-key';

export interface ServerLicenseConfig {
  /** مثل '/v1' (هم‌مبدأ) یا 'https://license.example.com/v1' */
  apiBase: string;
  environment: 'staging' | 'production';
  issuer: string;
  audience: string;
  issuerKeyId: string;
  /** کلید عمومی Ed25519 پین‌شده، base64 استاندارد و کانونیکال (32 بایت). */
  issuerPublicKeyB64: string;
}

function configError(field: string): never {
  throw new Error(`license_config_invalid:${field}`);
}

/** Pure parser, shared by Vite's build guard and the browser config reader. */
export function parseServerLicenseConfig(env: Record<string, unknown>): ServerLicenseConfig | null {
  const read = (key: string) => (typeof env[key] === 'string' ? env[key].trim() : '');
  const rawBase = read('VITE_LICENSE_API_BASE');
  if (!rawBase) return null;
  const apiBase = rawBase.replace(/\/+$/, '');
  if (!/^\/(?!\/)[A-Za-z0-9_~./-]+$/.test(apiBase)) {
    let url: URL;
    try {
      url = new URL(apiBase);
    } catch {
      return configError('VITE_LICENSE_API_BASE');
    }
    if (
      !apiBase.startsWith('https://') ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      apiBase.includes('\\')
    ) {
      configError('VITE_LICENSE_API_BASE');
    }
  }

  const environment = read('VITE_LICENSE_ENV');
  if (environment !== 'staging' && environment !== 'production') {
    configError('VITE_LICENSE_ENV');
  }
  const required = (key: string) => {
    const value = read(key);
    if (!value || value.length > 255 || /\s/u.test(value)) configError(key);
    return value;
  };
  const issuer = required('VITE_LICENSE_ISSUER');
  const audience = required('VITE_LICENSE_AUDIENCE');
  const issuerKeyId = required('VITE_LICENSE_ISSUER_KEY_ID');
  let issuerPublicKeyB64: string;
  try {
    issuerPublicKeyB64 = normalizeIssuerPublicKey(read('VITE_LICENSE_ISSUER_PUBLIC_KEY'));
  } catch {
    return configError('VITE_LICENSE_ISSUER_PUBLIC_KEY');
  }

  return { apiBase, environment, issuer, audience, issuerKeyId, issuerPublicKeyB64 };
}

export function getServerLicenseConfig(): ServerLicenseConfig | null {
  return parseServerLicenseConfig({
    VITE_LICENSE_API_BASE: import.meta.env.VITE_LICENSE_API_BASE,
    VITE_LICENSE_ENV: import.meta.env.VITE_LICENSE_ENV,
    VITE_LICENSE_ISSUER: import.meta.env.VITE_LICENSE_ISSUER,
    VITE_LICENSE_AUDIENCE: import.meta.env.VITE_LICENSE_AUDIENCE,
    VITE_LICENSE_ISSUER_KEY_ID: import.meta.env.VITE_LICENSE_ISSUER_KEY_ID,
    VITE_LICENSE_ISSUER_PUBLIC_KEY: import.meta.env.VITE_LICENSE_ISSUER_PUBLIC_KEY,
  });
}
