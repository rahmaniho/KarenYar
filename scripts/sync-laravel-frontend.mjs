#!/usr/bin/env node
/**
 * همگام‌سازی فرانت‌اند لاراول با اپ اصلی
 * -------------------------------------
 * نسخه‌ی وبِ متصل به بک‌اند لاراول، یک کپی از `src/` است که چند فایلش برای
 * «حالت سروری» تفاوت دارند (اتصال به API، لایه‌ی داده‌ی سروری، ورود/مدیر).
 * این اسکریپت آن کپی را به‌صورت کامل و قابل‌تکرار بازمی‌سازد:
 *
 *     laravel-backend/resources/js  =  src/  +  laravel-backend/frontend-overlay/
 *
 * یعنی: همه‌ی فایل‌های `src/` کپی می‌شوند و بعد فایل‌های overlay روی آن‌ها
 * نوشته می‌شوند. برای همین **هر تغییری در کپی لاراول باید در overlay انجام
 * شود**، نه در `laravel-backend/resources/js` (که خروجیِ تولیدشده است).
 *
 * استفاده:
 *     node scripts/sync-laravel-frontend.mjs          # بازسازی کپی
 *     node scripts/sync-laravel-frontend.mjs --check  # فقط بررسی هم‌خوانی (CI)
 */
import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC_DIR = path.join(root, 'src');
const OVERLAY_DIR = path.join(root, 'laravel-backend', 'frontend-overlay');
const TARGET_DIR = path.join(root, 'laravel-backend', 'resources', 'js');

const check = process.argv.includes('--check');

/** همه‌ی فایل‌های یک درخت، به‌صورت مسیر نسبی و مرتب. */
async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(full, base)));
    } else {
      out.push(path.relative(base, full));
    }
  }
  return out.sort();
}

/** ساخت کپی کامل داخل مسیر مقصد. */
async function generate(dest) {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cp(SRC_DIR, dest, { recursive: true });
  await cp(OVERLAY_DIR, dest, { recursive: true });
}

/** فهرست تفاوت‌های دو درخت (فایل‌های اضافه/کم/متفاوت). */
async function compare(a, b) {
  const [aFiles, bFiles] = await Promise.all([listFiles(a), listFiles(b)]);
  const aSet = new Set(aFiles);
  const bSet = new Set(bFiles);
  const problems = [];
  for (const f of aFiles) {
    if (!bSet.has(f)) problems.push(`فقط در کپی لاراول: ${f}`);
  }
  for (const f of bFiles) {
    if (!aSet.has(f)) problems.push(`در کپی لاراول نیست: ${f}`);
  }
  for (const f of aFiles) {
    if (!bSet.has(f)) continue;
    const [x, y] = await Promise.all([
      readFile(path.join(a, f)),
      readFile(path.join(b, f)),
    ]);
    if (!x.equals(y)) problems.push(`متفاوت: ${f}`);
  }
  return problems;
}

if (!existsSync(SRC_DIR)) {
  console.error(`پوشه‌ی src پیدا نشد: ${SRC_DIR}`);
  process.exit(1);
}
if (!existsSync(OVERLAY_DIR)) {
  console.error(`پوشه‌ی overlay پیدا نشد: ${OVERLAY_DIR}`);
  process.exit(1);
}

if (check) {
  const tmp = path.join(os.tmpdir(), `karo-laravel-frontend-${process.pid}`);
  try {
    await generate(tmp);
    const problems = existsSync(TARGET_DIR)
      ? await compare(TARGET_DIR, tmp)
      : [`پوشه‌ی مقصد وجود ندارد: ${path.relative(root, TARGET_DIR)}`];
    if (problems.length) {
      console.error('کپی فرانت‌اند لاراول با src/ و overlay هم‌خوان نیست:');
      for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
      if (problems.length > 40) console.error(`  … و ${problems.length - 40} مورد دیگر`);
      console.error('\nرفع: node scripts/sync-laravel-frontend.mjs');
      process.exit(1);
    }
    console.log('کپی فرانت‌اند لاراول هم‌خوان است (src + overlay).');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
} else {
  await generate(TARGET_DIR);
  const files = await listFiles(TARGET_DIR);
  const overlay = await listFiles(OVERLAY_DIR);
  console.log(
    `کپی فرانت‌اند لاراول بازسازی شد: ${files.length} فایل (${overlay.length} فایل از overlay).`,
  );
}
