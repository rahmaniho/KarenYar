<?php
declare(strict_types=1);

/**
 * Isolated MySQL/MariaDB regression tests for the real refresh endpoint SQL.
 * Requires PHP CLI + pdo_mysql + sodium + proc_open; never run/upload on cPanel.
 * The only substituted endpoint line is its private host-bootstrap require.
 * HTTP/auth/rate-limit middleware is a test double, NOT a test of the host bootstrap.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (getenv('KAREN_LICENSE_DB_TESTS') !== '1') {
    throw new RuntimeException('Set KAREN_LICENSE_DB_TESTS=1 for an explicitly disposable local database server.');
}
if (($argv[1] ?? '') === '--worker') {
    $GLOBALS['karen_test_request'] = json_decode((string) file_get_contents($argv[2]), true, 512, JSON_THROW_ON_ERROR);
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SERVER['HTTP_USER_AGENT'] = 'isolated-refresh-test';
    require $argv[3];
    exit;
}
set_exception_handler(static function (Throwable $error): never {
    $message = $error->getMessage();
    fwrite(STDERR, (string) $error . "\n");
    if (getenv('GITHUB_ACTIONS') === 'true') {
        $escape = static fn(string $text): string => str_replace(['%', "\r", "\n"], ['%25', '%0D', '%0A'], $text);
        echo '::error title=Refresh transaction regression::' . $escape($message) . "\n";
        echo '::notice title=Completed transaction cases::' . $escape(implode('; ', $GLOBALS['passed'] ?? [])) . "\n";
    }
    exit(1);
});
if (!extension_loaded('pdo_mysql') || !extension_loaded('sodium') || !function_exists('proc_open')) {
    throw new RuntimeException('Tests require PHP pdo_mysql, sodium and proc_open.');
}

$repo = dirname(__DIR__);
$port = filter_var(getenv('KAREN_LICENSE_TEST_PORT'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
$password = getenv('KAREN_LICENSE_TEST_PASSWORD');
if ($port === false || $password === false || $password === '') { throw new RuntimeException('Explicit test port/password required.'); }
// Host is deliberately not configurable; never accept a staging/production DSN.
$serverDsn = 'mysql:host=127.0.0.1;port=' . $port . ';charset=utf8mb4';
$options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false];
$server = new PDO($serverDsn, 'root', $password, $options);
$version = (string) $server->query('SELECT VERSION()')->fetchColumn();
$database = 'karen_test_refresh_' . bin2hex(random_bytes(8));
$scratch = sys_get_temp_dir() . '/' . $database;
$endpoint = $scratch . '/refresh.php';
$db = null;
$children = [];
$passed = [];
$devices = [];

function refresh_test_assert(bool $value, string $message): void
{
    if (!$value) { throw new RuntimeException($message); }
}
function refresh_test_equal(mixed $expected, mixed $actual, string $message): void
{
    refresh_test_assert($expected === $actual, $message . ': expected ' . json_encode($expected) . ', got ' . json_encode($actual));
}
function refresh_test_case(string $name, callable $call): void
{
    global $passed;
    refresh_test_reset();
    $call();
    $passed[] = $name;
    echo 'PASS ' . $name . "\n";
}
function refresh_test_reset(): void
{
    global $db, $children, $devices;
    refresh_test_equal(0, count($children), 'Previous workers must finish before resetting fixtures');
    foreach (['license_events', 'device_refresh_nonces', 'license_devices', 'licenses', 'customers', 'products'] as $table) {
        $db->exec('DELETE FROM ' . $table);
    }
    $db->exec("INSERT INTO products (id, code, status) VALUES (1, 'hesabyar', 'active')");
    $db->exec("INSERT INTO customers (id, reference_code, status) VALUES (1, 'TEST-CUSTOMER-A', 'active'), (2, 'TEST-CUSTOMER-B', 'active')");
    $db->exec("INSERT INTO licenses (id, public_id, product_id, customer_id, plan, max_devices, status, expires_at)
        VALUES (1, 'test-license-A', 1, 1, 'pro', 2, 'active', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY)),
               (2, 'test-license-B', 1, 2, 'proplus', 3, 'active', NULL)");
    foreach ([1 => 1, 2 => 1, 3 => 2] as $id => $licenseId) {
        $pair = sodium_crypto_sign_seed_keypair(hash('sha256', 'public-device-test-seed-' . $id, true));
        $public = sodium_crypto_sign_publickey($pair);
        $devices[$id] = [
            'key_id' => '11111111-1111-4111-8111-' . str_pad((string) $id, 12, '0', STR_PAD_LEFT),
            'secret' => sodium_crypto_sign_secretkey($pair),
        ];
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode(hex2bin('302a300506032b6570032100') . $public), 64, "\n") . "-----END PUBLIC KEY-----\n";
        $stmt = $db->prepare("INSERT INTO license_devices (id, license_id, device_key_id, device_label, public_key_pem, status, activated_at, last_seen_at)
            VALUES (?, ?, ?, 'Test device', ?, 'active', UTC_TIMESTAMP(), '2000-01-01 00:00:00')");
        $stmt->execute([$id, $licenseId, $devices[$id]['key_id'], $pem]);
    }
}
function refresh_test_input(int $deviceId = 1, array $overrides = [], bool $legacy = false): array
{
    global $devices;
    $input = array_replace([
        'device_key_id' => $devices[$deviceId]['key_id'],
        'product_code' => 'hesabyar',
        'timestamp' => time(),
        'nonce' => bin2hex(random_bytes(24)),
    ], $overrides);
    $message = implode("\n", ['karen-license-refresh-v1', $input['product_code'], $input['device_key_id'], (string) $input['timestamp'], $input['nonce']]);
    $signature = sodium_crypto_sign_detached($message, $devices[$deviceId]['secret']);
    $input['signature_b64'] = $legacy ? base64_encode($signature) : rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');
    return $input;
}
function refresh_test_start(array $input, array $controls = []): array
{
    global $scratch, $endpoint, $children;
    $base = $scratch . '/request-' . bin2hex(random_bytes(8));
    $request = array_replace(['input' => $input, 'trace' => $base . '.trace', 'release' => $base . '.release'], $controls);
    file_put_contents($base . '.json', json_encode($request, JSON_THROW_ON_ERROR));
    $process = proc_open([PHP_BINARY, __FILE__, '--worker', $base . '.json', $endpoint], [
        0 => ['pipe', 'r'], 1 => ['file', $base . '.out', 'w'], 2 => ['file', $base . '.err', 'w'],
    ], $pipes);
    refresh_test_assert(is_resource($process), 'Start PHP worker');
    fclose($pipes[0]);
    $worker = ['process' => $process, 'base' => $base, 'trace' => $request['trace'], 'release' => $request['release']];
    $children[$base] = $worker;
    return $worker;
}
function refresh_test_trace(array $worker): array
{
    if (!is_file($worker['trace'])) { return []; }
    $handle = fopen($worker['trace'], 'r');
    if ($handle === false) { throw new RuntimeException('Cannot read worker trace'); }
    flock($handle, LOCK_SH);
    $text = (string) stream_get_contents($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    $lines = array_filter(explode("\n", trim($text)), static fn(string $line): bool => $line !== '');
    return array_values(array_map(static fn(string $line): array => json_decode($line, true, 512, JSON_THROW_ON_ERROR), $lines));
}
function refresh_test_wait(array $worker, string $phase, string $kind): void
{
    $deadline = microtime(true) + 10;
    do {
        foreach (refresh_test_trace($worker) as $entry) {
            if ($entry['phase'] === $phase && $entry['kind'] === $kind) { return; }
        }
        if (!proc_get_status($worker['process'])['running']) { break; }
        usleep(10000);
    } while (microtime(true) < $deadline);
    throw new RuntimeException('Worker did not reach ' . $phase . '/' . $kind . ': ' . json_encode(refresh_test_trace($worker)) . ' ' . @file_get_contents($worker['base'] . '.err'));
}
function refresh_test_wait_for_lock(array $worker): void
{
    global $server;
    $connections = array_values(array_filter(refresh_test_trace($worker), static fn(array $entry): bool => $entry['kind'] === 'connect'));
    $connectionId = (int) ($connections[0]['connection_id'] ?? 0);
    refresh_test_assert($connectionId > 0, 'Worker connection ID must be known');
    $deadline = microtime(true) + 10;
    $active = '';
    do {
        // INNODB_TRX can retain the previous worker's cached row across fast tests.
        // Inspect the live engine dump instead, matching this worker's thread only.
        $status = (string) $server->query('SHOW ENGINE INNODB STATUS')->fetch()['Status'];
        $active = strstr($status, "\nTRANSACTIONS\n") ?: '';
        foreach (explode('---TRANSACTION', $active) as $transaction) {
            if (preg_match('/(?:MySQL|MariaDB) thread id ' . $connectionId . ',/', $transaction) === 1 && str_contains($transaction, 'LOCK WAIT')) { return; }
        }
        if (!proc_get_status($worker['process'])['running']) { break; }
        usleep(20000);
    } while (microtime(true) < $deadline);
    throw new RuntimeException('InnoDB did not observe the refresh worker waiting for the held license lock: ' . json_encode([
        'connection' => $connectionId,
        'engine_transactions' => $active,
        'trace' => refresh_test_trace($worker),
        'output' => @file_get_contents($worker['base'] . '.out'),
        'errors' => @file_get_contents($worker['base'] . '.err'),
    ], JSON_THROW_ON_ERROR));
}
function refresh_test_finish(array $worker): array
{
    global $children;
    $deadline = microtime(true) + 20;
    do {
        $state = proc_get_status($worker['process']);
        if (!$state['running']) { break; }
        if (microtime(true) > $deadline) { throw new RuntimeException('Worker completion timeout'); }
        usleep(10000);
    } while (true);
    $closed = proc_close($worker['process']);
    unset($children[$worker['base']]);
    $output = (string) file_get_contents($worker['base'] . '.out');
    $errors = (string) file_get_contents($worker['base'] . '.err');
    refresh_test_equal(0, $state['exitcode'] >= 0 ? $state['exitcode'] : $closed, 'Worker exit: ' . $errors);
    $response = json_decode($output, true, 512, JSON_THROW_ON_ERROR);
    $response['test_stderr'] = $errors;
    return $response;
}
function refresh_test_request(array $input, array $controls = []): array
{
    return refresh_test_finish(refresh_test_start($input, $controls));
}
function refresh_test_response(array $response, int $status, ?string $error = null): void
{
    refresh_test_equal($status, $response['status'], 'Endpoint status: ' . json_encode($response));
    refresh_test_equal($status === 200, $response['body']['ok'], 'Endpoint ok');
    if ($error !== null) { refresh_test_equal($error, $response['body']['error'], 'Endpoint error contract'); }
}
function refresh_test_effects(int $nonces, int $events, int $seen): void
{
    global $db;
    refresh_test_equal($nonces, (int) $db->query('SELECT COUNT(*) FROM device_refresh_nonces')->fetchColumn(), 'Nonce rows');
    refresh_test_equal($events, (int) $db->query('SELECT COUNT(*) FROM license_events')->fetchColumn(), 'Event rows');
    refresh_test_equal($seen, (int) $db->query("SELECT COUNT(*) FROM license_devices WHERE last_seen_at <> '2000-01-01 00:00:00'")->fetchColumn(), 'Updated devices');
}
function refresh_test_claims(array $response): array
{
    refresh_test_response($response, 200);
    $body = $response['body'];
    refresh_test_equal(['ok', 'environment', 'token_type', 'token', 'kid', 'issuer_public_key_b64', 'license'], array_keys($body), 'Response shape');
    refresh_test_equal('Bearer', $body['token_type'], 'Token type');
    $parts = explode('.', $body['token']);
    refresh_test_equal(4, count($parts), 'HY2 token parts');
    refresh_test_equal('HY2', $parts[0], 'Token prefix');
    $decode = static fn(string $text): string => (string) base64_decode(strtr($text, '-_', '+/'), true);
    refresh_test_assert(sodium_crypto_sign_verify_detached($decode($parts[3]), $parts[1] . '.' . $parts[2], (string) base64_decode($body['issuer_public_key_b64'], true)), 'Real fixture issuer signature');
    $claims = json_decode($decode($parts[2]), true, 512, JSON_THROW_ON_ERROR);
    refresh_test_equal('karen-license-test', $claims['iss'], 'Issuer passed to signer');
    refresh_test_equal('hesabyar-app', $claims['aud'], 'Audience passed to signer');
    refresh_test_equal('staging', $claims['env'], 'Environment passed to signer');
    refresh_test_equal('hesabyar', $claims['product'], 'Product passed to signer');
    refresh_test_equal($claims['iat'], $claims['nbf'], 'nbf contract');
    return $claims;
}
function refresh_test_remove(string $path): void
{
    if (!is_dir($path)) { return; }
    foreach (new DirectoryIterator($path) as $entry) {
        if (!$entry->isDot()) { unlink($entry->getPathname()); }
    }
    rmdir($path);
}

try {
    $server->exec('CREATE DATABASE `' . $database . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    putenv('KAREN_LICENSE_TEST_DSN=' . $serverDsn . ';dbname=' . $database);
    $db = new PDO((string) getenv('KAREN_LICENSE_TEST_DSN'), 'root', $password, $options);
    $db->exec("SET time_zone = '+00:00'");
    $db->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $ddl = [
        'CREATE TABLE schema_migrations (version VARCHAR(64) PRIMARY KEY) ENGINE=InnoDB',
        'CREATE TABLE products (id INT UNSIGNED PRIMARY KEY, code VARCHAR(64) UNIQUE NOT NULL, status VARCHAR(20) NOT NULL) ENGINE=InnoDB',
        'CREATE TABLE customers (id INT UNSIGNED PRIMARY KEY, reference_code VARCHAR(64) UNIQUE NOT NULL, status VARCHAR(20) NOT NULL) ENGINE=InnoDB',
        'CREATE TABLE licenses (id INT UNSIGNED PRIMARY KEY, public_id VARCHAR(64) UNIQUE NOT NULL, product_id INT UNSIGNED NOT NULL, customer_id INT UNSIGNED NOT NULL,
            plan VARCHAR(20) NOT NULL, max_devices INT NOT NULL, status VARCHAR(20) NOT NULL, expires_at TIMESTAMP NULL,
            FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (customer_id) REFERENCES customers(id)) ENGINE=InnoDB',
        'CREATE TABLE license_devices (id INT UNSIGNED PRIMARY KEY, license_id INT UNSIGNED NOT NULL, device_key_id CHAR(36) UNIQUE NOT NULL,
            device_label VARCHAR(190) NOT NULL, public_key_pem TEXT NOT NULL, status VARCHAR(20) NOT NULL, activated_at TIMESTAMP NULL, last_seen_at TIMESTAMP NULL,
            KEY license_status (license_id, status), FOREIGN KEY (license_id) REFERENCES licenses(id)) ENGINE=InnoDB',
        'CREATE TABLE license_events (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, license_id INT UNSIGNED NOT NULL, device_id INT UNSIGNED NOT NULL,
            event_type VARCHAR(64) NOT NULL, ip_hash VARBINARY(32) NOT NULL, user_agent VARCHAR(255) NOT NULL, meta JSON NOT NULL,
            FOREIGN KEY (license_id) REFERENCES licenses(id), FOREIGN KEY (device_id) REFERENCES license_devices(id)) ENGINE=InnoDB',
    ];
    foreach ($ddl as $sql) { $db->exec($sql); }
    // Use the actual nonce migration, not an imitation of its keys/expiry types.
    foreach (explode(';', (string) file_get_contents($repo . '/deploy/cpanel-staging/sql/002_refresh_nonces.sql')) as $sql) {
        if (trim($sql) !== '') { $db->exec($sql); }
    }
    mkdir($scratch, 0700);
    $source = (string) file_get_contents($repo . '/deploy/cpanel-staging/v1/refresh.php');
    $source = str_replace("require '/home/karensof/private/karen-staging/bootstrap.php';", "require __DIR__ . '/test-bootstrap.php';", $source, $replaced);
    refresh_test_equal(1, $replaced, 'Only host bootstrap location is substituted');
    file_put_contents($endpoint, $source);
    copy($repo . '/deploy/cpanel-staging/v1/license-encoding.php', $scratch . '/license-encoding.php');
    copy($repo . '/scripts/fixtures/license-refresh-bootstrap.php', $scratch . '/test-bootstrap.php');

    refresh_test_case('base64url refresh, unchanged claims and explicit lock order', function (): void {
        $worker = refresh_test_start(refresh_test_input());
        $claims = refresh_test_claims(refresh_test_finish($worker));
        refresh_test_equal(1, $claims['device_id'], 'Device ID is not license metadata');
        refresh_test_equal('test-license-A', $claims['jti'], 'License public ID');
        refresh_test_equal('TEST-CUSTOMER-A', $claims['sub'], 'Customer reference');
        refresh_test_equal('pro', $claims['plan'], 'Plan');
        refresh_test_equal(2, $claims['max_devices'], 'Device cap claim');
        refresh_test_equal(['backup', 'pdf-export', 'unlimited-products', 'unlimited-transactions'], $claims['features'], 'Feature contract');
        refresh_test_equal(7 * 86400, $claims['exp'] - $claims['iat'], 'Seven-day token contract');
        $trace = refresh_test_trace($worker);
        $reads = array_values(array_filter($trace, static fn(array $entry): bool => $entry['phase'] === 'before' && str_starts_with((string) $entry['sql'], 'SELECT')));
        refresh_test_equal(['locator', 'license', 'account', 'device'], array_column($reads, 'kind'), 'Read order');
        refresh_test_equal([false, true, true, true], array_column($reads, 'transaction'), 'Locator must be outside the transaction');
        refresh_test_assert(!str_contains($reads[1]['sql'], 'JOIN'), 'First locking read must be a single-table license primary-key lookup');
        refresh_test_assert(str_contains($reads[1]['sql'], 'FOR UPDATE') && str_contains($reads[3]['sql'], 'FOR UPDATE'), 'Separate locking reads');
        refresh_test_effects(1, 1, 1);
    });
    refresh_test_case('legacy standard-base64 signature remains valid', function (): void {
        refresh_test_claims(refresh_test_request(refresh_test_input(1, [], true)));
        refresh_test_effects(1, 1, 1);
    });
    refresh_test_case('device/license IDs remain distinct and perpetual license works', function (): void {
        $response = refresh_test_request(refresh_test_input(3));
        $claims = refresh_test_claims($response);
        refresh_test_equal(3, $claims['device_id'], 'Device ID must not become license ID 2');
        refresh_test_equal('test-license-B', $claims['jti'], 'Correct license');
        refresh_test_equal('TEST-CUSTOMER-B', $claims['sub'], 'Correct customer');
        refresh_test_equal(null, $response['body']['license']['license_expires_at'], 'Perpetual expiry');
    });
    refresh_test_case('token expiry remains capped by the license', function () use ($db): void {
        $db->exec('UPDATE licenses SET expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY) WHERE id = 1');
        $expiry = (int) $db->query('SELECT UNIX_TIMESTAMP(expires_at) FROM licenses WHERE id = 1')->fetchColumn();
        $claims = refresh_test_claims(refresh_test_request(refresh_test_input()));
        refresh_test_equal($expiry, $claims['exp'], 'License expiry cap');
    });
    refresh_test_case('unknown device does not start a transaction', function (): void {
        $worker = refresh_test_start(refresh_test_input(1, ['device_key_id' => '99999999-9999-4999-8999-999999999999']));
        refresh_test_response(refresh_test_finish($worker), 404, 'device_or_license_invalid');
        refresh_test_assert(!in_array('begin', array_column(refresh_test_trace($worker), 'kind'), true), 'No transaction for missing locator');
        refresh_test_effects(0, 0, 0);
    });
    foreach ([
        'revoked device' => "UPDATE license_devices SET status = 'revoked' WHERE id = 1",
        'revoked license' => "UPDATE licenses SET status = 'revoked' WHERE id = 1",
        'inactive product' => "UPDATE products SET status = 'inactive' WHERE id = 1",
        'inactive customer' => "UPDATE customers SET status = 'inactive' WHERE id = 1",
        'expired license' => 'UPDATE licenses SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) WHERE id = 1',
    ] as $name => $sql) {
        refresh_test_case($name . ' keeps the existing 404 contract', function () use ($db, $sql): void {
            $db->exec($sql);
            refresh_test_response(refresh_test_request(refresh_test_input()), 404, 'device_or_license_invalid');
            refresh_test_effects(0, 0, 0);
        });
    }
    refresh_test_case('product mismatch keeps the existing 400 contract', function (): void {
        refresh_test_response(refresh_test_request(refresh_test_input(1, ['product_code' => 'other'])), 400, 'product_mismatch');
        refresh_test_effects(0, 0, 0);
    });
    refresh_test_case('bad Ed25519 signature rolls back without writes', function (): void {
        $input = refresh_test_input();
        $raw = (string) base64_decode(strtr($input['signature_b64'], '-_', '+/'), true);
        $raw[0] = chr(ord($raw[0]) ^ 1);
        $input['signature_b64'] = base64_encode($raw);
        refresh_test_response(refresh_test_request($input), 401, 'invalid_device_signature');
        refresh_test_effects(0, 0, 0);
    });
    foreach ([-3600, 3600] as $offset) {
        refresh_test_case('out-of-window timestamp ' . $offset . ' is rejected before writes', function () use ($offset): void {
            refresh_test_response(refresh_test_request(refresh_test_input(1, ['timestamp' => time() + $offset])), 400, 'invalid_timestamp');
            refresh_test_effects(0, 0, 0);
        });
    }
    refresh_test_case('sequential nonce replay keeps the existing 409 contract', function (): void {
        $input = refresh_test_input();
        refresh_test_response(refresh_test_request($input), 200);
        refresh_test_response(refresh_test_request($input), 409, 'replay_detected');
        refresh_test_effects(1, 1, 1);
    });
    refresh_test_case('simultaneous identical signed nonce has exactly one winner', function (): void {
        $input = refresh_test_input();
        $workers = [refresh_test_start($input), refresh_test_start($input)];
        $responses = array_map('refresh_test_finish', $workers);
        $statuses = array_column($responses, 'status');
        sort($statuses);
        refresh_test_equal([200, 409], $statuses, 'Concurrent replay status');
        foreach ($responses as $response) {
            refresh_test_response($response, $response['status'], $response['status'] === 409 ? 'replay_detected' : null);
        }
        refresh_test_effects(1, 1, 1);
    });
    refresh_test_case('twelve simultaneous refreshes serialize without lost writes', function (): void {
        $workers = [];
        for ($i = 0; $i < 12; $i++) { $workers[] = refresh_test_start(refresh_test_input(1 + $i % 2)); }
        foreach ($workers as $worker) { refresh_test_response(refresh_test_finish($worker), 200); }
        refresh_test_effects(12, 12, 2);
    });
    refresh_test_case('refresh waits on license without holding device; committed plan is fresh', function () use ($db): void {
        $db->beginTransaction();
        try {
            $db->query("SELECT id, status, max_devices FROM licenses WHERE public_id = 'test-license-A' LIMIT 1 FOR UPDATE")->fetch();
            $worker = refresh_test_start(refresh_test_input());
            refresh_test_wait($worker, 'before', 'license');
            refresh_test_wait_for_lock($worker);
            // This would fail/block if refresh had taken the device lock first.
            $db->query('SELECT id FROM license_devices WHERE id = 1 FOR UPDATE NOWAIT')->fetch();
            $db->exec("UPDATE licenses SET plan = 'proplus', max_devices = 4 WHERE id = 1");
            $db->commit();
            $claims = refresh_test_claims(refresh_test_finish($worker));
            refresh_test_equal('proplus', $claims['plan'], 'Latest committed plan');
            refresh_test_equal(4, $claims['max_devices'], 'Latest committed cap');
            refresh_test_effects(1, 1, 1);
        } finally { if ($db->inTransaction()) { $db->rollBack(); } }
    });
    foreach ([
        'device' => "UPDATE license_devices SET status = 'revoked' WHERE id = 1",
        'license' => "UPDATE licenses SET status = 'revoked' WHERE id = 1",
    ] as $target => $sql) {
        refresh_test_case('admin-style ' . $target . ' revocation wins while refresh waits', function () use ($db, $sql): void {
            $db->beginTransaction();
            try {
                $db->query('SELECT id FROM licenses WHERE id = 1 FOR UPDATE')->fetch();
                $worker = refresh_test_start(refresh_test_input());
                refresh_test_wait($worker, 'before', 'license');
                refresh_test_wait_for_lock($worker);
                $db->query('SELECT id FROM license_devices WHERE id = 1 FOR UPDATE NOWAIT')->fetch();
                $db->exec($sql);
                $db->commit();
                refresh_test_response(refresh_test_finish($worker), 404, 'device_or_license_invalid');
                refresh_test_effects(0, 0, 0);
            } finally { if ($db->inTransaction()) { $db->rollBack(); } }
        });
    }
    foreach ([
        'changed device binding' => 'UPDATE license_devices SET license_id = 2 WHERE id = 1',
        'deleted device' => 'DELETE FROM license_devices WHERE id = 1',
        'changed product status' => "UPDATE products SET status = 'inactive' WHERE id = 1",
        'changed customer status' => "UPDATE customers SET status = 'inactive' WHERE id = 1",
    ] as $name => $sql) {
        refresh_test_case('stale locator cannot authorize ' . $name, function () use ($db, $sql): void {
            $worker = refresh_test_start(refresh_test_input(), ['pause_after' => 'locator']);
            refresh_test_wait($worker, 'after', 'locator');
            $db->exec($sql);
            touch($worker['release']);
            refresh_test_response(refresh_test_finish($worker), 404, 'device_or_license_invalid');
            refresh_test_effects(0, 0, 0);
        });
    }
    refresh_test_case('late event failure rolls back nonce and last_seen; same nonce can retry', function (): void {
        $input = refresh_test_input();
        $worker = refresh_test_start($input, ['fail_event' => true]);
        refresh_test_response(refresh_test_finish($worker), 500, 'refresh_failed');
        refresh_test_assert(in_array('rollback', array_column(refresh_test_trace($worker), 'kind'), true), 'Rollback called');
        refresh_test_effects(0, 0, 0);
        refresh_test_response(refresh_test_request($input), 200);
        refresh_test_effects(1, 1, 1);
    });
    refresh_test_case('lock timeout preserves current 500 contract, no writes, safe retry', function () use ($db): void {
        $input = refresh_test_input();
        $db->beginTransaction();
        try {
            $db->query('SELECT id FROM licenses WHERE id = 1 FOR UPDATE')->fetch();
            refresh_test_response(refresh_test_request($input, ['lock_timeout' => 1]), 500, 'refresh_failed');
            refresh_test_effects(0, 0, 0);
            $db->commit();
            refresh_test_response(refresh_test_request($input), 200);
            refresh_test_effects(1, 1, 1);
        } finally { if ($db->inTransaction()) { $db->rollBack(); } }
    });
    refresh_test_case('existing bounded nonce purge deletes expired entries, not live entries', function () use ($db): void {
        $stmt = $db->prepare('INSERT INTO device_refresh_nonces (nonce_hash, device_id, expires_at) VALUES (?, 2, ?)');
        $expired = hash('sha256', 'expired-test-nonce', true);
        $live = hash('sha256', 'live-test-nonce', true);
        $stmt->execute([$expired, gmdate('Y-m-d H:i:s', time() - 60)]);
        $stmt->execute([$live, gmdate('Y-m-d H:i:s', time() + 600)]);
        refresh_test_response(refresh_test_request(refresh_test_input()), 200);
        refresh_test_effects(2, 1, 1);
        $stmt = $db->prepare('SELECT COUNT(*) FROM device_refresh_nonces WHERE nonce_hash = ?');
        $stmt->execute([$live]);
        refresh_test_equal(1, (int) $stmt->fetchColumn(), 'Live nonce preserved');
        $stmt->execute([$expired]);
        refresh_test_equal(0, (int) $stmt->fetchColumn(), 'Expired nonce removed');
    });
    echo json_encode(['ok' => true, 'database' => $version, 'isolation' => 'REPEATABLE READ', 'passed' => count($passed), 'tests' => $passed], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT) . "\n";
    if (getenv('GITHUB_ACTIONS') === 'true') {
        echo '::notice title=Refresh transaction tests::' . count($passed) . ' cases passed on ' . $version . ' with REPEATABLE READ' . "\n";
    }
} finally {
    foreach ($children as $worker) {
        if (is_resource($worker['process'])) { proc_terminate($worker['process']); proc_close($worker['process']); }
    }
    if ($db instanceof PDO && $db->inTransaction()) { $db->rollBack(); }
    $db = null;
    // Only the generated, randomly named fixture database is ever dropped.
    if (preg_match('/^karen_test_refresh_[0-9a-f]{16}$/D', $database)) { $server->exec('DROP DATABASE IF EXISTS `' . $database . '`'); }
    refresh_test_remove($scratch);
}
