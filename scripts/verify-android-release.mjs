import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const usage = 'Usage: npm run android:verify -- <release.apk> <Android SDK build-tools directory>';

/** Verify the actual APK, not its filename or the Gradle variant name. */
export function verifyAndroidRelease(apkPath, buildToolsDirectory, run = execFileSync) {
  if (!apkPath || !buildToolsDirectory) throw new Error(usage);

  const apk = resolve(apkPath);
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  // An unsigned, damaged or incorrectly signed APK makes apksigner exit nonzero.
  const certificates = run(
    resolve(buildToolsDirectory, 'apksigner'),
    ['verify', '--verbose', '--print-certs', apk],
    options,
  );
  const subjects = [...certificates.matchAll(/^Signer #\d+ certificate DN:\s*(.+)$/gm)].map(
    (match) => match[1].trim(),
  );
  if (subjects.length === 0) {
    throw new Error('No APK signing certificate was reported by apksigner.');
  }
  const debugSubject = /(?:^|[,;+])\s*CN\s*=\s*"?Android Debug"?\s*(?=[,;+]|$)/i;
  if (subjects.some((subject) => debugSubject.test(subject))) {
    throw new Error(
      'The APK is signed with an Android Debug certificate. Use your release keystore.',
    );
  }

  const manifest = run(resolve(buildToolsDirectory, 'aapt'), ['dump', 'badging', apk], options);
  if (/^application-debuggable(?:\s|$)/m.test(manifest)) {
    throw new Error('The APK is debuggable. Build the release variant with debuggable=false.');
  }
  return certificates.trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const certificates = verifyAndroidRelease(process.argv[2], process.argv[3]);
    console.log(certificates);
    console.log(
      'Release APK verified: valid signature, no Android Debug certificate, not debuggable.',
    );
  } catch (error) {
    console.error(`Release APK verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
