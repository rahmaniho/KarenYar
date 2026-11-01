import { beforeAll, describe, expect, it } from 'vitest';
import { LicenseError } from '../license-core';
import { bytesToBase64Url, verifyLicenseToken, type VerifyTokenOptions } from './token';
import {
  installTestCrypto,
  makeTestIssuer,
  mintTestToken,
  TEST_AUDIENCE,
  TEST_DEVICE_KEY_ID,
  TEST_ISSUER,
  TEST_ISSUER_KEY_ID,
} from '@/tests/license-fixtures';

beforeAll(installTestCrypto);

function options(publicKeyB64: string): VerifyTokenOptions {
  return {
    publicKeyB64,
    kid: TEST_ISSUER_KEY_ID,
    environment: 'staging',
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    product: 'hesabyar',
    deviceKeyId: TEST_DEVICE_KEY_ID,
  };
}

describe('توکن لایسنس سروری HY2', () => {
  it('توکن امضاشده‌ی معتبر را می‌پذیرد', async () => {
    const issuer = await makeTestIssuer();
    const token = await mintTestToken(issuer);
    const verified = await verifyLicenseToken(token, options(issuer.publicKeyB64));
    expect(verified.claims.plan).toBe('pro');
    expect(verified.claims.device_key_id).toBe(TEST_DEVICE_KEY_ID);
  });

  it('تغییر پلن بدون امضای معتبر رد می‌شود', async () => {
    const issuer = await makeTestIssuer();
    const token = await mintTestToken(issuer);
    const parts = token.split('.');
    const claims = JSON.parse(new TextDecoder().decode(Buffer.from(parts[2], 'base64url')));
    claims.plan = 'proplus';
    parts[2] = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
    await expect(verifyLicenseToken(parts.join('.'), options(issuer.publicKeyB64))).rejects.toThrow(
      LicenseError,
    );
  });

  it('توکن منقضی رد می‌شود', async () => {
    const issuer = await makeTestIssuer();
    const now = Math.floor(Date.now() / 1000);
    const token = await mintTestToken(issuer, { iat: now - 100, nbf: now - 100, exp: now - 10 });
    await expect(verifyLicenseToken(token, options(issuer.publicKeyB64))).rejects.toThrow('منقضی');
  });

  it.each([
    ['issuer', { iss: 'another-license-service' }],
    ['audience', { aud: 'another-application' }],
    ['audience array', { aud: ['hesabyar-app'] }],
    ['product', { product: 'another-product' }],
    ['device', { device_key_id: '22222222-2222-4222-8222-222222222222' }],
    ['claims environment', { env: 'production' }],
  ])('رد توکن با %s اشتباه، حتی با امضای معتبر', async (_name, claims) => {
    const issuer = await makeTestIssuer();
    const token = await mintTestToken(issuer, claims);
    await expect(verifyLicenseToken(token, options(issuer.publicKeyB64))).rejects.toThrow(
      LicenseError,
    );
  });

  it.each([
    ['kid', { kid: 'untrusted-key-id' }],
    ['environment', { env: 'production' }],
    ['algorithm', { alg: 'HS256' }],
    ['type', { typ: 'another-token' }],
  ])('رد هدر %s ناسازگار، حتی با امضای معتبر', async (_name, header) => {
    const issuer = await makeTestIssuer();
    const token = await mintTestToken(issuer, {}, header);
    await expect(verifyLicenseToken(token, options(issuer.publicKeyB64))).rejects.toThrow(
      LicenseError,
    );
  });

  it('کلید عمومی اشتباه امضا را رد می‌کند', async () => {
    const issuer = await makeTestIssuer();
    const other = await makeTestIssuer();
    const token = await mintTestToken(issuer);
    await expect(verifyLicenseToken(token, options(other.publicKeyB64))).rejects.toThrow(
      'امضای توکن',
    );
  });

  it.each(['issuer', 'audience', 'kid', 'publicKeyB64'] as const)(
    'بدون مقدار مورد اعتماد %s، توکن پذیرفته نمی‌شود',
    async (field) => {
      const issuer = await makeTestIssuer();
      const token = await mintTestToken(issuer);
      await expect(
        verifyLicenseToken(token, { ...options(issuer.publicKeyB64), [field]: '' }),
      ).rejects.toThrow(LicenseError);
    },
  );
});
