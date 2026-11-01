<?php
declare(strict_types=1);

const KAREN_DEPLOY_URL = 'https://raw.githubusercontent.com/rahmaniho/KarenYar/30904a3595e0157158fcc4805fd20d5417aae0fc/deploy/cpanel-staging/artifacts/hesabyar-staging-web.zip';
const KAREN_DEPLOY_SHA256 = '2a88c326d2fe063aea69281502aec46c320447fb36d3e4ca867cf07e5cf53ec7';
const KAREN_DEPLOY_BYTES = 1411728;
const KAREN_DEPLOY_TRUST = [
    'environment' => 'staging', 'issuer' => 'karen-license-staging', 'audience' => 'hesabyar-app',
    'kid' => 'staging-ed25519-c6764aea4f3fda42',
    'public_key_b64' => 'mRSBJrVv5+hHAw0QkC5u5nMinkxap5w1xxcJpIHHDDo=',
];

function karen_deploy_e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function karen_deploy_preflight(string $target, string $backup, array $trust = KAREN_DEPLOY_TRUST): void
{
    if (KAREN_ENV !== 'staging' || KAREN_ENV !== $trust['environment']) {
        throw new RuntimeException('wrong_environment');
    }
    if (KAREN_ISSUER !== $trust['issuer'] || KAREN_AUDIENCE !== $trust['audience']) {
        throw new RuntimeException('issuer_config_mismatch');
    }
    $meta = json_decode((string) @file_get_contents(KAREN_PRIVATE_DIR . '/keys/license-key-meta.json'), true);
    if (!is_array($meta) || ($meta['kid'] ?? '') !== $trust['kid']) {
        throw new RuntimeException('issuer_kid_mismatch');
    }
    $public = base64_decode((string) ($meta['public_key_b64'] ?? ''), true);
    $pinned = base64_decode($trust['public_key_b64'], true);
    if ($public === false || strlen($public) !== 32 || $pinned === false || !hash_equals($pinned, $public)) {
        throw new RuntimeException('issuer_key_mismatch');
    }
    $privateReal = realpath(KAREN_PRIVATE_DIR);
    $backupReal = realpath($backup);
    if (is_link($target) || !is_dir($target) || is_link($backup) || $privateReal === false ||
        $backupReal === false || !str_starts_with($backupReal, $privateReal . DIRECTORY_SEPARATOR) ||
        !is_dir($target . '/assets') || is_link($target . '/assets') ||
        !is_dir($backup . '/assets') || is_link($backup . '/assets')) {
        throw new RuntimeException('rollback_backup_missing');
    }
    foreach (['index.html', 'sw.js', '.htaccess', 'manifest.webmanifest'] as $name) {
        if (!is_file($target . '/' . $name) || !is_file($backup . '/' . $name) ||
            is_link($target . '/' . $name) || is_link($backup . '/' . $name)) {
            throw new RuntimeException('rollback_backup_missing');
        }
        $before = hash_file('sha256', $target . '/' . $name);
        $saved = hash_file('sha256', $backup . '/' . $name);
        if (!is_string($before) || !is_string($saved) || !hash_equals($before, $saved)) {
            throw new RuntimeException('rollback_backup_stale');
        }
    }
}

