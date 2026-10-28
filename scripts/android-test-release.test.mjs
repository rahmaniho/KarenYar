import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  publishTestRelease,
  releaseCommands,
  resolveBuildTarget,
  testReleasePlan,
  verifyTestApk,
} from './android-test-release.mjs';

const env = {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/arena/da58321a-karenyar',
  ANDROID_BUILD_TYPE: 'github-test',
  GITHUB_REPOSITORY: 'rahmaniho/KarenYar',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_RUN_ID: '12345',
  GITHUB_RUN_ATTEMPT: '1',
};
const sdk = resolve('test-sdk/build-tools/36.0.0');
const certificates = 'Verifies\nSigner #1 certificate DN: CN=Android Debug, O=Android, C=US\n';
const manifest = [
  "package: name='ir.karensoft.hesabyar' versionCode='10300' versionName='1.3.0' platformBuildVersionName='16'",
  "sdkVersion:'24'",
  "targetSdkVersion:'36'",
  'application-debuggable',
].join('\n');

function tools({ cert = certificates, badging = manifest, signingError, manifestError } = {}) {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === resolve(sdk, 'apksigner')) {
      if (signingError) throw signingError;
      return cert;
    }
    if (command === resolve(sdk, 'aapt')) {
      if (manifestError) throw manifestError;
      return badging;
    }
    assert.equal(command, 'gh');
    return '';
  };
  return { run, calls };
}

test('manual targets explicitly select public testing, private testing, or signed release', () => {
  for (const target of ['github-test', 'test-apk', 'signed-release'])
    assert.equal(resolveBuildTarget({ ...env, ANDROID_BUILD_TYPE: target }), target);
});

test('version tags always select signed release, including a manual tag run', () => {
  for (const event of ['push', 'workflow_dispatch'])
    assert.equal(
      resolveBuildTarget({ ...env, GITHUB_EVENT_NAME: event, GITHUB_REF: 'refs/tags/v1.3.0' }),
      'signed-release',
    );
});

test('automatic publication requires both the allowed branch and an explicit testing commit', () => {
  const automatic = { ...env, GITHUB_EVENT_NAME: 'push', ANDROID_TEST_PUSH: 'true' };
  assert.equal(resolveBuildTarget(automatic), 'github-test');
  assert.throws(
    () => resolveBuildTarget({ ...automatic, GITHUB_REF: 'refs/heads/main' }),
    /Select/,
  );
  assert.throws(() => resolveBuildTarget({ ...automatic, ANDROID_TEST_PUSH: 'false' }), /Select/);
  assert.equal(
    resolveBuildTarget({ ...automatic, GITHUB_REF: 'refs/tags/v1.3.0' }),
    'signed-release',
  );
});

test('legacy UI and API inputs remain safe and compatible', () => {
  assert.equal(resolveBuildTarget({ ...env, ANDROID_LEGACY_RELEASE: 'true' }), 'signed-release');
  assert.equal(
    resolveBuildTarget({ ...env, ANDROID_BUILD_TYPE: undefined, ANDROID_LEGACY_RELEASE: 'false' }),
    'github-test',
  );
  assert.equal(resolveBuildTarget({ ...env, ANDROID_LEGACY_RELEASE: 'false' }), 'github-test');
  assert.throws(
    () => resolveBuildTarget({ ...env, ANDROID_LEGACY_RELEASE: 'yes' }),
    /legacy release/,
  );
});

test('unknown targets, missing inputs and non-manual branch events are rejected', () => {
  for (const patch of [
    { ANDROID_BUILD_TYPE: undefined },
    { ANDROID_BUILD_TYPE: 'release' },
    { ANDROID_BUILD_TYPE: 'github-test\nbuild_type=signed-release' },
    { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_EVENT_NAME: 'pull_request' },
  ])
    assert.throws(() => resolveBuildTarget({ ...env, ...patch }), /Select/);
});

test('testing publication cannot be used for a version tag, private artifact or signed build', () => {
  for (const patch of [
    { GITHUB_REF: 'refs/tags/v1.3.0' },
    { ANDROID_BUILD_TYPE: 'test-apk' },
    { ANDROID_BUILD_TYPE: 'signed-release' },
  ])
    assert.throws(
      () => testReleasePlan({ ...env, ...patch }, '1.3.0'),
      /Only the explicit github-test/,
    );
});

test('testing tags are separate from stable version tags and unique for reruns', () => {
  const plan = testReleasePlan(env, '1.3.0');
  assert.equal(plan.tag, 'android-test-v1.3.0-12345-1');
  assert.equal(plan.fileName, 'hesabyar-1.3.0-test.apk');
  assert.match(plan.title, /NOT FOR STORES/);
  assert.equal(
    plan.downloadUrl,
    `https://github.com/rahmaniho/KarenYar/releases/download/${plan.tag}/${plan.fileName}`,
  );
  assert.notEqual(testReleasePlan({ ...env, GITHUB_RUN_ATTEMPT: '2' }, '1.3.0').tag, plan.tag);
});

test('repository, commit, run numbers and version cannot inject commands or output', () => {
  for (const patch of [
    { GITHUB_REPOSITORY: '--repo evil/repo' },
    { GITHUB_SHA: 'main' },
    { GITHUB_RUN_ID: '0' },
    { GITHUB_RUN_ATTEMPT: '1\nother=value' },
  ])
    assert.throws(
      () => testReleasePlan({ ...env, ...patch }, '1.3.0'),
      /Invalid|full source commit/,
    );
  assert.throws(() => testReleasePlan(env, '1.3.0\nnew-tag'), /Invalid package version/);
});

