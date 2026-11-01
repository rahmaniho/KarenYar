<?php
declare(strict_types=1);

// No host bootstrap, DB, network, authentication data or real private key is loaded.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$repo = dirname(__DIR__);
$source = (string) file_get_contents($repo . '/deploy/cpanel-staging/admin/deploy-app.php');
$marker = '// Host entrypoint.';
$prefix = strstr($source, $marker, true);
if ($prefix === false || !str_starts_with($prefix, '<?php')) { throw new RuntimeException('missing_test_boundary'); }
eval(substr($prefix, 5));
if (!class_exists('ZipArchive')) { throw new RuntimeException('Tests require PHP zip'); }

$scratch = sys_get_temp_dir() . '/karen-deploy-tests-' . bin2hex(random_bytes(10));
define('KAREN_PRIVATE_DIR', $scratch . '/private');
define('KAREN_ENV', 'staging');
define('KAREN_ISSUER', 'karen-license-staging');
define('KAREN_AUDIENCE', 'hesabyar-app');
mkdir(KAREN_PRIVATE_DIR . '/keys', 0700, true);
mkdir(KAREN_PRIVATE_DIR . '/backups', 0700, true);
$metadata = KAREN_PRIVATE_DIR . '/keys/license-key-meta.json';
$metaJson = json_encode(['kid' => KAREN_DEPLOY_TRUST['kid'], 'public_key_b64' => KAREN_DEPLOY_TRUST['public_key_b64']], JSON_THROW_ON_ERROR);
file_put_contents($metadata, $metaJson);
file_put_contents(KAREN_PRIVATE_DIR . '/keys/never-read-secret.fixture', 'NOT_A_REAL_KEY');
$archive = $repo . '/deploy/cpanel-staging/artifacts/hesabyar-staging-web.zip';
$passed = [];

function deploy_test_assert(bool $condition, string $message): void
{
    if (!$condition) { throw new RuntimeException($message); }
}
function deploy_test_code(callable $call, string $code): void
{
    try { $call(); }
    catch (Throwable $e) {
        deploy_test_assert($e->getMessage() === $code, 'Expected ' . $code . ', got ' . $e->getMessage());
        return;
    }
    throw new RuntimeException('Expected error: ' . $code);
}
function deploy_test(string $name, callable $call): void
{
    global $passed;
    $call();
    $passed[] = $name;
}
function deploy_fixture(): array
{
    global $scratch;
    static $number = 0;
    $number++;
    $target = $scratch . '/www/' . $number . '/app';
    $backup = KAREN_PRIVATE_DIR . '/backups/fixture-' . $number . '/app';
    foreach ([$target, $backup] as $dir) {
        mkdir($dir . '/assets', 0755, true);
        foreach (['index.html', 'sw.js', '.htaccess', 'manifest.webmanifest'] as $name) {
            file_put_contents($dir . '/' . $name, 'OLD-' . $name);
        }
        file_put_contents($dir . '/assets/legacy.js', 'OLD-ASSET');
    }
    return [$target, $backup];
}
function deploy_test_zip(string $path, ?string $extra = null, bool $symlink = false): void
{
    $zip = new ZipArchive();
    deploy_test_assert($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true, 'create zip');
    foreach (['index.html', 'sw.js', '.htaccess', 'manifest.webmanifest'] as $name) { $zip->addFromString($name, 'x'); }
    if ($extra !== null) {
        $zip->addFromString($extra, 'x');
        if ($symlink) { $zip->setExternalAttributesName($extra, 3, 0120777 << 16); }
    }
    $zip->close();
}