function karen_deploy_download(string $destination): void
{
    if (function_exists('curl_init')) {
        $fp = fopen($destination, 'wb');
        if ($fp === false) { throw new RuntimeException('download_failed'); }
        $ch = curl_init(KAREN_DEPLOY_URL);
        if ($ch === false) { fclose($fp); throw new RuntimeException('download_failed'); }
        curl_setopt_array($ch, [
            CURLOPT_FILE => $fp, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 180,
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_MAXFILESIZE => KAREN_DEPLOY_BYTES,
            CURLOPT_USERAGENT => 'KarenYar-Staging-Trust-Deploy/2.0',
        ]);
        $ok = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        fclose($fp);
        if ($ok !== true || $status !== 200) { throw new RuntimeException('download_failed'); }
        return;
    }
    if (!ini_get('allow_url_fopen')) { throw new RuntimeException('no_download_transport'); }
    $context = stream_context_create([
        'http' => ['timeout' => 180, 'follow_location' => 0, 'user_agent' => 'KarenYar-Staging-Trust-Deploy/2.0'],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $data = @file_get_contents(KAREN_DEPLOY_URL, false, $context, 0, KAREN_DEPLOY_BYTES + 1);
    if ($data === false || !preg_match('~^HTTP/\S+ 200\b~', $http_response_header[0] ?? '') ||
        strlen($data) !== KAREN_DEPLOY_BYTES || file_put_contents($destination, $data) !== strlen($data)) {
        throw new RuntimeException('download_failed');
    }
}

function karen_deploy_zip_files(ZipArchive $zip): array
{
    if ($zip->numFiles < 4 || $zip->numFiles > 2000) { throw new RuntimeException('unsafe_zip'); }
    $files = [];
    $total = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $name = is_array($stat) ? (string) $stat['name'] : '';
        $size = is_array($stat) ? (int) $stat['size'] : -1;
        if ($name === '' || !preg_match('~^[A-Za-z0-9._/-]+$~D', $name) ||
            $name[0] === '/' || str_contains($name, '..') || str_contains($name, '//') || in_array('.', explode('/', $name), true) ||
            isset($files[$name]) || $size < 0 || $size > 8 * 1024 * 1024 ||
            ($name !== '.htaccess' && !preg_match('~\.(?:js|css|html|woff2|png|svg|webmanifest|ico)$~D', $name))) {
            throw new RuntimeException('unsafe_zip');
        }
        $opsys = 0;
        $attributes = 0;
        if (!$zip->getExternalAttributesIndex($i, $opsys, $attributes) ||
            ($opsys === 3 && (($attributes >> 16) & 0170000) === 0120000)) {
            throw new RuntimeException('unsafe_zip');
        }
        $total += $size;
        if ($total > 32 * 1024 * 1024) { throw new RuntimeException('unsafe_zip'); }
        $files[$name] = $size;
    }
    foreach (['index.html', 'sw.js', '.htaccess', 'manifest.webmanifest'] as $name) {
        if (!isset($files[$name]) || $files[$name] === 0) { throw new RuntimeException('unsafe_zip'); }
    }
    return $files;
}

function karen_deploy_remove_tree(string $dir): void
{
    if (!is_dir($dir) || is_link($dir)) { return; }
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($items as $item) {
        if ($item->isDir() && !$item->isLink()) { @rmdir($item->getPathname()); }
        else { @unlink($item->getPathname()); }
    }
    @rmdir($dir);
}

function karen_deploy_publish_file(string $root, string $name, string $source): void
{
    if ($name === '' || !preg_match('~^[A-Za-z0-9._/-]+$~D', $name) || $name[0] === '/' ||
        str_contains($name, '..') || in_array('.', explode('/', $name), true)) { throw new RuntimeException('unsafe_target'); }
    $parent = $root;
    foreach (array_slice(explode('/', $name), 0, -1) as $part) {
        $parent .= '/' . $part;
        if (is_link($parent) || (file_exists($parent) && !is_dir($parent))) { throw new RuntimeException('unsafe_target'); }
        if (!is_dir($parent) && !mkdir($parent, 0755)) { throw new RuntimeException('publish_failed'); }
    }
    $destination = $root . '/' . $name;
    if (is_link($destination) || is_dir($destination)) { throw new RuntimeException('unsafe_target'); }
    $parent = (string) realpath($parent);
    $temp = tempnam($parent, '.issuer-pin-');
    if ($temp === false) { throw new RuntimeException('publish_failed'); }
    try {
        if (dirname($temp) !== $parent || !copy($source, $temp) || !chmod($temp, 0644) || !rename($temp, $destination)) {
            throw new RuntimeException('publish_failed');
        }
    } finally {
        if (is_file($temp)) { @unlink($temp); }
    }
}

function karen_deploy_install(string $archive, string $target, string $backup, ?callable $publisher = null): void
{
    karen_deploy_preflight($target, $backup);
    if (!class_exists('ZipArchive')) { throw new RuntimeException('php_zip_extension_missing'); }
    if (filesize($archive) !== KAREN_DEPLOY_BYTES || !hash_equals(KAREN_DEPLOY_SHA256, (string) hash_file('sha256', $archive))) {
        throw new RuntimeException('package_integrity_failed');
    }
    $publisher ??= 'karen_deploy_publish_file';
    $work = KAREN_PRIVATE_DIR . '/backups/.issuer-pin-' . bin2hex(random_bytes(12));
    if (!mkdir($work, 0700)) { throw new RuntimeException('cannot_create_work_dir'); }
    $zip = new ZipArchive();
    $opened = false;
    $shellsTouched = false;
    $shells = ['.htaccess', 'manifest.webmanifest', 'index.html', 'sw.js'];
    try {
        if ($zip->open($archive) !== true) { throw new RuntimeException('unsafe_zip'); }
        $opened = true;
        $files = karen_deploy_zip_files($zip);
        if (!$zip->extractTo($work)) { throw new RuntimeException('extract_failed'); }
        $zip->close();
        $opened = false;
        foreach ($files as $name => $size) {
            if (!is_file($work . '/' . $name) || is_link($work . '/' . $name) || filesize($work . '/' . $name) !== $size) {
                throw new RuntimeException('extract_failed');
            }
        }
        // Publish assets first; retain old hashed assets for already-open tabs.
        foreach ($files as $name => $size) {
            if (!in_array($name, $shells, true)) { $publisher($target, $name, $work . '/' . $name); }
        }
        $shellsTouched = true;
        foreach ($shells as $name) { $publisher($target, $name, $work . '/' . $name); }
    } catch (Throwable $error) {
        if ($shellsTouched) {
            $restored = true;
            foreach ($shells as $name) {
                try { karen_deploy_publish_file($target, $name, $backup . '/' . $name); }
                catch (Throwable $rollbackError) { $restored = false; }
            }
            throw new RuntimeException($restored ? 'deploy_failed_restored' : 'rollback_required', 0, $error);
        }
        throw $error;
    } finally {
        if ($opened) { $zip->close(); }
        karen_deploy_remove_tree($work);
    }
}

// Host entrypoint. Tests load only the public constants and helpers above.
require '/home/karensof/private/karen-staging/bootstrap.php';
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
if (!defined('KAREN_ENV') || KAREN_ENV !== 'staging') { karen_fail(403, 'staging_only'); }
$expectedRoot = realpath('/home/karensof/public_html/staging.karen-soft.ir');
if ($expectedRoot === false || realpath(dirname(__DIR__)) !== $expectedRoot) { karen_fail(403, 'wrong_webroot'); }
$adminUser = trim((string) ($_SERVER['REMOTE_USER'] ?? ''));
if ($adminUser === '') { $adminUser = trim((string) ($_SERVER['REDIRECT_REMOTE_USER'] ?? '')); }
if ($adminUser === '') { karen_fail(401, 'admin_auth_required'); }
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method !== 'GET' && $method !== 'POST') { header('Allow: GET, POST'); karen_fail(405, 'method_not_allowed'); }
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
}
if (empty($_SESSION['karen_deploy_trust_csrf'])) { $_SESSION['karen_deploy_trust_csrf'] = bin2hex(random_bytes(32)); }
$csrf = (string) $_SESSION['karen_deploy_trust_csrf'];
$target = dirname(__DIR__) . '/app';
$backup = KAREN_PRIVATE_DIR . '/backups/pre-issuer-pin-20261101/app';
$error = '';
$success = false;
try { karen_deploy_preflight($target, $backup); }
catch (Throwable $e) { $error = $e->getMessage(); }
if ($method === 'POST') {
    if (!hash_equals($csrf, (string) ($_POST['csrf'] ?? '')) || ($_POST['action'] ?? '') !== 'install-pinned-app') { karen_fail(403, 'invalid_csrf'); }
    $_SESSION['karen_deploy_trust_csrf'] = bin2hex(random_bytes(32));
    $csrf = (string) $_SESSION['karen_deploy_trust_csrf'];
    karen_rate_limit('admin-deploy-trust:' . hash('sha256', $adminUser) . ':' . bin2hex(karen_client_ip_hash()), 5, 300);
    $archive = '';
    $lock = null;
    try {
        if ($error !== '') { throw new RuntimeException($error); }
        if (function_exists('set_time_limit')) { @set_time_limit(240); }
        $lock = fopen(KAREN_PRIVATE_DIR . '/backups/issuer-pin-deploy.lock', 'c');
        if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) { throw new RuntimeException('deploy_busy'); }
        @chmod(KAREN_PRIVATE_DIR . '/backups/issuer-pin-deploy.lock', 0600);
        $archive = tempnam(sys_get_temp_dir(), 'karen-trust-');
        if ($archive === false) { $archive = ''; throw new RuntimeException('cannot_create_temp_file'); }
        karen_deploy_download($archive);
        karen_deploy_install($archive, $target, $backup);
        $success = true;
    } catch (Throwable $e) {
        error_log('karen staging trust deploy failed: ' . $e->getMessage());
        $error = $e->getMessage();
    } finally {
        if ($archive !== '' && is_file($archive)) { @unlink($archive); }
        if (is_resource($lock)) { flock($lock, LOCK_UN); fclose($lock); }
    }
}
$knownErrors = ['wrong_environment', 'issuer_config_mismatch', 'issuer_kid_mismatch', 'issuer_key_mismatch',
    'rollback_backup_missing', 'rollback_backup_stale', 'download_failed', 'no_download_transport', 'unsafe_zip',
    'unsafe_target', 'publish_failed', 'php_zip_extension_missing', 'package_integrity_failed', 'cannot_create_work_dir',
    'extract_failed', 'rollback_required', 'deploy_failed_restored', 'deploy_busy', 'cannot_create_temp_file'];
