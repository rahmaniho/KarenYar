<?php
declare(strict_types=1);

require '/home/karensof/private/karen-staging/bootstrap.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');

if (KAREN_ENV !== 'staging') {
    karen_fail(403, 'staging_only');
}

$adminUser = (string) ($_SERVER['REMOTE_USER'] ?? $_SERVER['PHP_AUTH_USER'] ?? $_SERVER['REDIRECT_REMOTE_USER'] ?? '');
if ($adminUser === '') {
    karen_fail(401, 'admin_auth_required');
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

if (empty($_SESSION['karen_deploy_app_csrf'])) {
    $_SESSION['karen_deploy_app_csrf'] = bin2hex(random_bytes(32));
}
$csrf = (string) $_SESSION['karen_deploy_app_csrf'];

function karen_deploy_e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// بستهٔ رسمی استقرار staging (ساخته‌شده با «npm run build:staging-archive»).
// با متغیر محیطی KAREN_DEPLOY_RELEASE_URL می‌توان به شاخه/آینهٔ دیگری اشاره کرد.
$releaseUrl = getenv('KAREN_DEPLOY_RELEASE_URL') ?: 'https://raw.githubusercontent.com/rahmaniho/KarenYar/main/deploy/cpanel-staging/artifacts/karo-staging-web.zip';
// پس از هر بازسازی بسته، این هش را از خروجی scripts/build-staging-archive.py به‌روز کنید.
$expectedSha256 = '6386fe6c69f3ccad30ceef5f0a56fdbbefe70b3d14fb10beabb38550479de893';
$targetDir = dirname(__DIR__) . '/app';
$error = '';
$success = '';

function karen_deploy_download(string $url, string $destination): void
{
    if (function_exists('curl_init')) {
        $fp = fopen($destination, 'wb');
        if ($fp === false) {
            throw new RuntimeException('cannot_open_temp_file');
        }
        $ch = curl_init($url);
        if ($ch === false) {
            fclose($fp);
            throw new RuntimeException('curl_init_failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_FILE => $fp,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_CONNECTTIMEOUT => 20,
            CURLOPT_TIMEOUT => 180,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT => 'KarenYar-Staging-Deploy/1.0',
        ]);
        $ok = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        fclose($fp);
        if ($ok !== true || $status !== 200) {
            throw new RuntimeException('download_failed_http_' . $status . ($curlError !== '' ? ': ' . $curlError : ''));
        }
        return;
    }

    if (!ini_get('allow_url_fopen')) {
        throw new RuntimeException('no_download_transport');
    }
    $context = stream_context_create([
        'http' => [
            'timeout' => 180,
            'follow_location' => 1,
            'user_agent' => 'KarenYar-Staging-Deploy/1.0',
        ],
    ]);
    $data = @file_get_contents($url, false, $context);
    if ($data === false) {
        throw new RuntimeException('download_failed');
    }
    if (file_put_contents($destination, $data) === false) {
        throw new RuntimeException('cannot_write_temp_file');
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $suppliedCsrf = (string) ($_POST['csrf'] ?? '');
    if (!hash_equals($csrf, $suppliedCsrf)) {
        karen_fail(403, 'invalid_csrf');
    }

    karen_rate_limit(
        'admin-deploy-app:' . hash('sha256', $adminUser) . ':' . bin2hex(karen_client_ip_hash()),
        5,
        300
    );

    $tempZip = '';
    try {
        if (!class_exists('ZipArchive')) {
            throw new RuntimeException('php_zip_extension_missing');
        }
        if (function_exists('set_time_limit')) {
            @set_time_limit(240);
        }

        $tempZip = tempnam(sys_get_temp_dir(), 'karen-staging-app-');
        if ($tempZip === false) {
            throw new RuntimeException('cannot_create_temp_file');
        }

        karen_deploy_download($releaseUrl, $tempZip);

        $actualSha256 = hash_file('sha256', $tempZip);
        if (!is_string($actualSha256) || !hash_equals($expectedSha256, $actualSha256)) {
            throw new RuntimeException('sha256_mismatch');
        }

        $zip = new ZipArchive();
        if ($zip->open($tempZip) !== true) {
            throw new RuntimeException('cannot_open_zip');
        }

        $hasIndex = false;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string) $zip->getNameIndex($i);
            if ($name === '' || strpos($name, '..') !== false || $name[0] === '/' || $name[0] === '\\') {
                $zip->close();
                throw new RuntimeException('unsafe_zip_entry');
            }
            if ($name === 'index.html') {
                $hasIndex = true;
            }
        }
        if (!$hasIndex) {
            $zip->close();
            throw new RuntimeException('zip_missing_index_html');
        }

        if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
            $zip->close();
            throw new RuntimeException('cannot_create_app_dir');
        }

        if (!$zip->extractTo($targetDir)) {
            $zip->close();
            throw new RuntimeException('extract_failed');
        }
        $zip->close();

        if (!is_file($targetDir . '/index.html')) {
            throw new RuntimeException('index_html_missing_after_extract');
        }

        $_SESSION['karen_deploy_app_csrf'] = bin2hex(random_bytes(32));
        $success = 'نسخه وب آزمایشی با موفقیت در پوشه app نصب شد.';
    } catch (Throwable $e) {
        error_log('karen staging deploy app failed: ' . $e->getMessage());
        $error = $e->getMessage();
    } finally {
        if ($tempZip !== '' && is_file($tempZip)) {
            @unlink($tempZip);
        }
    }
}

