# Karo Admin Android

Native Android shell for the staging Karo admin dashboard.

- Application ID: `ir.karensoft.hesabyar.admin`
- Minimum Android: 7 / API 24
- Target URL: `https://staging.karen-soft.ir/admin/`
- Authentication: cPanel Directory Privacy (HTTP Basic) via a native login dialog.
- Security: HTTPS-only, SSL errors are rejected, external links open in the browser, no file/content access, no sensitive offline cache.

## Build

```bash
cd admin-android
./gradlew assembleDebug
```

The debug APK is written to:

```text
app/build/outputs/apk/debug/app-debug.apk
```

The GitHub Actions workflow `.github/workflows/admin-android.yml` builds, verifies, and publishes a debug APK as a GitHub prerelease.

## Store release

A store release requires a private release keystore. Do not commit the keystore. Configure signing in `app/build.gradle` and provide the keystore through CI secrets.
