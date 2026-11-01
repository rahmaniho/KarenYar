import { webcrypto } from 'node:crypto';
import type { LicenseSession } from '@/core/license/server/api';
import type { ServerLicenseConfig } from '@/core/license/server/config';
import { bytesToBase64Url } from '@/core/license/server/token';

export const TEST_DEVICE_KEY_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_ISSUER_KEY_ID = 'staging-key-1';
export const TEST_ISSUER = 'karen-license-staging';
export const TEST_AUDIENCE = 'hesabyar-app';

export function installTestCrypto() {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
}

export async function makeTestIssuer() {
  const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
  return { pair, publicKeyB64: Buffer.from(raw).toString('base64') };
}

export type TestIssuer = Awaited<ReturnType<typeof makeTestIssuer>>;

export function testServerConfig(issuer: TestIssuer): ServerLicenseConfig {
  return {
    apiBase: '/v1',
    environment: 'staging',
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    issuerKeyId: TEST_ISSUER_KEY_ID,
    issuerPublicKeyB64: issuer.publicKeyB64,
  };
}

export async function mintTestToken(
  issuer: TestIssuer,
  overrides: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'EdDSA',
    typ: 'hesabyar-license',
    kid: TEST_ISSUER_KEY_ID,
    env: 'staging',
    ...headerOverrides,
  };
  const claims = {
    iss: TEST_ISSUER,
    aud: TEST_AUDIENCE,
    env: 'staging',
    sub: 'STAGING-CUSTOMER-001',
    jti: 'license-public-id',
    product: 'hesabyar',
    plan: 'pro',
    features: ['backup', 'pdf-export', 'unlimited-products', 'unlimited-transactions'],
    device_key_id: TEST_DEVICE_KEY_ID,
    device_id: 1,
    max_devices: 2,
    iat: now,
    nbf: now,
    exp: now + 7 * 86400,
    ...overrides,
  };
  const h = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const c = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await webcrypto.subtle.sign(
    { name: 'Ed25519' },
    issuer.pair.privateKey,
    new TextEncoder().encode(`${h}.${c}`),
  );
  return `HY2.${h}.${c}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function makeTestSession(
  issuer: TestIssuer,
  overrides: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
): Promise<LicenseSession> {
  return {
    token: await mintTestToken(issuer, overrides, headerOverrides),
    kid: TEST_ISSUER_KEY_ID,
    issuerPublicKeyB64: issuer.publicKeyB64,
    updatedAt: new Date().toISOString(),
  };
}
