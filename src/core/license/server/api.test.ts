import { webcrypto } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceIdentity } from './device-identity';
import type { ServerLicenseConfig } from './config';
import { activateWithServer, refreshWithServer, verifyServerLicenseSession } from './api';
import {
  installTestCrypto,
  makeTestIssuer,
  makeTestSession,
  TEST_DEVICE_KEY_ID,
  testServerConfig,
  type TestIssuer,
} from '@/tests/license-fixtures';

let issuer: TestIssuer;
let config: ServerLicenseConfig;
let device: DeviceIdentity;
let devicePair: CryptoKeyPair;
const fetchMock = vi.fn();

beforeAll(installTestCrypto);

beforeEach(async () => {
  issuer = await makeTestIssuer();
  config = testServerConfig(issuer);
  const deviceKeys = await makeTestIssuer();
  devicePair = deviceKeys.pair;
  device = {
    deviceKeyId: TEST_DEVICE_KEY_ID,
    privateKey: devicePair.privateKey,
    publicKeyB64: deviceKeys.publicKeyB64,
    createdAt: new Date().toISOString(),
  };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function reply(data: unknown, status = 200) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

async function issuedResponse(
  signer = issuer,
  overrides: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
) {
  const session = await makeTestSession(signer, overrides, headerOverrides);
  return {
    ok: true,
    token: session.token,
    kid: session.kid,
    issuer_public_key_b64: session.issuerPublicKeyB64,
    license: { license_expires_at: '2026-12-01 12:00:00' },
  };
}

function request(method: 'activation' | 'refresh') {
  return method === 'activation'
    ? activateWithServer(config, 'KS-STAGE-TEST', device, 'Test device')
    : refreshWithServer(config, device);
}

describe('pinned trust at the real HTTP client boundary', () => {
  it('accepts a valid response without cookies or HTTP caching', async () => {
    const data = await issuedResponse();
    reply(data);
    const session = await request('activation');
    expect(session.token).toBe(data.token);
    expect(session.issuerPublicKeyB64).toBe(config.issuerPublicKeyB64);
    expect(session.kid).toBe(config.issuerKeyId);
    expect(session.licenseExpiresAt).toBe('2026-12-01 12:00:00');
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/activations.php',
      expect.objectContaining({ method: 'POST', cache: 'no-store', credentials: 'omit' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.activation_code).toBe('KS-STAGE-TEST');
    expect(body.device_key_id).toBe(device.deviceKeyId);
    expect(body.product_code).toBe('hesabyar');
  });

  it('signs refresh with the device key, then verifies the pinned issuer response', async () => {
    reply(await issuedResponse());
    await request('refresh');
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/refresh.php');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.nonce).toMatch(/^[0-9a-f]{32}$/);
    const message = [
      'karen-license-refresh-v1',
      'hesabyar',
      device.deviceKeyId,
      String(body.timestamp),
      body.nonce,
    ].join('\n');
    expect(
      await webcrypto.subtle.verify(
        { name: 'Ed25519' },
        devicePair.publicKey,
        Buffer.from(body.signature_b64, 'base64url'),
        new TextEncoder().encode(message),
      ),
    ).toBe(true);
  });

  it('accepts equivalent base64url response keys and stores the canonical build key', async () => {
    const data = await issuedResponse();
    data.issuer_public_key_b64 = data.issuer_public_key_b64
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=$/, '');
    reply(data);
    expect((await request('activation')).issuerPublicKeyB64).toBe(config.issuerPublicKeyB64);
  });

  it.each(['activation', 'refresh'] as const)(
    '%s rejects an attacker token plus its own public key (no TOFU)',
    async (method) => {
      reply(await issuedResponse(await makeTestIssuer()));
      await expect(request(method)).rejects.toMatchObject({ code: 'issuer_key_mismatch' });
    },
  );

  it.each(['activation', 'refresh'] as const)(
    '%s rejects a valid token with the wrong issuer key id in the response',
    async (method) => {
      const data = await issuedResponse();
      data.kid = 'unknown-key-id';
      reply(data);
      await expect(request(method)).rejects.toMatchObject({ code: 'issuer_kid_mismatch' });
    },
  );

  it.each([
    ['issuer', { iss: 'another-service' }],
    ['audience', { aud: 'another-app' }],
    ['environment', { env: 'production' }],
    ['product', { product: 'another-product' }],
    ['device', { device_key_id: 'another-device' }],
  ])('rejects correctly signed tokens with the wrong %s', async (_name, claims) => {
    reply(await issuedResponse(issuer, claims));
    await expect(request('activation')).rejects.toThrow('توکن لایسنس معتبر نیست');
    await expect(request('refresh')).rejects.toThrow('توکن لایسنس معتبر نیست');
  });

  it('does not trust a response kid when the signed header has a different kid', async () => {
    reply(await issuedResponse(issuer, {}, { kid: 'untrusted-header-kid' }));
    await expect(request('activation')).rejects.toThrow('توکن لایسنس معتبر نیست');
  });

  it('does not trust an attacker signature merely because response metadata matches the pin', async () => {
    const data = await issuedResponse(await makeTestIssuer());
    data.issuer_public_key_b64 = config.issuerPublicKeyB64;
    reply(data);
    await expect(request('activation')).rejects.toThrow('امضای توکن');
  });

  it('missing pinned key fails closed even for a manually constructed config', async () => {
    config = { ...config, issuerPublicKeyB64: '' };
    reply(await issuedResponse());
    await expect(request('activation')).rejects.toMatchObject({ code: 'issuer_key_mismatch' });
  });

  it('applies the same trust check to an offline/persisted session', async () => {
    const session = await makeTestSession(await makeTestIssuer());
    await expect(
      verifyServerLicenseSession(config, session, TEST_DEVICE_KEY_ID),
    ).rejects.toMatchObject({ code: 'issuer_key_mismatch' });
  });

  it('preserves structured rate limit errors and reports network failures', async () => {
    reply({ ok: false, error: 'rate_limited' }, 429);
    await expect(request('activation')).rejects.toMatchObject({ code: 'rate_limited' });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('activation')).rejects.toMatchObject({ code: 'network_error' });
  });
});
