#!/usr/bin/env python3
"""
بسته‌بندی خروجی build برای استقرار روی هاست اشتراکی (cPanel/Apache)

دو هدف دارد:

  staging    → برای پوشهٔ /app/ روی staging.karen-soft.ir
               پیش‌نیاز: npm run build:staging-web
               خروجی:    deploy/cpanel-staging/artifacts/karo-staging-web.zip

  production → برای Document Root دامنهٔ https://karo.karen-soft.ir
               پیش‌نیاز: npm run build
               خروجی:    deploy/cpanel-app/artifacts/karo-web.zip

در هر دو حالت ZIP با ترتیب و زمان ثابت ساخته می‌شود (تکرارپذیر) و sha256 آن چاپ می‌شود.
"""
from __future__ import annotations

import argparse
import hashlib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
STAGING_HTACCESS = ROOT / 'deploy' / 'cpanel-staging' / 'app.htaccess'

TARGETS = {
    'staging': {
        'archive': ROOT / 'deploy' / 'cpanel-staging' / 'artifacts' / 'karo-staging-web.zip',
        'htaccess': STAGING_HTACCESS,
        'prerequisite': 'npm run build:staging-web',
    },
    'production': {
        'archive': ROOT / 'deploy' / 'cpanel-app' / 'artifacts' / 'karo-web.zip',
        # همان .htaccess عمومیِ public/ که با base=/ ساخته شده است
        'htaccess': None,
        'prerequisite': 'npm run build',
    },
}

# زمان ثابت برای همهٔ ورودی‌ها؛ فقط محتوای build در هش اثر می‌گذارد.
FIXED_TIMESTAMP = (2026, 1, 1, 0, 0, 0)


def main() -> None:
    parser = argparse.ArgumentParser(description='بسته‌بندی خروجی dist برای استقرار روی cPanel')
    parser.add_argument('--target', choices=sorted(TARGETS), default='staging')
    args = parser.parse_args()
    target = TARGETS[args.target]

    if not (DIST / 'index.html').is_file():
        raise SystemExit(f'خروجی build پیدا نشد؛ ابتدا «{target["prerequisite"]}» را اجرا کنید.')

    if target['htaccess'] is not None:
        (DIST / '.htaccess').write_bytes(Path(target['htaccess']).read_bytes())

    archive_path: Path = target['archive']
    files = sorted(path for path in DIST.rglob('*') if path.is_file())
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            info = zipfile.ZipInfo(path.relative_to(DIST).as_posix(), FIXED_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())

    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    print(f'{archive_path.relative_to(ROOT)}  ({len(files)} files)')
    print(f'sha256={digest}')


if __name__ == '__main__':
    main()
