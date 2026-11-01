#!/usr/bin/env node
/**
 * Build the staging web app for https://staging.karen-soft.ir/app/.
 * Trust is baked into the bundle from reviewed PUBLIC metadata, never fetched
 * from the license API. The normal offline/demo build is unaffected.
 */
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const trust = JSON.parse(
  readFileSync(new URL('../deploy/cpanel-staging/license-trust.json', import.meta.url), 'utf8'),
);
if (trust.environment !== 'staging') {
  throw new Error('staging_license_trust_required');
}
for (const field of ['issuer', 'audience', 'issuerKeyId', 'issuerPublicKeyB64']) {
  if (typeof trust[field] !== 'string' || !trust[field].trim()) {
    throw new Error(`staging_license_trust_missing:${field}`);
  }
}

const env = {
  ...process.env,
  VITE_BASE: '/app/',
  VITE_LICENSE_API_BASE: '/v1',
  VITE_LICENSE_ENV: trust.environment,
  VITE_LICENSE_ISSUER: trust.issuer,
  VITE_LICENSE_AUDIENCE: trust.audience,
  VITE_LICENSE_ISSUER_KEY_ID: trust.issuerKeyId,
  VITE_LICENSE_ISSUER_PUBLIC_KEY: trust.issuerPublicKeyB64,
};

const result = spawnSync('npm', ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// Do not deploy the root/production routing files under /app/.
copyFileSync(
  new URL('../deploy/cpanel-staging/app.htaccess', import.meta.url),
  new URL('../dist/.htaccess', import.meta.url),
);
for (const name of ['CNAME', '_redirects']) {
  rmSync(new URL(`../dist/${name}`, import.meta.url), { force: true });
}
console.log(`Staging trust pinned to ${trust.issuerKeyId}; /app/ routing prepared.`);
