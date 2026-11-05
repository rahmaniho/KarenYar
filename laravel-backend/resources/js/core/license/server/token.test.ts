import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { LicenseError } from '../license-core';
import { bytesToBase64Url, verifyLicenseToken } from './token';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

const DEVICE_KEY_ID = '11111111-1111-4111-8111-111111111111';

async function makeIssuer() {
  const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
  return { pair, publicKeyB64: bytesToBase64Url(raw) };
}

async function mintToken(
  issuer: Awaited<ReturnType<typeof makeIssuer>>,
  overrides: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'EdDSA',
    typ: 'hesabyar-license',
    kid: 'staging-key-1',
    env: 'staging',
    ...headerOverrides,
  };
  const claims = {
    iss: 'karen-license-staging',
    aud: 'hesabyar-app',
    env: 'staging',
    sub: 'STAGING-CUSTOMER-001',
    jti: 'license-public-id',
    product: 'hesabyar',
    plan: 'pro',
    features: ['backup', 'pdf-export', 'unlimited-products', 'unlimited-transactions'],
    device_key_id: DEVICE_KEY_ID,
    device_id: 1,
    max_devices: 2,
    iat: now,
    nbf: now,
    exp: now + 7 * 86400,
    ...overrides,
  };
  const headerB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await webcrypto.subtle.sign(
    { name: 'Ed25519' },
    issuer.pair.privateKey,
    new TextEncoder().encode(`${headerB64}.${claimsB64}`),
  );
  return `HY2.${headerB64}.${claimsB64}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

function options(publicKeyB64: string) {
  return {
    publicKeyB64,
    kid: 'staging-key-1',
    environment: 'staging',
    product: 'hesabyar',
    deviceKeyId: DEVICE_KEY_ID,
  };
}

describe('توکن لایسنس سروری HY2', () => {
  it('توکن امضاشده‌ی معتبر را می‌پذیرد', async () => {
    const issuer = await makeIssuer();
    const token = await mintToken(issuer);
    const verified = await verifyLicenseToken(token, options(issuer.publicKeyB64));
    expect(verified.claims.plan).toBe('pro');
    expect(verified.claims.device_key_id).toBe(DEVICE_KEY_ID);
  });

  it('تغییر پلن بدون امضای معتبر رد می‌شود', async () => {
    const issuer = await makeIssuer();
    const token = await mintToken(issuer);
    const parts = token.split('.');
    const claims = JSON.parse(new TextDecoder().decode(Buffer.from(parts[2], 'base64url')));
    claims.plan = 'proplus';
    parts[2] = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
    await expect(verifyLicenseToken(parts.join('.'), options(issuer.publicKeyB64))).rejects.toThrow(
      LicenseError,
    );
  });

  it('توکن منقضی رد می‌شود', async () => {
    const issuer = await makeIssuer();
    const now = Math.floor(Date.now() / 1000);
    const token = await mintToken(issuer, { iat: now - 100, nbf: now - 100, exp: now - 10 });
    await expect(verifyLicenseToken(token, options(issuer.publicKeyB64))).rejects.toThrow('منقضی');
  });

  it('توکن دستگاه دیگر رد می‌شود', async () => {
    const issuer = await makeIssuer();
    const token = await mintToken(issuer, {
      device_key_id: '22222222-2222-4222-8222-222222222222',
    });
    await expect(verifyLicenseToken(token, options(issuer.publicKeyB64))).rejects.toThrow(
      LicenseError,
    );
  });

  it('توکن محیط production در کلاینت staging رد می‌شود', async () => {
    const issuer = await makeIssuer();
    const token = await mintToken(issuer, { env: 'production' }, { env: 'production' });
    await expect(verifyLicenseToken(token, options(issuer.publicKeyB64))).rejects.toThrow(
      LicenseError,
    );
  });

  it('کلید عمومی اشتباه امضا را رد می‌کند', async () => {
    const issuer = await makeIssuer();
    const other = await makeIssuer();
    const token = await mintToken(issuer);
    await expect(verifyLicenseToken(token, options(other.publicKeyB64))).rejects.toThrow(
      'امضای توکن',
    );
  });
});
