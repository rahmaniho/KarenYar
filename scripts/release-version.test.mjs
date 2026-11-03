import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateReleaseVersion } from './release-version.mjs';

const valid = {
  packageText: JSON.stringify({ version: '1.4.0' }),
  lockText: JSON.stringify({ version: '1.4.0', packages: { '': { version: '1.4.0' } } }),
  gradleText: 'applicationId "ir.karensoft.hesabyar"\nversionCode 10400\nversionName "1.4.0"',
  variablesText: 'minSdkVersion = 24\ntargetSdkVersion = 36',
};

test('accepts synchronized stable release metadata and its version tag', () => {
  assert.deepEqual(validateReleaseVersion({ ...valid, tag: 'v1.4.0' }), {
    version: '1.4.0',
    versionCode: 10400,
    applicationId: 'ir.karensoft.hesabyar',
    minSdk: 24,
    targetSdk: 36,
  });
});

test('rejects lockfile, Android name, code, application ID and tag drift', () => {
  const cases = [
    [{ lockText: valid.lockText.replaceAll('1.4.0', '1.3.0') }, /package-lock/],
    [{ gradleText: valid.gradleText.replace('versionName "1.4.0"', 'versionName "1.3.0"') }, /versionName/],
    [{ gradleText: valid.gradleText.replace('versionCode 10400', 'versionCode 10300') }, /versionCode/],
    [{ gradleText: valid.gradleText.replace('ir.karensoft.hesabyar', 'ir.karensoft.other') }, /application ID/],
    [{ tag: 'v1.3.0' }, /Release tag/],
    [{ variablesText: 'minSdkVersion = 23\ntargetSdkVersion = 36' }, /minSdkVersion/],
  ];
  for (const [patch, message] of cases)
    assert.throws(() => validateReleaseVersion({ ...valid, ...patch }), message);
});

test('rejects prerelease, malformed and overflowing Android version codes', () => {
  for (const version of ['1.4.0-rc.1', '1.4', '1.100.0', '300000.0.0']) {
    assert.throws(() => validateReleaseVersion({
      ...valid,
      packageText: JSON.stringify({ version }),
    }));
  }
});

test('rejects a missing Android version instead of treating it as zero', () => {
  assert.throws(() => validateReleaseVersion({
    ...valid,
    gradleText: valid.gradleText.replace('versionCode 10400\n', ''),
  }), /Invalid Android versionCode/);
});
