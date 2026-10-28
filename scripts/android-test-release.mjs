import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const targets = ['github-test', 'test-apk', 'signed-release'];
const commandOptions = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };

/** Version tags always require a real release key, regardless of manual inputs. */
export function resolveBuildTarget(env) {
  if (env.GITHUB_REF?.startsWith('refs/tags/v')) return 'signed-release';
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    if (env.ANDROID_LEGACY_RELEASE === 'true') return 'signed-release';
    if (![undefined, '', 'false'].includes(env.ANDROID_LEGACY_RELEASE))
      throw new Error('Invalid legacy release input.');
    if (targets.includes(env.ANDROID_BUILD_TYPE)) return env.ANDROID_BUILD_TYPE;
    // The GitHub Run workflow form can still show inputs from the default branch.
    if (env.ANDROID_LEGACY_RELEASE === 'false' && !env.ANDROID_BUILD_TYPE) return 'github-test';
  }
  throw new Error('Select github-test, test-apk, or signed-release using Run workflow.');
}

/** Verify the actual testing APK before making it publicly downloadable. */
export function verifyTestApk(apkPath, buildToolsDirectory, version, run = execFileSync) {
  if (!apkPath || !buildToolsDirectory)
    throw new Error('APK and SDK build-tools paths are required.');
  const apk = resolve(apkPath);
  const certificates = run(
    resolve(buildToolsDirectory, 'apksigner'),
    ['verify', '--verbose', '--print-certs', apk],
    commandOptions,
  );
  const subjects = [...certificates.matchAll(/^Signer #\d+ certificate DN:\s*(.+)$/gm)].map(
    (match) => match[1].trim(),
  );
  const debugSubject = /(?:^|[,;+])\s*CN\s*=\s*"?Android Debug"?\s*(?=[,;+]|$)/i;
  if (subjects.length === 0 || subjects.some((subject) => !debugSubject.test(subject)))
    throw new Error('A testing publication must use the standard Android Debug certificate.');

  const manifest = run(
    resolve(buildToolsDirectory, 'aapt'),
    ['dump', 'badging', apk],
    commandOptions,
  );
  const packageLine = manifest.match(/^package: (.+)$/m)?.[1] ?? '';
  if (!/(?:^|\s)name='ir\.karensoft\.hesabyar'(?:\s|$)/.test(packageLine))
    throw new Error('Unexpected Android application ID.');
  if (packageLine.match(/(?:^|\s)versionName='([^']+)'/)?.[1] !== version)
    throw new Error('APK versionName does not match package.json.');
  if (!/(?:^|\s)versionCode='[1-9][0-9]*'(?:\s|$)/.test(packageLine))
    throw new Error('APK versionCode is missing or invalid.');
  if (!/^application-debuggable(?:\s|$)/m.test(manifest))
    throw new Error('Expected an explicitly debuggable testing APK.');
  const minSdk = Number(manifest.match(/^sdkVersion:'([0-9]+)'/m)?.[1]);
  if (minSdk !== 24) throw new Error('Expected Android 7 / API 24 as the minimum SDK.');
  return { certificates: certificates.trim(), minSdk };
}

export function testReleasePlan(env, version) {
  if (resolveBuildTarget(env) !== 'github-test')
    throw new Error('Only the explicit github-test target may publish a testing release.');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error('Invalid package version.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? ''))
    throw new Error('Invalid GitHub repository.');
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? ''))
    throw new Error('A full source commit is required.');
  for (const name of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) {
    if (!/^[1-9][0-9]*$/.test(env[name] ?? '')) throw new Error(`Invalid ${name}.`);
  }
  // A fresh tag for every attempt avoids replacing an APK with a different debug signature.
  const tag = `android-test-v${version}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const fileName = `hesabyar-${version}-test.apk`;
  return {
    tag,
    fileName,
    title: `حساب‌یار اندروید ${version} — آزمایشی / NOT FOR STORES`,
    repository: env.GITHUB_REPOSITORY,
    sha: env.GITHUB_SHA,
    url: `https://github.com/${env.GITHUB_REPOSITORY}/releases/tag/${tag}`,
    downloadUrl: `https://github.com/${env.GITHUB_REPOSITORY}/releases/download/${tag}/${fileName}`,
  };
}

