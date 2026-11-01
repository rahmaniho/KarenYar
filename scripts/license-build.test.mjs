import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const trustedEnv = {
  VITE_LICENSE_API_BASE: '/v1',
  VITE_LICENSE_ENV: 'staging',
  VITE_LICENSE_ISSUER: 'test-license-issuer',
  VITE_LICENSE_AUDIENCE: 'test-app',
  VITE_LICENSE_ISSUER_KEY_ID: 'test-key-1',
  VITE_LICENSE_ISSUER_PUBLIC_KEY: Buffer.alloc(32, 255).toString('base64'),
};

for (const field of Object.keys(trustedEnv).filter((key) => key !== 'VITE_LICENSE_API_BASE')) {
  test(`Vite build fails closed without ${field}`, () => {
    const result = spawnSync(process.execPath, [vite, 'build', '--mode', 'license-guard-test'], {
      cwd: root,
      env: { ...process.env, ...trustedEnv, [field]: '' },
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, 'An unpinned server build must never succeed');
    assert.match(result.stdout + result.stderr, new RegExp(`license_config_invalid:${field}`));
  });
}