if ($error !== '' && !in_array($error, $knownErrors, true)) { error_log('karen staging deploy unexpected: ' . $error); $error = 'deploy_failed'; }
$nonce = base64_encode(random_bytes(18));
header('Content-Type: text/html; charset=utf-8');
header("Content-Security-Policy: default-src 'none'; style-src 'nonce-" . $nonce . "'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>نصب نسخهٔ پین‌شدهٔ staging</title>
<style nonce="<?php echo $nonce; ?>">
*{box-sizing:border-box}body{margin:0;padding:16px;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;line-height:1.9}main{max-width:760px;margin:auto}h1{font-size:21px}.card{padding:16px;margin:16px 0;background:#111827;border:1px solid #334155;border-radius:14px}.ok{color:#6ee7b7}.error{color:#fda4af}.warn{color:#fcd34d}code{display:block;direction:ltr;text-align:left;overflow-wrap:anywhere;font-size:12px}a{color:#93c5fd}button{padding:12px 16px;border:0;border-radius:10px;background:#4f46e5;color:white;font:inherit;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}
</style>
</head>
<body><main>
<h1>نصب نسخهٔ پین‌شدهٔ وب‌اپ — فقط staging</h1>
<p><a href="./">بازگشت به پنل مدیریت</a></p>
<div class="card">
<p>شناسهٔ کلید مورد اعتماد:</p>
<code><?php echo karen_deploy_e(KAREN_DEPLOY_TRUST['kid']); ?></code>
<p>SHA-256 بسته:</p><code><?php echo karen_deploy_e(KAREN_DEPLOY_SHA256); ?></code>
<p>نسخهٔ بازگشت:</p><code><?php echo karen_deploy_e($backup); ?></code>
</div>
<?php if ($success): ?>
<div class="card ok">نسخهٔ پین‌شده با موفقیت نصب شد. حالا وب‌اپ را در همان مرورگر بررسی کنید.</div>
<p><a href="/app/settings?verify=issuer-pin-20261101#license">باز کردن بخش لایسنس</a></p>
<p class="warn">پس از تأیید وب‌اپ، فایل deploy-app.php را از هاست حذف کنید.</p>
<?php elseif ($error !== ''): ?>
<div class="card error">پیش‌بررسی یا نصب ناموفق بود. کد زیر را گزارش کنید؛ کلید خصوصی یا کد فعال‌سازی نفرستید.<code><?php echo karen_deploy_e($error); ?></code></div>
<?php else: ?>
<div class="card ok">کلید و تنظیمات سرور تأیید شد؛ نسخهٔ بازگشت موجود است. هنوز نصبی انجام نشده است.</div>
<?php endif; ?>
<div class="card">
<p>باز کردن این صفحه به‌تنهایی برنامه را تغییر نمی‌دهد. نصب فقط با دکمهٔ زیر انجام می‌شود؛ ابتدا بسته و کلید سرور بررسی می‌شوند.</p>
<p class="warn">فقط فایل‌های app به‌روز می‌شوند؛ فایل‌های دیگر admin و v1، کلید خصوصی و production جایگزین نمی‌شوند. اطلاعات مالی و هویت دستگاه در مرورگر پاک نمی‌شوند.</p>
<form method="post">
<input type="hidden" name="csrf" value="<?php echo karen_deploy_e($csrf); ?>">
<input type="hidden" name="action" value="install-pinned-app">
<button type="submit" <?php echo ($success || $error !== '') ? 'disabled' : ''; ?>>نصب نسخهٔ پین‌شده</button>
</form>
</div>
</main></body></html>
