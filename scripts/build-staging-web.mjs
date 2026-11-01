#!/usr/bin/env node
/**
 * Build the staging web app for https://staging.karen-soft.ir/app/
 *
 * The staging build talks to the same-origin license API at /v1 and is deployed
 * under the /app/ subpath. The production/demo build is untouched: run the normal
 * `npm run build` for that.
 */
import { spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  VITE_BASE: '/app/',
  VITE_LICENSE_API_BASE: '/v1',
  VITE_LICENSE_ENV: 'staging',
};

const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
