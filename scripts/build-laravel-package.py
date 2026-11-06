#!/usr/bin/env python3
"""
بسته‌بندی نسخهٔ Laravel برای استقرار روی cPanel (karo.karen-soft.ir)

خروجی: deploy/laravel-app/artifacts/karo-laravel.zip

چه چیزی داخل بسته است:
  app/ bootstrap/ config/ database/ public/ resources/views/ routes/ storage/
  artisan، composer.json، composer.lock، .env.example، .htaccess،
  public/build (دارایی‌های ساخته‌شدهٔ Vite) و راهنمای نصب.

چه چیزی بیرون می‌ماند:
  vendor/ و node_modules/ (روی سرور نصب می‌شوند)، tests/، resources/js/،
  frontend-overlay/ (منبع فرانت‌اند؛ فقط build لازم است)، و لاگ‌های محلی.

پیش‌نیاز: npm run build داخل laravel-backend (تا public/build ساخته شود).

ZIP با ترتیب/زمان ثابت ساخته می‌شود (تکرارپذیر) و sha256 آن چاپ می‌شود.
"""
from __future__ import annotations

import hashlib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'laravel-backend'
ARCHIVE = ROOT / 'deploy' / 'laravel-app' / 'artifacts' / 'karo-laravel.zip'
README = ROOT / 'deploy' / 'laravel-app' / 'INSTALL.md'

FIXED_TIMESTAMP = (2026, 1, 1, 0, 0, 0)

# پوشه‌ها/فایل‌هایی که کامل منتقل می‌شوند.
INCLUDE = [
    'app',
    'bootstrap',
    'config',
    'database',
    'public',
    'resources/views',
    'routes',
    'storage',
    'artisan',
    'composer.json',
    'composer.lock',
    '.env.example',
]

# مسیرهایی که حتی داخل پوشه‌های بالا هم نباید بروند.
EXCLUDE_PARTS = {
    'node_modules',
    'vendor',
    'frontend-overlay',
    'tests',
    'resources/js',
    'storage/logs',
    'storage/framework/cache/data',
    'storage/framework/sessions',
    'storage/framework/views',
    'public/hot',
    'bootstrap/cache',
}

EXCLUDE_SUFFIXES = {'.log', '.sqlite', '.sqlite-journal', '.DS_Store'}


def is_excluded(relative: str) -> bool:
    for part in EXCLUDE_PARTS:
        if relative == part or relative.startswith(part + '/'):
            return True
    return any(relative.endswith(suffix) for suffix in EXCLUDE_SUFFIXES)


def collect_files() -> list[Path]:
    files: list[Path] = []

    for entry in INCLUDE:
        source = APP / entry
        if not source.exists():
            continue

        if source.is_file():
            files.append(source)
            continue

        for path in source.rglob('*'):
            if path.is_file():
                files.append(path)

    kept = []
    for path in files:
        relative = path.relative_to(APP).as_posix()
        if is_excluded(relative):
            continue
        kept.append(path)

    return sorted(kept, key=lambda item: item.relative_to(APP).as_posix())


def main() -> None:
    if not (APP / 'artisan').is_file():
        raise SystemExit(f'پوشهٔ لاراول پیدا نشد: {APP}')

    build = APP / 'public' / 'build'
    if not (build / 'manifest.json').is_file():
        raise SystemExit(
            'دارایی‌های فرانت‌اند ساخته نشده‌اند؛ ابتدا «cd laravel-backend && npm ci && npm run build» را اجرا کنید.'
        )

    if not README.is_file():
        raise SystemExit(f'راهنمای نصب پیدا نشد: {README}')

    files = collect_files()
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)

    if ARCHIVE.exists():
        ARCHIVE.unlink()

    with zipfile.ZipFile(ARCHIVE, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            relative = path.relative_to(APP).as_posix()
            info = zipfile.ZipInfo(f'laravel-backend/{relative}', FIXED_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())

        # راهنمای نصب در ریشهٔ بسته
        info = zipfile.ZipInfo('INSTALL.md', FIXED_TIMESTAMP)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, README.read_bytes())

    digest = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
    size_mb = ARCHIVE.stat().st_size / (1024 * 1024)

    print(f'بسته ساخته شد: {ARCHIVE.relative_to(ROOT)}')
    print(f'تعداد فایل: {len(files) + 1}  —  حجم: {size_mb:.1f} مگابایت')
    print(f'sha256: {digest}')


if __name__ == '__main__':
    main()