try {
    deploy_test('pinned immutable package and public trust match the repository', function () use ($repo, $archive): void {
        $trust = json_decode((string) file_get_contents($repo . '/deploy/cpanel-staging/license-trust.json'), true, 512, JSON_THROW_ON_ERROR);
        deploy_test_assert(filesize($archive) === KAREN_DEPLOY_BYTES, 'zip size');
        deploy_test_assert(hash_file('sha256', $archive) === KAREN_DEPLOY_SHA256, 'zip SHA-256');
        deploy_test_assert(str_contains(KAREN_DEPLOY_URL, '/30904a3595e0157158fcc4805fd20d5417aae0fc/'), 'immutable commit');
        deploy_test_assert(KAREN_DEPLOY_TRUST['kid'] === $trust['issuerKeyId'], 'kid');
        deploy_test_assert(KAREN_DEPLOY_TRUST['public_key_b64'] === $trust['issuerPublicKeyB64'], 'public key');
        foreach (['environment', 'issuer', 'audience'] as $field) { deploy_test_assert(KAREN_DEPLOY_TRUST[$field] === $trust[$field], $field); }
    });
    deploy_test('valid preflight is read-only', function (): void {
        [$target, $backup] = deploy_fixture();
        karen_deploy_preflight($target, $backup);
        deploy_test_assert(file_get_contents($target . '/index.html') === 'OLD-index.html', 'preflight changed app');
    });
    foreach (['environment', 'issuer', 'audience'] as $field) {
        deploy_test('wrong ' . $field . ' is blocked', function () use ($field): void {
            [$target, $backup] = deploy_fixture();
            $trust = array_replace(KAREN_DEPLOY_TRUST, [$field => 'wrong']);
            deploy_test_code(fn() => karen_deploy_preflight($target, $backup, $trust), $field === 'environment' ? 'wrong_environment' : 'issuer_config_mismatch');
        });
    }
    deploy_test('unknown issuer kid is blocked', function () use ($metadata, $metaJson): void {
        [$target, $backup] = deploy_fixture();
        file_put_contents($metadata, json_encode(['kid' => 'foreign', 'public_key_b64' => KAREN_DEPLOY_TRUST['public_key_b64']]));
        try { deploy_test_code(fn() => karen_deploy_preflight($target, $backup), 'issuer_kid_mismatch'); }
        finally { file_put_contents($metadata, $metaJson); }
    });
    deploy_test('foreign issuer public key is blocked', function () use ($metadata, $metaJson): void {
        [$target, $backup] = deploy_fixture();
        file_put_contents($metadata, json_encode(['kid' => KAREN_DEPLOY_TRUST['kid'], 'public_key_b64' => base64_encode(str_repeat("\0", 32))]));
        try { deploy_test_code(fn() => karen_deploy_preflight($target, $backup), 'issuer_key_mismatch'); }
        finally { file_put_contents($metadata, $metaJson); }
    });
    deploy_test('missing rollback file is blocked', function (): void {
        [$target, $backup] = deploy_fixture();
        unlink($backup . '/index.html');
        deploy_test_code(fn() => karen_deploy_preflight($target, $backup), 'rollback_backup_missing');
    });
    deploy_test('stale rollback copy is blocked', function (): void {
        [$target, $backup] = deploy_fixture();
        file_put_contents($backup . '/index.html', 'stale');
        deploy_test_code(fn() => karen_deploy_preflight($target, $backup), 'rollback_backup_stale');
    });
    deploy_test('corrupt download cannot touch the live shell', function () use ($archive, $scratch): void {
        [$target, $backup] = deploy_fixture();
        $data = (string) file_get_contents($archive);
        $data[0] = chr(ord($data[0]) ^ 1);
        $bad = $scratch . '/bad.zip';
        file_put_contents($bad, $data);
        deploy_test_code(fn() => karen_deploy_install($bad, $target, $backup), 'package_integrity_failed');
        deploy_test_assert(file_get_contents($target . '/index.html') === 'OLD-index.html', 'corrupt download changed app');
    });
    foreach (['../escape.js', '/absolute.js', 'assets\\bad.js', 'server.php', '.env', 'assets/./bad.js'] as $name) {
        deploy_test('unsafe zip entry rejected: ' . $name, function () use ($scratch, $name): void {
            $path = $scratch . '/unsafe.zip';
            deploy_test_zip($path, $name);
            $zip = new ZipArchive(); $zip->open($path);
            try { deploy_test_code(fn() => karen_deploy_zip_files($zip), 'unsafe_zip'); }
            finally { $zip->close(); }
        });
    }
    deploy_test('zip symlink is rejected', function () use ($scratch): void {
        $path = $scratch . '/link.zip'; deploy_test_zip($path, 'assets/link.js', true);
        $zip = new ZipArchive(); $zip->open($path);
        try { deploy_test_code(fn() => karen_deploy_zip_files($zip), 'unsafe_zip'); }
        finally { $zip->close(); }
    });
    deploy_test('existing target symlink cannot escape the app directory', function () use ($scratch): void {
        [$target] = deploy_fixture();
        $outside = $scratch . '/outside'; mkdir($outside);
        symlink($outside, $target . '/images');
        $input = $scratch . '/image.png'; file_put_contents($input, 'x');
        deploy_test_code(fn() => karen_deploy_publish_file($target, 'images/escape.png', $input), 'unsafe_target');
        deploy_test_assert(!file_exists($outside . '/escape.png'), 'symlink escape');
    });
    deploy_test('complete real package installs; old assets and rollback copy survive', function () use ($archive): void {
        [$target, $backup] = deploy_fixture();
        karen_deploy_install($archive, $target, $backup);
        $zip = new ZipArchive(); $zip->open($archive);
        try {
            foreach (karen_deploy_zip_files($zip) as $name => $size) {
                deploy_test_assert(hash_file('sha256', $target . '/' . $name) === hash('sha256', (string) $zip->getFromName($name)), 'published file mismatch: ' . $name);
            }
        } finally { $zip->close(); }
        deploy_test_assert(file_get_contents($target . '/assets/legacy.js') === 'OLD-ASSET', 'old tabs lost assets');
        deploy_test_assert(file_get_contents($backup . '/index.html') === 'OLD-index.html', 'rollback copy modified');
    });
    deploy_test('failure after publishing index restores every old shell file', function () use ($archive): void {
        [$target, $backup] = deploy_fixture();
        $publish = function (string $root, string $name, string $source): void {
            karen_deploy_publish_file($root, $name, $source);
            if ($name === 'index.html') { throw new RuntimeException('injected_failure'); }
        };
        deploy_test_code(fn() => karen_deploy_install($archive, $target, $backup, $publish), 'deploy_failed_restored');
        foreach (['index.html', 'sw.js', '.htaccess', 'manifest.webmanifest'] as $name) {
            deploy_test_assert(file_get_contents($target . '/' . $name) === 'OLD-' . $name, 'rollback failed: ' . $name);
        }
    });
    deploy_test('private work directories cleaned and private-key sentinel unchanged', function (): void {
        deploy_test_assert(glob(KAREN_PRIVATE_DIR . '/backups/.issuer-pin-*') === [], 'private work dir leaked');
        deploy_test_assert(file_get_contents(KAREN_PRIVATE_DIR . '/keys/never-read-secret.fixture') === 'NOT_A_REAL_KEY', 'key file modified');
    });
    deploy_test('host entrypoint only downloads/installs inside POST branch', function () use ($source, $marker): void {
        $entry = substr($source, (int) strpos($source, $marker));
        $post = strpos($entry, "if (\$method === 'POST')");
        deploy_test_assert($post !== false && strpos($entry, 'karen_deploy_download(') > $post && strpos($entry, 'karen_deploy_install(') > $post, 'GET must not install');
        deploy_test_assert(!str_contains($entry, "\$_SERVER['PHP_AUTH_USER']"), 'unverified Basic header must not authenticate');
    });
    echo json_encode(['ok' => true, 'checks' => count($passed), 'passed' => $passed], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} finally {
    karen_deploy_remove_tree($scratch);
}