$nonce = base64_encode(random_bytes(18));
header("Content-Security-Policy: default-src 'none'; style-src 'nonce-" . $nonce . "'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>نصب وب‌اپ آزمایشی — staging</title>
  <style nonce="<?php echo $nonce; ?>">
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    main { max-width: 720px; margin: auto; }
    a { color: #93c5fd; }
    h1 { font-size: 20px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 14px; padding: 16px; margin: 14px 0; }
    .warn { color: #fbbf24; line-height: 1.9; }
    .ok { background: #064e3b; border: 1px solid #34d399; border-radius: 10px; padding: 12px; margin: 12px 0; }
    .error { background: #7f1d1d; border: 1px solid #fecaca; border-radius: 10px; padding: 12px; margin: 12px 0; direction: ltr; text-align: left; word-break: break-word; }
    button { margin-top: 18px; border: 0; border-radius: 10px; padding: 13px 16px; background: #4f46e5; color: white; cursor: pointer; font: inherit; }
    code { direction: ltr; display: block; word-break: break-all; background: #0b1220; border: 1px solid #334155; border-radius: 10px; padding: 12px; }
    .muted { color: #94a3b8; font-size: 13px; line-height: 1.8; }
  </style>
</head>
<body>
<main>
  <h1>نصب وب‌اپ آزمایشی کارو — staging</h1>
  <p><a href="./">بازگشت به پنل ادمین</a></p>

  <?php if ($success !== ''): ?>
    <div class="ok"><?php echo karen_deploy_e($success); ?></div>
    <p><a href="/app/">باز کردن وب‌اپ آزمایشی</a></p>
    <p class="warn">بعد از موفقیت، همین فایل deploy-app.php را از File Manager حذف کن.</p>
  <?php endif; ?>

  <?php if ($error !== ''): ?>
    <div class="error"><?php echo karen_deploy_e($error); ?></div>
  <?php endif; ?>

  <div class="card">
    <p class="warn">این صفحه فقط برای staging است. بستهٔ رسمی وب‌اپ را از GitHub دانلود می‌کند، SHA-256 آن را بررسی می‌کند و در پوشهٔ app نصب می‌کند. به نسخهٔ اصلی کارو دست نمی‌زند.</p>
    <p>مسیر نصب:</p>
    <code><?php echo karen_deploy_e($targetDir); ?></code>
    <p class="muted">اگر پوشه app از قبل وجود داشته باشد، فایل‌های بسته روی آن نوشته می‌شوند. پوشه‌های admin و v1 تغییر نمی‌کنند.</p>
    <form method="post">
      <input type="hidden" name="csrf" value="<?php echo karen_deploy_e($csrf); ?>">
      <button type="submit">دانلود و نصب وب‌اپ آزمایشی</button>
    </form>
  </div>
</main>
</body>
</html>