export function releaseCommands(plan, apk, checksum, notes) {
  return [
    [
      'release',
      'create',
      plan.tag,
      apk,
      checksum,
      '--repo',
      plan.repository,
      '--target',
      plan.sha,
      '--title',
      plan.title,
      '--notes-file',
      notes,
      '--draft',
      '--prerelease',
      '--latest=false',
    ],
    // Only publish after both files were successfully uploaded to the draft.
    [
      'release',
      'edit',
      plan.tag,
      '--repo',
      plan.repository,
      '--draft=false',
      '--prerelease',
      '--latest=false',
    ],
  ];
}

export function publishTestRelease(env, apkPath, buildToolsDirectory, run = execFileSync) {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const plan = testReleasePlan(env, version);
  const verification = verifyTestApk(apkPath, buildToolsDirectory, version, run);
  if (!env.RUNNER_TEMP) throw new Error('RUNNER_TEMP is required.');
  const directory = join(env.RUNNER_TEMP, plan.tag);
  mkdirSync(directory, { recursive: true });
  const apk = join(directory, plan.fileName);
  copyFileSync(apkPath, apk);
  const hash = createHash('sha256').update(readFileSync(apk)).digest('hex');
  const checksum = `${apk}.sha256`;
  writeFileSync(checksum, `${hash}  ${basename(apk)}\n`);
  const notes = join(directory, 'release-notes.md');
  writeFileSync(
    notes,
    [
      '# حساب‌یار اندروید — نسخهٔ آزمایشی',
      '',
      '**TEST / DEBUG — فقط برای نصب و تست روی گوشی؛ برای بازار و سایر فروشگاه‌ها مناسب نیست.**',
      '',
      `- نسخهٔ ${version} شامل صندوق فروش، کسر موجودی، ثبت خودکار درآمد و دفتر مالی کسب‌وکار است.`,
      '- حداقل اندروید: ۷ (API 24). قابلیت‌های اصلی آفلاین کار می‌کنند.',
      '- فایل APK را دانلود و برای نصب از مرورگر/Files، مجوز نصب از این منبع را فعال کنید.',
      '- امضای معتبر APK با apksigner و نوع Debug، شناسهٔ برنامه و نسخه با aapt بررسی شده‌اند.',
      '- روی دستگاه واقعی یا شبیه‌ساز تست نشده است؛ موفقیت ساخت جای تست دستگاه را نمی‌گیرد.',
      '',
      '**قبل از حذف نسخهٔ قبلی، از داخل برنامه پشتیبان JSON بگیرید.** امضای Debug هر اجرا ممکن است متفاوت باشد؛ این فایل ممکن است روی نصب قبلی به‌صورت به‌روزرسانی نصب نشود. حذف برنامه داده‌های محلی آن را پاک می‌کند. برای این نسخه کلید خصوصی Release ساخته نشده است.',
      '',
      `Source: https://github.com/${plan.repository}/commit/${plan.sha}`,
      `Build: https://github.com/${plan.repository}/actions/runs/${env.GITHUB_RUN_ID}`,
      '',
      `SHA-256 (${plan.fileName}): \`${hash}\``,
      '',
    ].join('\n'),
  );
  for (const args of releaseCommands(plan, apk, checksum, notes)) run('gh', args, commandOptions);
  console.log(verification.certificates);
  console.log(`Testing APK published: ${plan.url}`);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `## Android testing APK\n\n[Download APK](${plan.downloadUrl}) · [Pre-release](${plan.url})\n\n**Debug / NOT FOR STORES.** Back up local app data before uninstalling a previous version.\n`,
    );
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'target') {
      const target = resolveBuildTarget(process.env);
      if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
      appendFileSync(process.env.GITHUB_OUTPUT, `build_type=${target}\n`);
      console.log(`Android build target: ${target}`);
    } else if (process.argv[2] === 'publish') {
      publishTestRelease(process.env, process.argv[3], process.argv[4]);
    } else {
      throw new Error(
        'Usage: node scripts/android-test-release.mjs target | publish <test.apk> <build-tools-directory>',
      );
    }
  } catch (error) {
    console.error(`Android testing publication failed: ${error.message}`);
    process.exitCode = 1;
  }
}
