import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const APPLICATION_ID = 'ir.karensoft.hesabyar';
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

function integerField(text, pattern, label) {
  const raw = text.match(pattern)?.[1];
  const value = Number(raw);
  if (!raw || !Number.isSafeInteger(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

/** Keeps the web package, lockfile, Android package and stable release tag in sync. */
export function validateReleaseVersion({ packageText, lockText, gradleText, variablesText, tag }) {
  const pkg = JSON.parse(packageText);
  const lock = JSON.parse(lockText);
  const match = VERSION.exec(pkg.version ?? '');
  if (!match) throw new Error('A stable release requires a version such as 1.4.0.');
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error('Minor and patch versions must be below 100.');
  const versionCode = major * 10000 + minor * 100 + patch;
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000)
    throw new Error('versionCode is outside the Android release range.');
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version)
    throw new Error('package.json and package-lock.json versions do not match.');

  const versionName = gradleText.match(/\bversionName\s+["']([^"']+)["']/)?.[1];
  if (versionName !== pkg.version)
    throw new Error('Android versionName does not match package.json.');
  const androidCode = integerField(gradleText, /\bversionCode\s+(\d+)/, 'Android versionCode');
  if (androidCode !== versionCode)
    throw new Error(`Android versionCode must be ${versionCode} for version ${pkg.version}.`);
  const applicationId = gradleText.match(/\bapplicationId\s+["']([^"']+)["']/)?.[1];
  if (applicationId !== APPLICATION_ID) throw new Error('Unexpected Android application ID.');

  const minSdk = integerField(variablesText, /\bminSdkVersion\s*=\s*(\d+)/, 'minimum SDK');
  const targetSdk = integerField(variablesText, /\btargetSdkVersion\s*=\s*(\d+)/, 'target SDK');
  if (minSdk !== 24 || targetSdk !== 36)
    throw new Error('This release requires minSdkVersion=24 and targetSdkVersion=36.');
  if (tag !== undefined && tag !== `v${pkg.version}`)
    throw new Error(`Release tag must be v${pkg.version}; received ${tag}.`);
  return { version: pkg.version, versionCode, applicationId, minSdk, targetSdk };
}

export function readReleaseVersion(tag, root = process.cwd()) {
  const read = (path) => readFileSync(join(resolve(root), path), 'utf8');
  return validateReleaseVersion({
    packageText: read('package.json'),
    lockText: read('package-lock.json'),
    gradleText: read('android/app/build.gradle'),
    variablesText: read('android/variables.gradle'),
    tag,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: node scripts/release-version.mjs [vX.Y.Z]');
    console.log(JSON.stringify(readReleaseVersion(process.argv[2]), null, 2));
  } catch (error) {
    console.error(`Release version validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
