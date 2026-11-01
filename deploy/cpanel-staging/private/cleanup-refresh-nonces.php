<?php
declare(strict_types=1);

// Private staging maintenance only. Never place this file in public_html.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (PHP_VERSION_ID < 80200) {
    echo json_encode(['ok' => false, 'error' => 'php_82_required']) . "\n";
    exit(1);
}

const KAREN_NONCE_CLEANUP_BATCH = 100;
const KAREN_NONCE_CLEANUP_PASSES = 5;
const KAREN_NONCE_CLEANUP_GRACE = 600;

function karen_nonce_cleanup_cutoff(PDO $pdo): string
{
    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'mysql') {
        throw new RuntimeException('pdo_mysql_required');
    }
    if ($pdo->inTransaction() || !(bool) $pdo->getAttribute(PDO::ATTR_AUTOCOMMIT)) {
        throw new RuntimeException('autocommit_required');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET time_zone = '+00:00'");
    $pdo->exec('SET SESSION innodb_lock_wait_timeout = 2');
    $engine = $pdo->query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() "
        . "AND TABLE_NAME = 'device_refresh_nonces'")->fetchColumn();
    if (strtoupper((string) $engine) !== 'INNODB') { throw new RuntimeException('nonce_schema_invalid'); }
    $primary = [];
    $expiry = false;
    foreach ($pdo->query('SHOW INDEX FROM device_refresh_nonces')->fetchAll(PDO::FETCH_ASSOC) as $index) {
        if ($index['Key_name'] === 'PRIMARY') { $primary[(int) $index['Seq_in_index']] = $index['Column_name']; }
        if ($index['Key_name'] === 'idx_device_refresh_nonces_expires'
            && (int) $index['Seq_in_index'] === 1 && $index['Column_name'] === 'expires_at'
            && strtoupper((string) $index['Index_type']) === 'BTREE'
            && strtoupper((string) ($index['Visible'] ?? 'YES')) !== 'NO'
            && strtoupper((string) ($index['Ignored'] ?? 'NO')) !== 'YES') {
            $expiry = true;
        }
    }
    ksort($primary);
    if (array_values($primary) !== ['nonce_hash'] || !$expiry) {
        throw new RuntimeException('nonce_schema_invalid');
    }
    $cutoff = (string) $pdo->query('SELECT DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL '
        . KAREN_NONCE_CLEANUP_GRACE . " SECOND, '%Y-%m-%d %H:%i:%s')")->fetchColumn();
    if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/D', $cutoff)) {
        throw new RuntimeException('database_clock_invalid');
    }
    return $cutoff;
}

function karen_nonce_cleanup_candidates(PDO $pdo, string $cutoff): array
{
    $stmt = $pdo->prepare('SELECT nonce_hash FROM device_refresh_nonces '
        . 'FORCE INDEX (idx_device_refresh_nonces_expires) '
        . 'WHERE expires_at < :cutoff ORDER BY expires_at LIMIT ' . KAREN_NONCE_CLEANUP_BATCH);
    $stmt->execute([':cutoff' => $cutoff]);
    $hashes = $stmt->fetchAll(PDO::FETCH_COLUMN);
    foreach ($hashes as $hash) {
        if (!is_string($hash) || strlen($hash) !== 32) { throw new RuntimeException('nonce_data_invalid'); }
    }
    return $hashes;
}

function karen_nonce_cleanup_delete(PDO $pdo, string $cutoff, array $hashes): int
{
    if (count($hashes) > KAREN_NONCE_CLEANUP_BATCH) { throw new RuntimeException('nonce_data_invalid'); }
    if ($hashes === []) { return 0; }
    $placeholders = [];
    foreach (array_values($hashes) as $i => $hash) {
        if (!is_string($hash) || strlen($hash) !== 32) { throw new RuntimeException('nonce_data_invalid'); }
        $placeholders[] = ':hash' . $i;
    }
    // Recheck expiry: a selected old hash may have been replaced by a fresh row.
    $stmt = $pdo->prepare('DELETE n FROM device_refresh_nonces AS n FORCE INDEX (PRIMARY) WHERE n.nonce_hash IN ('
        . implode(',', $placeholders) . ') AND n.expires_at < :cutoff');
    foreach (array_values($hashes) as $i => $hash) { $stmt->bindValue(':hash' . $i, $hash, PDO::PARAM_STR); }
    $stmt->bindValue(':cutoff', $cutoff, PDO::PARAM_STR);
    $stmt->execute();
    return $stmt->rowCount();
}