test('verifies the actual APK signature and manifest with the exact selected build tools', () => {
  const { run, calls } = tools();
  assert.deepEqual(verifyTestApk('app-debug.apk', sdk, '1.3.0', run), {
    certificates: certificates.trim(),
    minSdk: 24,
  });
  assert.deepEqual(calls[0].args, [
    'verify',
    '--verbose',
    '--print-certs',
    resolve('app-debug.apk'),
  ]);
  assert.deepEqual(calls[1].args, ['dump', 'badging', resolve('app-debug.apk')]);
});

test('an unsigned or damaged APK stops before manifest inspection', () => {
  const error = new Error('DOES NOT VERIFY');
  const { run, calls } = tools({ signingError: error });
  assert.throws(
    () => verifyTestApk('test.apk', sdk, '1.3.0', run),
    (caught) => caught === error,
  );
  assert.equal(calls.length, 1);
});

test('release certificates, mixed signers and missing certificates cannot be published as testing', () => {
  for (const cert of [
    '',
    'Signer #1 certificate DN: CN=Karen Soft Release\n',
    certificates + 'Signer #2 certificate DN: CN=Private Release\n',
  ]) {
    const { run } = tools({ cert });
    assert.throws(() => verifyTestApk('test.apk', sdk, '1.3.0', run), /standard Android Debug/);
  }
});

test('debug certificate matching supports reordered subjects and CRLF', () => {
  const { run } = tools({
    cert: 'Signer #1 certificate DN: C=US, O=Android, CN="android debug"\r\n',
  });
  assert.doesNotThrow(() => verifyTestApk('test.apk', sdk, '1.3.0', run));
});

test('wrong package/version/SDK and a non-debuggable manifest are rejected', () => {
  for (const badging of [
    manifest.replace('ir.karensoft.hesabyar', 'example.other'),
    manifest.replace("versionName='1.3.0'", "versionName='1.2.5'"),
    manifest.replace("versionCode='10300'", "versionCode='0'"),
    manifest.replace("sdkVersion:'24'", "sdkVersion:'26'"),
    manifest.replace('application-debuggable', ''),
  ]) {
    const { run } = tools({ badging });
    assert.throws(() => verifyTestApk('test.apk', sdk, '1.3.0', run));
  }
});

test('manifest tool failures and missing paths do not produce unchecked releases', () => {
  const error = new Error('aapt failed');
  const { run } = tools({ manifestError: error });
  assert.throws(
    () => verifyTestApk('test.apk', sdk, '1.3.0', run),
    (caught) => caught === error,
  );
  assert.throws(() => verifyTestApk(undefined, sdk, '1.3.0'), /paths are required/);
});

test('release creation uploads both assets into a draft before publishing a non-latest prerelease', () => {
  const plan = testReleasePlan(env, '1.3.0');
  const commands = releaseCommands(plan, 'testing.apk', 'testing.apk.sha256', 'notes.md');
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0].slice(0, 5), [
    'release',
    'create',
    plan.tag,
    'testing.apk',
    'testing.apk.sha256',
  ]);
  assert.equal(commands[0][commands[0].indexOf('--target') + 1], env.GITHUB_SHA);
  assert.ok(commands[0].includes('--draft'));
  for (const args of commands) {
    assert.ok(args.includes('--prerelease'));
    assert.ok(args.includes('--latest=false'));
    assert.ok(!args.includes('--clobber'));
  }
  assert.ok(commands[1].includes('--draft=false'));
});

test('publisher writes a checksum, warnings, provenance and download link for the tested APK', () => {
  const directory = mkdtempSync(join(tmpdir(), 'android-testing-'));
  try {
    const apk = join(directory, 'app-debug.apk');
    writeFileSync(apk, 'fake APK bytes; Android tools are mocked by this unit test');
    const summary = join(directory, 'summary.md');
    const { run, calls } = tools();
    const plan = publishTestRelease(
      { ...env, RUNNER_TEMP: directory, GITHUB_STEP_SUMMARY: summary },
      apk,
      sdk,
      run,
    );
    const output = join(directory, plan.tag, plan.fileName);
    assert.equal(readFileSync(output, 'utf8'), readFileSync(apk, 'utf8'));
    assert.match(
      readFileSync(`${output}.sha256`, 'utf8'),
      /^[a-f0-9]{64}  hesabyar-1\.3\.0-test\.apk\n$/,
    );
    const notes = readFileSync(join(directory, plan.tag, 'release-notes.md'), 'utf8');
    assert.match(notes, /TEST \/ DEBUG/);
    assert.match(notes, /بازار/);
    assert.match(notes, /پشتیبان JSON/);
    assert.ok(notes.includes(env.GITHUB_SHA));
    assert.ok(readFileSync(summary, 'utf8').includes(plan.downloadUrl));
    assert.equal(calls.filter((call) => call.command === 'gh').length, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('failed upload leaves the release unpublished instead of exposing an empty release', () => {
  const directory = mkdtempSync(join(tmpdir(), 'android-testing-'));
  try {
    const apk = join(directory, 'app-debug.apk');
    writeFileSync(apk, 'fake APK bytes');
    const { run } = tools();
    const githubCalls = [];
    const failingRun = (command, args, options) => {
      if (command === 'gh') {
        githubCalls.push(args);
        throw new Error('upload failed');
      }
      return run(command, args, options);
    };
    assert.throws(
      () => publishTestRelease({ ...env, RUNNER_TEMP: directory }, apk, sdk, failingRun),
      /upload failed/,
    );
    assert.equal(githubCalls.length, 1);
    assert.equal(githubCalls[0][1], 'create');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
