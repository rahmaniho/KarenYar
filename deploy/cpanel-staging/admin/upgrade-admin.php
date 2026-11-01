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

if (empty($_SESSION['karen_upgrade_admin_csrf'])) {
    $_SESSION['karen_upgrade_admin_csrf'] = bin2hex(random_bytes(32));
}
$csrf = (string) $_SESSION['karen_upgrade_admin_csrf'];

function karen_upgrade_e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$releaseUrl = 'https://raw.githubusercontent.com/rahmaniho/KarenYar/arena/1bdeff0a-karenyar/deploy/cpanel-staging/artifacts/hesabyar-admin-dashboard.zip';
$expectedSha256 = '99adb1ff36185d938221a9bf56e385d0e0696489b4d7762ccef8f28c1a0d0a2d';
$targetDir = __DIR__;
$error = '';
$success = '';

function karen_upgrade_download(string $url, string $destination): void
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
            CURLOPT_USERAGENT => 'KarenYar-Staging-Admin-Upgrade/1.0',
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
            'user_agent' => 'KarenYar-Staging-Admin-Upgrade/1.0',
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
        'admin-upgrade-admin:' . hash('sha256', $adminUser) . ':' . bin2hex(karen_client_ip_hash()),
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

        $tempZip = tempnam(sys_get_temp_dir(), 'karen-admin-upgrade-');
        if ($tempZip === false) {
            throw new RuntimeException('cannot_create_temp_file');
        }

        karen_upgrade_download($releaseUrl, $tempZip);

        $actualSha256 = hash_file('sha256', $tempZip);
        if (!is_string($actualSha256) || !hash_equals($expectedSha256, $actualSha256)) {
            throw new RuntimeException('sha256_mismatch');
        }

        $zip = new ZipArchive();
        if ($zip->open($tempZip) !== true) {
            throw new RuntimeException('cannot_open_zip');
        }

        $required = ['index.php', 'issue-license.php', 'ui.php', 'manifest.json', 'sw.js', 'assets/admin.css', 'assets/admin.js'];
        $found = array_fill_keys($required, false);
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string) $zip->getNameIndex($i);
            if ($name === '' || strpos($name, '..') !== false || $name[0] === '/' || $name[0] === '\\') {
                $zip->close();
                throw new RuntimeException('unsafe_zip_entry');
            }
            $base = basename($name);
            if ($base === '.htaccess' || $base === '.user.ini' || $base === '.env' || strpos($base, '.') === 0) {
                $zip->close();
                throw new RuntimeException('zip_contains_dotfile');
            }
            if (isset($found[$name])) {
                $found[$name] = true;
            }
        }
        foreach ($found as $file => $ok) {
            if (!$ok) {
                $zip->close();
                throw new RuntimeException('zip_missing_' . $file);
            }
        }

        if (!is_writable($targetDir)) {
            $zip->close();
            throw new RuntimeException('admin_dir_not_writable');
        }

        if (!$zip->extractTo($targetDir)) {
            $zip->close();
            throw new RuntimeException('extract_failed');
        }
        $zip->close();

        $_SESSION['karen_upgrade_admin_csrf'] = bin2hex(random_bytes(32));
        $success = 'داشبورد جدید ادمین با موفقیت نصب شد.';
    } catch (Throwable $e) {
        error_log('karen staging admin upgrade failed: ' . $e->getMessage());
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
  <title>ارتقای داشبورد ادمین — staging</title>
  <style nonce="<?php echo $nonce; ?>">
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; background: #0b1220; color: #e2e8f0; font-family: system-ui, sans-serif; }
    main { max-width: 720px; margin: auto; }
    a { color: #93c5fd; }
    h1 { font-size: 20px; }
    .card { background: #111827; border: 1px solid #253044; border-radius: 16px; padding: 18px; margin: 14px 0; }
    .warn { color: #fbbf24; line-height: 1.9; }
    .ok { background: rgba(16,185,129,.12); border: 1px solid #34d399; border-radius: 12px; padding: 12px; margin: 12px 0; }
    .error { background: rgba(244,63,94,.12); border: 1px solid #fb7185; border-radius: 12px; padding: 12px; margin: 12px 0; direction: ltr; text-align: left; word-break: break-word; }
    button { margin-top: 18px; border: 0; border-radius: 12px; padding: 13px 18px; background: linear-gradient(135deg,#4f46e5,#7c3aed); color: white; cursor: pointer; font: inherit; font-weight: 600; }
    code { direction: ltr; display: block; word-break: break-all; background: #0f172a; border: 1px solid #253044; border-radius: 12px; padding: 12px; }
    .muted { color: #94a3b8; font-size: 13px; line-height: 1.8; }
  </style>
</head>
<body>
<main>
  <h1>ارتقای داشبورد ادمین — staging</h1>
  <p><a href="./index.php">بازگشت به پنل ادمین</a></p>

  <?php if ($success !== ''): ?>
    <div class="ok"><?php echo karen_upgrade_e($success); ?></div>
    <p><a href="./index.php">باز کردن داشبورد جدید</a></p>
    <p class="warn">بعد از موفقیت، همین فایل upgrade-admin.php را از File Manager حذف کن.</p>
  <?php endif; ?>

  <?php if ($error !== ''): ?>
    <div class="error"><?php echo karen_upgrade_e($error); ?></div>
  <?php endif; ?>

  <div class="card">
    <p class="warn">این صفحه فقط برای staging است. بستهٔ داشبورد جدید را از GitHub دانلود می‌کند، SHA-256 آن را بررسی می‌کند و فایل‌های پنل ادمین را به‌روزرسانی می‌کند. فایل‌های .htaccess و Directory Privacy تغییر نمی‌کنند.</p>
    <p>مسیر نصب:</p>
    <code><?php echo karen_upgrade_e($targetDir); ?></code>
    <p class="muted">فایل‌های index.php و issue-license.php جایگزین می‌شوند و پوشه assets، manifest.json، sw.js و offline.html اضافه می‌شوند. پوشه‌های app و v1 تغییر نمی‌کنند.</p>
    <form method="post">
      <input type="hidden" name="csrf" value="<?php echo karen_upgrade_e($csrf); ?>">
      <button type="submit">دانلود و نصب داشبورد جدید</button>
    </form>
  </div>
</main>
</body>
</html>
