#!/usr/bin/env python3
"""
بسته‌بندی خروجی staging برای استقرار در پوشهٔ /app/ روی cPanel

پیش‌نیاز:
  npm run build:staging-web

این اسکریپت:
  1. فایل .htaccess مخصوص staging (RewriteBase /app/) را روی خروجی build می‌گذارد؛
  2. همهٔ فایل‌های dist را با ترتیب و زمان ثابت در ZIP می‌نویسد تا خروجی تکرارپذیر باشد؛
  3. sha256 بسته را چاپ می‌کند تا در deploy/cpanel-staging/admin/deploy-app.php ثبت شود.

خروجی:
  deploy/cpanel-staging/artifacts/karo-staging-web.zip
"""
from __future__ import annotations

import hashlib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
STAGING_HTACCESS = ROOT / 'deploy' / 'cpanel-staging' / 'app.htaccess'
ARCHIVE = ROOT / 'deploy' / 'cpanel-staging' / 'artifacts' / 'karo-staging-web.zip'

# زمان ثابت برای همهٔ ورودی‌ها؛ فقط محتوای build در هش اثر می‌گذارد.
FIXED_TIMESTAMP = (2026, 1, 1, 0, 0, 0)


def main() -> None:
    if not (DIST / 'index.html').is_file():
        raise SystemExit('خروجی build پیدا نشد؛ ابتدا npm run build:staging-web را اجرا کنید.')

    # .htaccess نسخهٔ staging جای فایل عمومی ریشه را می‌گیرد.
    (DIST / '.htaccess').write_bytes(STAGING_HTACCESS.read_bytes())

    files = sorted(path for path in DIST.rglob('*') if path.is_file())
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ARCHIVE, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            info = zipfile.ZipInfo(path.relative_to(DIST).as_posix(), FIXED_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())

    digest = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
    print(f'{ARCHIVE.relative_to(ROOT)}  ({len(files)} files)')
    print(f'sha256={digest}')


if __name__ == '__main__':
    main()
