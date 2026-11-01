import { afterEach, describe, expect, it, vi } from 'vitest';
import { getServerLicenseConfig, parseServerLicenseConfig } from './config';

const env = {
  VITE_LICENSE_API_BASE: '/v1/',
  VITE_LICENSE_ENV: 'staging',
  VITE_LICENSE_ISSUER: 'karen-license-staging',
  VITE_LICENSE_AUDIENCE: 'hesabyar-app',
  VITE_LICENSE_ISSUER_KEY_ID: 'test-key-1',
  VITE_LICENSE_ISSUER_PUBLIC_KEY: Buffer.alloc(32, 255).toString('base64'),
};

afterEach(() => vi.unstubAllEnvs());

describe('explicit server license trust configuration', () => {
  it('keeps the offline/demo build unchanged when API is absent', () => {
    expect(parseServerLicenseConfig({})).toBeNull();
    expect(parseServerLicenseConfig({ ...env, VITE_LICENSE_API_BASE: ' ' })).toBeNull();
  });

  it('reads all trusted values and canonicalizes the public key', () => {
    expect(parseServerLicenseConfig(env)).toEqual({
      apiBase: '/v1',
      environment: 'staging',
      issuer: 'karen-license-staging',
      audience: 'hesabyar-app',
      issuerKeyId: 'test-key-1',
      issuerPublicKeyB64: env.VITE_LICENSE_ISSUER_PUBLIC_KEY,
    });
    const unpaddedUrlKey = env.VITE_LICENSE_ISSUER_PUBLIC_KEY.replaceAll('/', '_').replace(
      /=$/,
      '',
    );
    expect(
      parseServerLicenseConfig({ ...env, VITE_LICENSE_ISSUER_PUBLIC_KEY: unpaddedUrlKey })
        ?.issuerPublicKeyB64,
    ).toBe(env.VITE_LICENSE_ISSUER_PUBLIC_KEY);
  });

  it.each([
    'VITE_LICENSE_ENV',
    'VITE_LICENSE_ISSUER',
    'VITE_LICENSE_AUDIENCE',
    'VITE_LICENSE_ISSUER_KEY_ID',
    'VITE_LICENSE_ISSUER_PUBLIC_KEY',
  ])('fails closed when %s is absent', (field) => {
    expect(() => parseServerLicenseConfig({ ...env, [field]: '' })).toThrow(
      `license_config_invalid:${field}`,
    );
  });

  it.each(['development', 'stagin', 'STAGING'])('rejects unknown environment %s', (environment) => {
    expect(() => parseServerLicenseConfig({ ...env, VITE_LICENSE_ENV: environment })).toThrow(
      'VITE_LICENSE_ENV',
    );
  });

  it.each([
    'http://license.example/v1',
    'https:license.example/v1',
    'https:/license.example/v1',
    '//license.example/v1',
    'https://user:pass@license.example/v1',
    'https://license.example/v1?secret=x',
    'https://license.example/v1#fragment',
    '/v1?x=y',
    '/',
    'https://license.example\\other/v1',
  ])('rejects unsafe or ambiguous API base %s', (apiBase) => {
    expect(() => parseServerLicenseConfig({ ...env, VITE_LICENSE_API_BASE: apiBase })).toThrow(
      'VITE_LICENSE_API_BASE',
    );
  });

  it('supports an explicit production HTTPS service without staging defaults', () => {
    const config = parseServerLicenseConfig({
      ...env,
      VITE_LICENSE_API_BASE: 'https://license.example/v1/',
      VITE_LICENSE_ENV: 'production',
      VITE_LICENSE_ISSUER: 'karen-license-production',
      VITE_LICENSE_ISSUER_KEY_ID: 'production-key-1',
    });
    expect(config?.apiBase).toBe('https://license.example/v1');
    expect(config?.environment).toBe('production');
    expect(config?.issuer).toBe('karen-license-production');
  });

  it('runtime reader requires the same trusted fields as the build guard', () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    expect(getServerLicenseConfig()).toEqual(parseServerLicenseConfig(env));
    vi.stubEnv('VITE_LICENSE_ISSUER_PUBLIC_KEY', '');
    expect(() => getServerLicenseConfig()).toThrow('VITE_LICENSE_ISSUER_PUBLIC_KEY');
    vi.stubEnv('VITE_LICENSE_API_BASE', '');
    expect(getServerLicenseConfig()).toBeNull();
  });
});
