import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyAndroidRelease } from './verify-android-release.mjs';

const buildTools = resolve('test-sdk/build-tools/36.0.0');
const releaseCertificate = [
  'Verifies',
  'Verified using v2 scheme (APK Signature Scheme v2): true',
  'Signer #1 certificate DN: CN=Karen Soft Release, O=Karen Soft, C=IR',
  'Signer #1 certificate SHA-256 digest: 0123456789abcdef',
].join('\n');
const releaseManifest = "package: name='ir.karensoft.hesabyar' versionCode='10205'\n";

function tools({
  certificates = releaseCertificate,
  manifest = releaseManifest,
  signerError,
} = {}) {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === resolve(buildTools, 'apksigner')) {
      if (signerError) throw signerError;
      return certificates;
    }
    assert.equal(command, resolve(buildTools, 'aapt'));
    return manifest;
  };
  return { run, calls };
}

test('accepts a signed, non-debuggable release and verifies the exact APK with both tools', () => {
  const { run, calls } = tools();
  assert.equal(verifyAndroidRelease('app-release.apk', buildTools, run), releaseCertificate);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, [
    'verify',
    '--verbose',
    '--print-certs',
    resolve('app-release.apk'),
  ]);
  assert.deepEqual(calls[1].args, ['dump', 'badging', resolve('app-release.apk')]);
  assert.equal(calls[0].options.encoding, 'utf8');
});

test('checks the certificate rather than trusting a release filename', () => {
  const { run, calls } = tools({
    certificates: 'Signer #1 certificate DN: CN=Android Debug, O=Android, C=US\n',
  });
  assert.throws(() => verifyAndroidRelease('app-release.apk', buildTools, run), /Android Debug/);
  assert.equal(calls.length, 1);
});

test('rejects a debug certificate regardless of case, subject order or CRLF output', () => {
  const { run } = tools({
    certificates: 'Signer #1 certificate DN: C=US, O=Android, CN="android debug"\r\n',
  });
  assert.throws(() => verifyAndroidRelease('app-release.apk', buildTools, run), /Android Debug/);
});

test('rejects an APK when any signer uses the debug certificate', () => {
  const { run } = tools({
    certificates: releaseCertificate + '\nSigner #2 certificate DN: CN=Android Debug, O=Android\n',
  });
  assert.throws(() => verifyAndroidRelease('app-release.apk', buildTools, run), /Android Debug/);
});

test('does not mistake a different certificate name for the standard debug certificate', () => {
  const { run } = tools({
    certificates: 'Signer #1 certificate DN: CN=Android Debugging Tools Release, O=Karen Soft\n',
  });
  assert.doesNotThrow(() => verifyAndroidRelease('app-release.apk', buildTools, run));
});

test('rejects a debuggable manifest even when the APK has a release certificate', () => {
  const { run } = tools({ manifest: releaseManifest + 'application-debuggable\n' });
  assert.throws(() => verifyAndroidRelease('app-release.apk', buildTools, run), /debuggable=false/);
});

test('stops before reading the manifest if signature verification fails', () => {
  const error = new Error('DOES NOT VERIFY: APK is unsigned or its signature is invalid');
  const { run, calls } = tools({ signerError: error });
  assert.throws(
    () => verifyAndroidRelease('app-release.apk', buildTools, run),
    (caught) => caught === error,
  );
  assert.equal(calls.length, 1);
});

test('rejects tool output without a signer certificate', () => {
  const { run, calls } = tools({ certificates: 'Unexpected output\n' });
  assert.throws(
    () => verifyAndroidRelease('app-release.apk', buildTools, run),
    /No APK signing certificate/,
  );
  assert.equal(calls.length, 1);
});

test('propagates a manifest tool failure instead of accepting an unchecked APK', () => {
  const error = new Error('aapt could not read the manifest');
  const run = (command) => {
    if (command === resolve(buildTools, 'apksigner')) return releaseCertificate;
    throw error;
  };
  assert.throws(
    () => verifyAndroidRelease('app-release.apk', buildTools, run),
    (caught) => caught === error,
  );
});

test('requires an APK and a build-tools directory', () => {
  assert.throws(() => verifyAndroidRelease(), /Usage:/);
  assert.throws(() => verifyAndroidRelease('app-release.apk'), /Usage:/);
});

test('CLI exits nonzero and explains usage when arguments are missing', () => {
  const script = fileURLToPath(new URL('./verify-android-release.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Release APK verification failed: Usage:/);
});