function karen_nonce_cleanup(PDO $pdo, bool $execute): array
{
    $cutoff = karen_nonce_cleanup_cutoff($pdo);
    $result = ['cutoff_utc' => $cutoff, 'grace_seconds' => KAREN_NONCE_CLEANUP_GRACE,
        'batch_size' => KAREN_NONCE_CLEANUP_BATCH, 'max_batches' => KAREN_NONCE_CLEANUP_PASSES,
        'batches' => 0, 'selected' => 0, 'deleted' => 0, 'limit_reached' => false];
    for ($pass = 0; $pass < KAREN_NONCE_CLEANUP_PASSES; $pass++) {
        $hashes = karen_nonce_cleanup_candidates($pdo, $cutoff);
        if (!$execute) { return $result + ['eligible_found' => $hashes !== []]; }
        if ($hashes === []) { break; }
        $result['selected'] += count($hashes);
        $result['deleted'] += karen_nonce_cleanup_delete($pdo, $cutoff, $hashes);
        $result['batches']++;
        if (count($hashes) < KAREN_NONCE_CLEANUP_BATCH) { break; }
        $result['limit_reached'] = $result['batches'] === KAREN_NONCE_CLEANUP_PASSES;
    }
    return $result;
}

function karen_nonce_cleanup_status(string $directory, array $status): void
{
    $target = $directory . '/refresh-nonce-cleanup-status.json';
    if (is_link($target)) { throw new RuntimeException('cleanup_storage_unavailable'); }
    $temporary = @tempnam($directory, '.nonce-status-');
    if ($temporary === false) { throw new RuntimeException('cleanup_storage_unavailable'); }
    try {
        // tempnam can fall back to the system temp directory; never write status there.
        if (dirname($temporary) !== $directory) { throw new RuntimeException('cleanup_storage_unavailable'); }
        $json = json_encode($status, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
        if (!@chmod($temporary, 0600) || @file_put_contents($temporary, $json) !== strlen($json)
            || !@rename($temporary, $target)) { throw new RuntimeException('cleanup_storage_unavailable'); }
    } finally { if (is_file($temporary)) { @unlink($temporary); } }
}

// Host entrypoint. Tests substitute only this private directory, never the SQL.
umask(0077);
$privateDir = '/home/karensof/private/karen-staging';
$mode = (isset($argc, $argv[1]) && $argc === 2 && in_array($argv[1], ['--check', '--run'], true)) ? substr($argv[1], 2) : '';
if ($mode === '') {
    echo json_encode(['ok' => false, 'error' => 'usage', 'usage' => 'php cleanup-refresh-nonces.php --check|--run']) . "\n";
    exit(64);
}
if (__DIR__ !== $privateDir) {
    echo json_encode(['ok' => false, 'error' => 'wrong_private_path']) . "\n";
    exit(1);
}
$lock = null;
$locked = false;
$exitCode = 0;
$cleanupMayHaveRun = false;
$report = ['ok' => false, 'version' => 1, 'mode' => $mode, 'at_utc' => gmdate('c')];
try {
    $lockPath = $privateDir . '/refresh-nonce-cleanup.lock';
    if (is_link($lockPath)) { throw new RuntimeException('cleanup_storage_unavailable'); }
    $lock = @fopen($lockPath, 'c');
    if (!is_resource($lock) || !@chmod($lockPath, 0600)) { throw new RuntimeException('cleanup_storage_unavailable'); }
    $locked = flock($lock, LOCK_EX | LOCK_NB);
    if (!$locked) {
        $report = array_replace($report, ['ok' => true, 'skipped_busy' => true]);
    } else {
        karen_nonce_cleanup_status($privateDir, $report + ['state' => 'starting']);
        if (!is_file($privateDir . '/bootstrap.php')) { throw new RuntimeException('bootstrap_missing'); }
        require $privateDir . '/bootstrap.php';
        if (!defined('KAREN_ENV') || KAREN_ENV !== 'staging') { throw new RuntimeException('wrong_environment'); }
        $pdo = karen_db();
        $cleanupMayHaveRun = $mode === 'run';
        $result = karen_nonce_cleanup($pdo, $mode === 'run');
        $report = array_replace($report, ['ok' => true, 'at_utc' => gmdate('c')], $result);
        karen_nonce_cleanup_status($privateDir, $report);
    }
} catch (Throwable $error) {
    $exitCode = 1;
    $known = ['pdo_mysql_required', 'autocommit_required', 'nonce_schema_invalid', 'nonce_data_invalid',
        'database_clock_invalid', 'cleanup_storage_unavailable', 'bootstrap_missing', 'wrong_environment'];
    $code = $error instanceof PDOException ? 'database_error'
        : (in_array($error->getMessage(), $known, true) ? $error->getMessage() : 'cleanup_failed');
    $report = array_replace($report, ['ok' => false, 'at_utc' => gmdate('c'), 'error' => $code,
        'partial_cleanup_possible' => $cleanupMayHaveRun]);
    if ($error instanceof PDOException) {
        $report['database_error_code'] = (int) ($error->errorInfo[1] ?? 0);
    }
    // Never print exception messages, credentials, SQL, nonce hashes or signing keys.
    if ($locked) {
        try { karen_nonce_cleanup_status($privateDir, $report); }
        catch (Throwable $ignored) { $report['status_write_failed'] = true; }
    }
} finally {
    if (is_resource($lock)) { if ($locked) { flock($lock, LOCK_UN); } fclose($lock); }
}
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
exit($exitCode);
