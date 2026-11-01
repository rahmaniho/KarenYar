<?php
declare(strict_types=1);

// Included by the disposable real-database suite; never deploy this fixture.
if (PHP_SAPI !== 'cli' || getenv('KAREN_LICENSE_DB_TESTS') !== '1') { exit(1); }
$cleanupSource = (string) file_get_contents($repo . '/deploy/cpanel-staging/private/cleanup-refresh-nonces.php');
$cleanupPrefix = strstr($cleanupSource, '// Host entrypoint.', true);
refresh_test_assert($cleanupPrefix !== false, 'Cleaner test boundary');
eval(substr($cleanupPrefix, 5));
$cleanupCopy = str_replace("'/home/karensof/private/karen-staging'", var_export($scratch, true), $cleanupSource, $cleanupReplaced);
refresh_test_equal(1, $cleanupReplaced, 'Only the private directory is substituted, not cleanup SQL');
file_put_contents($scratch . '/cleanup-refresh-nonces.php', $cleanupCopy);
file_put_contents($scratch . '/wrong-cleanup.php', $cleanupSource);
file_put_contents($scratch . '/bootstrap.php', <<<'PHP'
<?php
if (getenv('KAREN_LICENSE_DB_TESTS') !== '1') { exit(1); }
file_put_contents(__DIR__ . '/cleanup-bootstrap-hit', 'loaded');
define('KAREN_ENV', getenv('KAREN_CLEANUP_TEST_ENV') ?: 'staging');
function karen_db(): PDO {
    file_put_contents(__DIR__ . '/cleanup-database-hit', 'opened');
    if (getenv('KAREN_CLEANUP_TEST_FAIL') === '1') {
        $error = new PDOException('SECRET_TEST_CREDENTIAL SQL and private details');
        $error->errorInfo = ['HY000', 1205, 'SECRET_TEST_CREDENTIAL'];
        throw $error;
    }
    return new PDO((string) getenv('KAREN_LICENSE_TEST_DSN'), 'root', (string) getenv('KAREN_LICENSE_TEST_PASSWORD'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}
PHP
);

function nonce_test_insert(string $label, int $expiry, int $device = 1): string
{
    global $db;
    $hash = hash('sha256', 'cleanup-' . $label, true);
    $stmt = $db->prepare('INSERT INTO device_refresh_nonces (nonce_hash, device_id, expires_at) VALUES (?, ?, ?)');
    $stmt->execute([$hash, $device, gmdate('Y-m-d H:i:s', $expiry)]);
    return $hash;
}
function nonce_test_count(?string $hash = null): int
{
    global $db;
    $stmt = $db->prepare('SELECT COUNT(*) FROM device_refresh_nonces' . ($hash === null ? '' : ' WHERE nonce_hash = ?'));
    $stmt->execute($hash === null ? [] : [$hash]);
    return (int) $stmt->fetchColumn();
}
function nonce_test_error(callable $call, string $code): void
{
    try { $call(); }
    catch (Throwable $error) { refresh_test_equal($code, $error->getMessage(), 'Cleaner error'); return; }
    throw new RuntimeException('Expected cleaner error ' . $code);
}
function nonce_test_clear_markers(): void
{
    global $scratch;
    foreach (['cleanup-bootstrap-hit', 'cleanup-database-hit'] as $name) { @unlink($scratch . '/' . $name); }
}
function nonce_test_cli(array $arguments, array $environment = [], string $file = 'cleanup-refresh-nonces.php'): array
{
    global $scratch;
    $base = $scratch . '/cleanup-process-' . bin2hex(random_bytes(6));
    $process = proc_open([PHP_BINARY, $scratch . '/' . $file, ...$arguments], [
        0 => ['pipe', 'r'], 1 => ['file', $base . '.out', 'w'], 2 => ['file', $base . '.err', 'w'],
    ], $pipes, null, array_replace(getenv(), $environment));
    refresh_test_assert(is_resource($process), 'Start cleanup CLI');
    fclose($pipes[0]);
    $deadline = microtime(true) + 10;
    try {
        do {
            $state = proc_get_status($process);
            if (!$state['running']) { break; }
            if (microtime(true) > $deadline) { throw new RuntimeException('Cleanup CLI timeout'); }
            usleep(10000);
        } while (true);
    } finally {
        if (proc_get_status($process)['running']) { proc_terminate($process); }
        $closed = proc_close($process);
    }
    $output = (string) file_get_contents($base . '.out');
    $errors = (string) file_get_contents($base . '.err');
    return ['exit' => $state['exitcode'] >= 0 ? $state['exitcode'] : $closed,
        'result' => json_decode($output, true, 512, JSON_THROW_ON_ERROR), 'raw' => $output . $errors];
}
function nonce_test_status(): array
{
    global $scratch;
    return json_decode((string) file_get_contents($scratch . '/refresh-nonce-cleanup-status.json'), true, 512, JSON_THROW_ON_ERROR);
}

refresh_test_case('cleanup check is read-only and reports eligible rows', function () use ($db): void {
    nonce_test_insert('old', time() - 1800);
    nonce_test_insert('just-expired', time() - 1);
    nonce_test_insert('live', time() + 600);
    $result = karen_nonce_cleanup($db, false);
    refresh_test_equal(true, $result['eligible_found'], 'Check sees old row');
    refresh_test_equal(0, $result['deleted'], 'Check does not delete');
    refresh_test_equal(3, nonce_test_count(), 'All check-mode rows preserved');
});
refresh_test_case('cleanup strict cutoff preserves live, grace and exact-boundary nonces', function () use ($db): void {
    $now = 1800000000;
    $db->exec('SET timestamp = ' . $now);
    try {
        $hashes = [];
        foreach ([-1201, -601, -600, -599, -1, 0, 600] as $offset) { $hashes[$offset] = nonce_test_insert((string) $offset, $now + $offset); }
        $result = karen_nonce_cleanup($db, true);
        refresh_test_equal(gmdate('Y-m-d H:i:s', $now - 600), $result['cutoff_utc'], 'Database clock and fixed grace');
        refresh_test_equal(2, $result['deleted'], 'Only strictly older than grace cutoff');
        foreach ($hashes as $offset => $hash) { refresh_test_equal($offset < -600 ? 0 : 1, nonce_test_count($hash), 'Boundary ' . $offset); }
    } finally { $db->exec('SET timestamp = 0'); }
});
refresh_test_case('cleanup is bounded to 500 rows and repeat runs are safe', function () use ($db): void {
    for ($i = 0; $i < 650; $i++) { nonce_test_insert('bulk-' . $i, time() - 7200); }
    $first = karen_nonce_cleanup($db, true);
    refresh_test_equal(500, $first['deleted'], 'Per-run row budget');
    refresh_test_equal(5, $first['batches'], 'Per-run batch budget');
    refresh_test_equal(true, $first['limit_reached'], 'No unbounded drain');
    refresh_test_equal(150, nonce_test_count(), 'Remaining backlog');
    refresh_test_equal(150, karen_nonce_cleanup($db, true)['deleted'], 'Next run continues');
    refresh_test_equal(0, karen_nonce_cleanup($db, true)['deleted'], 'Empty repeat is safe');
});
refresh_test_case('cleanup normalizes its session timezone before comparing TIMESTAMP', function () use ($db): void {
    nonce_test_insert('old-zone', time() - 1800);
    $live = nonce_test_insert('live-zone', time() + 600);
    $db->exec("SET time_zone = '+03:30'");
    $result = karen_nonce_cleanup($db, true);
    refresh_test_equal('+00:00', $db->query('SELECT @@session.time_zone')->fetchColumn(), 'Dedicated session uses UTC');
    refresh_test_equal(1, $result['deleted'], 'Old row removed in UTC');
    refresh_test_equal(1, nonce_test_count($live), 'Live TIMESTAMP preserved');
});
refresh_test_case('cleanup rejects caller-owned transaction without committing it', function () use ($db): void {
    nonce_test_insert('transaction', time() - 1800);
    $db->beginTransaction();
    try {
        nonce_test_error(fn() => karen_nonce_cleanup($db, true), 'autocommit_required');
        refresh_test_assert($db->inTransaction(), 'Caller still owns transaction');
    } finally { $db->rollBack(); }
    refresh_test_equal(1, nonce_test_count(), 'No delete in caller transaction');
});
refresh_test_case('cleanup rejects disabled autocommit', function () use ($db): void {
    nonce_test_insert('autocommit', time() - 1800);
    $db->setAttribute(PDO::ATTR_AUTOCOMMIT, false);
    try { nonce_test_error(fn() => karen_nonce_cleanup($db, true), 'autocommit_required'); }
    finally { $db->setAttribute(PDO::ATTR_AUTOCOMMIT, true); }
    refresh_test_equal(1, nonce_test_count(), 'No delete with disabled autocommit');
});
refresh_test_case('cleanup rejects a non-InnoDB nonce table', function () use ($db): void {
    $db->exec('RENAME TABLE device_refresh_nonces TO nonce_cleanup_engine_saved');
    try {
        $db->exec('CREATE TABLE device_refresh_nonces LIKE nonce_cleanup_engine_saved');
        $db->exec('ALTER TABLE device_refresh_nonces ENGINE = MyISAM');
        nonce_test_insert('wrong-engine', time() - 1800);
        nonce_test_error(fn() => karen_nonce_cleanup($db, true), 'nonce_schema_invalid');
        refresh_test_equal(1, nonce_test_count(), 'Nontransactional table is never cleaned');
    } finally {
        $db->exec('DROP TABLE IF EXISTS device_refresh_nonces');
        $db->exec('RENAME TABLE nonce_cleanup_engine_saved TO device_refresh_nonces');
    }
});
refresh_test_case('cleanup fails closed without the expiry index', function () use ($db): void {
    nonce_test_insert('missing-index', time() - 1800);
    $db->exec('ALTER TABLE device_refresh_nonces DROP INDEX idx_device_refresh_nonces_expires');
    try { nonce_test_error(fn() => karen_nonce_cleanup($db, true), 'nonce_schema_invalid'); }
    finally { $db->exec('ALTER TABLE device_refresh_nonces ADD INDEX idx_device_refresh_nonces_expires (expires_at)'); }
    refresh_test_equal(1, nonce_test_count(), 'No unindexed cleanup fallback');
});
refresh_test_case('cleanup rejects an invisible or ignored expiry index', function () use ($db, $version): void {
    nonce_test_insert('disabled-index', time() - 1800);
    $maria = str_contains($version, 'MariaDB');
    $db->exec('ALTER TABLE device_refresh_nonces ALTER INDEX idx_device_refresh_nonces_expires ' . ($maria ? 'IGNORED' : 'INVISIBLE'));
    try { nonce_test_error(fn() => karen_nonce_cleanup($db, true), 'nonce_schema_invalid'); }
    finally { $db->exec('ALTER TABLE device_refresh_nonces ALTER INDEX idx_device_refresh_nonces_expires ' . ($maria ? 'NOT IGNORED' : 'VISIBLE')); }
    refresh_test_equal(1, nonce_test_count(), 'Disabled index never falls back to an unbounded scan');
});
refresh_test_case('cleanup works with legacy emulated PDO prepares', function () use ($db): void {
    nonce_test_insert('emulated', time() - 1800);
    $live = nonce_test_insert('emulated-live', time() + 600);
    $db->setAttribute(PDO::ATTR_EMULATE_PREPARES, true);
    try { refresh_test_equal(1, karen_nonce_cleanup($db, true)['deleted'], 'Binary hash works with emulation'); }
    finally { $db->setAttribute(PDO::ATTR_EMULATE_PREPARES, false); }
    refresh_test_equal(1, nonce_test_count($live), 'Live row preserved');
});
refresh_test_case('cleanup rejects unexpected primary-key shape', function () use ($db): void {
    nonce_test_insert('primary', time() - 1800);
    $db->exec('ALTER TABLE device_refresh_nonces DROP PRIMARY KEY, ADD PRIMARY KEY (nonce_hash, device_id)');
    try { nonce_test_error(fn() => karen_nonce_cleanup($db, true), 'nonce_schema_invalid'); }
    finally { $db->exec('ALTER TABLE device_refresh_nonces DROP PRIMARY KEY, ADD PRIMARY KEY (nonce_hash)'); }
    refresh_test_equal(1, nonce_test_count(), 'Unexpected schema cannot delete');
});
refresh_test_case('cleanup validates binary hash length before deleting a batch', function () use ($db): void {
    $stmt = $db->prepare('INSERT INTO device_refresh_nonces (nonce_hash, device_id, expires_at) VALUES (?, 1, ?)');
    $stmt->execute(['bad', gmdate('Y-m-d H:i:s', time() - 1800)]);
    nonce_test_insert('valid-alongside-invalid', time() - 1800);
    nonce_test_error(fn() => karen_nonce_cleanup($db, true), 'nonce_data_invalid');
    refresh_test_equal(2, nonce_test_count(), 'Whole batch validated first');
});
refresh_test_case('cleanup rechecks expiry if an old selected hash is replaced by a live row', function () use ($db, $options, $password): void {
    $hash = nonce_test_insert('replaced', time() - 1800);
    $cutoff = karen_nonce_cleanup_cutoff($db);
    $selected = karen_nonce_cleanup_candidates($db, $cutoff);
    $other = new PDO((string) getenv('KAREN_LICENSE_TEST_DSN'), 'root', $password, $options);
    $other->exec("SET time_zone = '+00:00'");
    $stmt = $other->prepare('DELETE FROM device_refresh_nonces WHERE nonce_hash = ?');
    $stmt->execute([$hash]);
    $stmt = $other->prepare('INSERT INTO device_refresh_nonces (nonce_hash, device_id, expires_at) VALUES (?, 1, ?)');
    $stmt->execute([$hash, gmdate('Y-m-d H:i:s', time() + 600)]);
    refresh_test_equal(0, karen_nonce_cleanup_delete($db, $cutoff, $selected), 'Fresh replacement cannot be deleted');
    refresh_test_equal(1, nonce_test_count($hash), 'Replacement remains');
});
refresh_test_case('cleanup does not need license/device locks or modify license metadata', function () use ($db, $options, $password): void {
    nonce_test_insert('held-device', time() - 1800);
    $other = new PDO((string) getenv('KAREN_LICENSE_TEST_DSN'), 'root', $password, $options);
    $other->beginTransaction();
    try {
        $other->query('SELECT id, status FROM licenses WHERE id = 1 FOR UPDATE')->fetch();
        $other->query('SELECT id, status FROM license_devices WHERE id = 1 FOR UPDATE')->fetch();
        refresh_test_equal(1, karen_nonce_cleanup($db, true)['deleted'], 'Cleanup succeeds while parent rows are locked');
    } finally { $other->rollBack(); }
    refresh_test_effects(0, 0, 0);
    refresh_test_equal(2, (int) $db->query('SELECT COUNT(*) FROM licenses')->fetchColumn(), 'Licenses untouched');
    refresh_test_equal(3, (int) $db->query('SELECT COUNT(*) FROM license_devices')->fetchColumn(), 'Devices untouched');
});
refresh_test_case('cleanup preserves a live replay guard used by the real endpoint', function () use ($db, $devices): void {
    $input = refresh_test_input();
    $hash = hash('sha256', $devices[1]['key_id'] . '|' . $input['nonce'], true);
    $stmt = $db->prepare('INSERT INTO device_refresh_nonces (nonce_hash, device_id, expires_at) VALUES (?, 1, ?)');
    $stmt->execute([$hash, gmdate('Y-m-d H:i:s', time() + 600)]);
    nonce_test_insert('other-expired', time() - 1800, 2);
    refresh_test_equal(1, karen_nonce_cleanup($db, true)['deleted'], 'Only old record removed');
    refresh_test_response(refresh_test_request($input), 409, 'replay_detected');
    refresh_test_effects(1, 0, 0);
});
refresh_test_case('deleting an old nonce cannot revive its out-of-window signed request', function () use ($db, $devices): void {
    $input = refresh_test_input(1, ['timestamp' => time() - 1300]);
    $hash = hash('sha256', $devices[1]['key_id'] . '|' . $input['nonce'], true);
    $stmt = $db->prepare('INSERT INTO device_refresh_nonces (nonce_hash, device_id, expires_at) VALUES (?, 1, ?)');
    $stmt->execute([$hash, gmdate('Y-m-d H:i:s', time() - 700)]);
    refresh_test_equal(1, karen_nonce_cleanup($db, true)['deleted'], 'Old record eligible');
    refresh_test_response(refresh_test_request($input), 400, 'invalid_timestamp');
    refresh_test_effects(0, 0, 0);
});
refresh_test_case('cleanup CLI requires an explicit mode before loading bootstrap', function (): void {
    nonce_test_clear_markers();
    foreach ([[], ['--unknown'], ['--run', '--check']] as $args) {
        $process = nonce_test_cli($args);
        refresh_test_equal(64, $process['exit'], 'Invalid argument exit');
        refresh_test_equal('usage', $process['result']['error'], 'Invalid argument code');
    }
    global $scratch;
    refresh_test_assert(!is_file($scratch . '/cleanup-bootstrap-hit'), 'No bootstrap for bad arguments');
});
refresh_test_case('cleanup CLI rejects the wrong private path before bootstrap', function () use ($scratch): void {
    nonce_test_clear_markers();
    $process = nonce_test_cli(['--run'], [], 'wrong-cleanup.php');
    refresh_test_equal(1, $process['exit'], 'Wrong-path exit');
    refresh_test_equal('wrong_private_path', $process['result']['error'], 'Wrong-path code');
    refresh_test_assert(!is_file($scratch . '/cleanup-bootstrap-hit'), 'Wrong path does not load host config');
});
refresh_test_case('cleanup CLI check writes only a private bounded status file', function () use ($scratch): void {
    nonce_test_insert('cli-check', time() - 1800);
    $process = nonce_test_cli(['--check']);
    refresh_test_equal(0, $process['exit'], 'Check exit');
    refresh_test_equal(true, $process['result']['ok'], 'Check succeeds');
    refresh_test_equal('check', $process['result']['mode'], 'Check marker is not run');
    refresh_test_equal(0, $process['result']['deleted'], 'CLI check is not destructive');
    refresh_test_equal($process['result'], nonce_test_status(), 'Atomic result matches CLI');
    refresh_test_equal(0600, fileperms($scratch . '/refresh-nonce-cleanup-status.json') & 0777, 'Private status permissions');
    refresh_test_equal(0600, fileperms($scratch . '/refresh-nonce-cleanup.lock') & 0777, 'Private lock permissions');
    refresh_test_equal(1, nonce_test_count(), 'Check preserves old row');
});
refresh_test_case('cleanup CLI run records successful bounded deletion', function (): void {
    nonce_test_insert('cli-run', time() - 1800);
    $live = nonce_test_insert('cli-live', time() + 600);
    $process = nonce_test_cli(['--run']);
    refresh_test_equal(0, $process['exit'], 'Run exit');
    refresh_test_equal(true, $process['result']['ok'], 'Run succeeds');
    refresh_test_equal('run', $process['result']['mode'], 'Run mode');
    refresh_test_equal(1, $process['result']['deleted'], 'Run deletion count');
    refresh_test_equal($process['result'], nonce_test_status(), 'Run status recorded');
    refresh_test_equal(1, nonce_test_count($live), 'Run preserves live row');
});
refresh_test_case('cleanup CLI refuses a non-staging bootstrap before database access', function () use ($scratch): void {
    nonce_test_clear_markers();
    $process = nonce_test_cli(['--run'], ['KAREN_CLEANUP_TEST_ENV' => 'production']);
    refresh_test_equal(1, $process['exit'], 'Environment exit');
    refresh_test_equal('wrong_environment', $process['result']['error'], 'Environment guard');
    refresh_test_assert(!is_file($scratch . '/cleanup-database-hit'), 'Environment checked before karen_db');
});
refresh_test_case('cleanup CLI reports database errors without secrets and permits safe later retry', function (): void {
    nonce_test_insert('retry', time() - 1800);
    $process = nonce_test_cli(['--run'], ['KAREN_CLEANUP_TEST_FAIL' => '1']);
    refresh_test_equal(1, $process['exit'], 'Failure exit');
    refresh_test_equal('database_error', $process['result']['error'], 'Sanitized code');
    refresh_test_equal(1205, $process['result']['database_error_code'], 'Safe numeric diagnostic');
    refresh_test_assert(!str_contains($process['raw'], 'SECRET_TEST_CREDENTIAL'), 'No raw PDO details');
    refresh_test_equal(false, nonce_test_status()['ok'], 'Failure replaces stale success marker');
    refresh_test_equal(1, nonce_test_count(), 'Failed connection cannot delete');
    refresh_test_equal(0, nonce_test_cli(['--run'])['exit'], 'Lock released for retry');
    refresh_test_equal(0, nonce_test_count(), 'Retry is safe');
});
refresh_test_case('cleanup CLI reports partially committed batches after a real row-lock timeout', function () use ($db, $options, $password): void {
    $expiry = time() - 1800;
    for ($i = 0; $i < 101; $i++) { nonce_test_insert('partial-' . $i, $expiry + $i); }
    $live = nonce_test_insert('partial-live', time() + 600);
    $lockedHash = $db->query('SELECT nonce_hash FROM device_refresh_nonces ORDER BY expires_at, nonce_hash LIMIT 1 OFFSET 100')->fetchColumn();
    $other = new PDO((string) getenv('KAREN_LICENSE_TEST_DSN'), 'root', $password, $options);
    $other->beginTransaction();
    try {
        $stmt = $other->prepare('SELECT nonce_hash FROM device_refresh_nonces WHERE nonce_hash = ? FOR UPDATE');
        $stmt->execute([$lockedHash]);
        $stmt->fetch();
        $process = nonce_test_cli(['--run']);
        refresh_test_equal(1, $process['exit'], 'Real timeout is reported');
        refresh_test_equal(1205, $process['result']['database_error_code'], 'Bounded row-lock wait');
        refresh_test_equal(true, $process['result']['partial_cleanup_possible'], 'No false all-or-nothing rollback claim');
        refresh_test_equal(false, nonce_test_status()['ok'], 'Partial failure recorded');
        refresh_test_equal(2, nonce_test_count(), 'First batch committed, locked expired row and live row remain');
        refresh_test_equal(1, nonce_test_count($live), 'Live row remains after partial failure');
    } finally { $other->rollBack(); }
    refresh_test_equal(1, nonce_test_cli(['--run'])['result']['deleted'], 'Later invocation continues safely');
    refresh_test_equal(1, nonce_test_count($live), 'Retry still preserves live row');
});
refresh_test_case('cleanup CLI missing bootstrap fails without deleting rows', function () use ($scratch): void {
    nonce_test_insert('missing-bootstrap', time() - 1800);
    rename($scratch . '/bootstrap.php', $scratch . '/bootstrap.saved');
    try {
        $process = nonce_test_cli(['--run']);
        refresh_test_equal(1, $process['exit'], 'Missing bootstrap exit');
        refresh_test_equal('bootstrap_missing', $process['result']['error'], 'Missing bootstrap code');
        refresh_test_equal(false, $process['result']['partial_cleanup_possible'], 'Cleanup never started');
        refresh_test_equal(1, nonce_test_count(), 'No deletion');
    } finally { rename($scratch . '/bootstrap.saved', $scratch . '/bootstrap.php'); }
});
refresh_test_case('cleanup lock skips concurrent invocation without overwriting owner status', function () use ($scratch): void {
    nonce_test_clear_markers();
    $before = (string) file_get_contents($scratch . '/refresh-nonce-cleanup-status.json');
    $lock = fopen($scratch . '/refresh-nonce-cleanup.lock', 'c');
    flock($lock, LOCK_EX);
    try {
        $process = nonce_test_cli(['--run']);
        refresh_test_equal(0, $process['exit'], 'Busy is a skipped invocation');
        refresh_test_equal(true, $process['result']['skipped_busy'], 'Busy is not a completed cleanup');
        refresh_test_equal($before, file_get_contents($scratch . '/refresh-nonce-cleanup-status.json'), 'Owner status untouched');
        refresh_test_assert(!is_file($scratch . '/cleanup-bootstrap-hit'), 'Busy does not open database');
    } finally { flock($lock, LOCK_UN); fclose($lock); }
});
refresh_test_case('cleanup lock symlink fails before bootstrap', function () use ($scratch): void {
    $lock = $scratch . '/refresh-nonce-cleanup.lock';
    $outside = $scratch . '/not-lock.txt';
    file_put_contents($outside, 'KEEP');
    unlink($lock);
    symlink($outside, $lock);
    try {
        nonce_test_clear_markers();
        $process = nonce_test_cli(['--run']);
        refresh_test_equal(1, $process['exit'], 'Unsafe lock exit');
        refresh_test_equal('cleanup_storage_unavailable', $process['result']['error'], 'Unsafe lock code');
        refresh_test_equal('KEEP', file_get_contents($outside), 'Lock symlink target unchanged');
        refresh_test_assert(!is_file($scratch . '/cleanup-bootstrap-hit'), 'Unsafe lock never opens bootstrap');
    } finally { unlink($lock); }
});
refresh_test_case('cleanup status symlink cannot overwrite another file', function () use ($scratch): void {
    $target = $scratch . '/refresh-nonce-cleanup-status.json';
    $outside = $scratch . '/not-status.txt';
    file_put_contents($outside, 'KEEP');
    unlink($target);
    symlink($outside, $target);
    try {
        nonce_test_clear_markers();
        $process = nonce_test_cli(['--run']);
        refresh_test_equal(1, $process['exit'], 'Unsafe storage fails');
        refresh_test_equal('cleanup_storage_unavailable', $process['result']['error'], 'Storage guard');
        refresh_test_equal('KEEP', file_get_contents($outside), 'Symlink target unchanged');
        refresh_test_assert(!is_file($scratch . '/cleanup-bootstrap-hit'), 'Storage checked before DB');
    } finally { unlink($target); }
});
refresh_test_case('cleanup rejects HTTP before loading the private bootstrap', function () use ($scratch): void {
    nonce_test_clear_markers();
    $socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
    refresh_test_assert(is_resource($socket), 'Reserve test HTTP port');
    $address = stream_socket_get_name($socket, false);
    fclose($socket);
    $server = proc_open([PHP_BINARY, '-S', $address, '-t', $scratch], [
        0 => ['pipe', 'r'], 1 => ['file', $scratch . '/http.out', 'w'], 2 => ['file', $scratch . '/http.err', 'w'],
    ], $pipes);
    refresh_test_assert(is_resource($server), 'Start temporary PHP HTTP test');
    fclose($pipes[0]);
    try {
        $deadline = microtime(true) + 5;
        $headers = [];
        do {
            $context = stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 1]]);
            $body = @file_get_contents('http://' . $address . '/cleanup-refresh-nonces.php', false, $context);
            $headers = $http_response_header ?? [];
            if ($body !== false) { break; }
            usleep(20000);
        } while (microtime(true) < $deadline);
        refresh_test_assert(isset($headers[0]) && str_contains($headers[0], '404'), 'HTTP returns 404');
        refresh_test_equal('', $body, 'No HTTP data disclosure');
        refresh_test_assert(!is_file($scratch . '/cleanup-bootstrap-hit'), 'HTTP never loads private bootstrap');
    } finally { proc_terminate($server); proc_close($server); }
});
