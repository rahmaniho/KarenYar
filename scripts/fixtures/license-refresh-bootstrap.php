<?php
declare(strict_types=1);

// CLI-only test double for the private host bootstrap. Never deploy this file.
// SQL, transactions and Ed25519 are real; HTTP transport and rate limiting are not.
if (PHP_SAPI !== 'cli' || getenv('KAREN_LICENSE_DB_TESTS') !== '1') { exit(1); }

define('KAREN_ENV', 'staging');
define('KAREN_ISSUER', 'karen-license-test');
define('KAREN_AUDIENCE', 'hesabyar-app');

function karen_refresh_test_trace(string $phase, string $kind, bool $inTransaction, ?string $sql = null, ?int $connectionId = null, ?int $timestamp = null): void
{
    $path = $GLOBALS['karen_test_request']['trace'];
    file_put_contents($path, json_encode([
        'phase' => $phase,
        'kind' => $kind,
        'transaction' => $inTransaction,
        'sql' => $sql,
        'connection_id' => $connectionId,
        'timestamp' => $timestamp,
    ], JSON_THROW_ON_ERROR) . "\n", FILE_APPEND | LOCK_EX);
}

final class KarenRefreshTestPDO extends PDO
{
    public function __construct()
    {
        parent::__construct((string) getenv('KAREN_LICENSE_TEST_DSN'), 'root', (string) getenv('KAREN_LICENSE_TEST_PASSWORD'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $this->setAttribute(PDO::ATTR_STATEMENT_CLASS, [KarenRefreshTestStatement::class, [$this]]);
        $connectionId = (int) $this->query('SELECT CONNECTION_ID()')->fetchColumn();
        karen_refresh_test_trace('after', 'connect', false, null, $connectionId);
        $this->exec("SET time_zone = '+00:00'");
        $this->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        $timeout = (int) ($GLOBALS['karen_test_request']['lock_timeout'] ?? 8);
        $this->exec('SET SESSION innodb_lock_wait_timeout = ' . max(1, min(8, $timeout)));
    }

    public function beginTransaction(): bool
    {
        $result = parent::beginTransaction();
        karen_refresh_test_trace('after', 'begin', $this->inTransaction());
        return $result;
    }

    public function commit(): bool
    {
        $result = parent::commit();
        karen_refresh_test_trace('after', 'commit', $this->inTransaction());
        return $result;
    }

    public function rollBack(): bool
    {
        $result = parent::rollBack();
        karen_refresh_test_trace('after', 'rollback', $this->inTransaction());
        return $result;
    }
}

final class KarenRefreshTestStatement extends PDOStatement
{
    protected function __construct(private KarenRefreshTestPDO $connection) {}

    public function execute(?array $params = null): bool
    {
        $sql = (string) preg_replace('/\s+/', ' ', trim($this->queryString));
        $kind = match (true) {
            str_starts_with($sql, 'SELECT license_id FROM license_devices') => 'locator',
            str_contains($sql, 'FROM licenses WHERE id = :license_id') => 'license',
            str_contains($sql, 'FROM products p INNER JOIN customers c') => 'account',
            str_starts_with($sql, 'SELECT * FROM license_devices') => 'device',
            str_starts_with($sql, 'INSERT INTO device_refresh_nonces') => 'nonce',
            str_starts_with($sql, 'UPDATE license_devices') => 'seen',
            str_starts_with($sql, 'INSERT INTO license_events') => 'event',
            default => 'other',
        };
        karen_refresh_test_trace('before', $kind, $this->connection->inTransaction(), $sql);
        if ($kind === 'event' && !empty($GLOBALS['karen_test_request']['fail_event'])) {
            throw new RuntimeException('test_injected_event_failure');
        }
        $result = parent::execute($params);
        karen_refresh_test_trace('after', $kind, $this->connection->inTransaction(), $sql);
        if (($GLOBALS['karen_test_request']['pause_after'] ?? '') === $kind) {
            $deadline = microtime(true) + 12;
            while (!is_file($GLOBALS['karen_test_request']['release'])) {
                if (microtime(true) > $deadline) { throw new RuntimeException('test_barrier_timeout'); }
                usleep(10000);
            }
        }
        return $result;
    }
}

function karen_read_json(): array
{
    $request = $GLOBALS['karen_test_request'];
    $input = $request['input'];
    if (array_key_exists('stamp_offset', $request)) {
        // Calibrate only the synthetic client's signed input at worker entry.
        // Production time(), endpoint SQL and lock waits are never substituted.
        $input['timestamp'] = time() + (int) $request['stamp_offset'];
        $device = (int) ($request['stamp_device'] ?? 1);
        $pair = sodium_crypto_sign_seed_keypair(hash('sha256', 'public-device-test-seed-' . $device, true));
        $message = implode("\n", ['karen-license-refresh-v1', $input['product_code'],
            $input['device_key_id'], (string) $input['timestamp'], $input['nonce']]);
        $input['signature_b64'] = base64_encode(sodium_crypto_sign_detached($message, sodium_crypto_sign_secretkey($pair)));
        karen_refresh_test_trace('after', 'input_clock', false, null, null, $input['timestamp']);
    }
    return $input;
}
function karen_db(): PDO
{
    static $pdo;
    return $pdo ??= new KarenRefreshTestPDO();
}
function karen_client_ip_hash(): string
{
    return hash('sha256', 'isolated-test-client', true);
}
function karen_rate_limit(string $bucket, int $limit, int $seconds): void
{
    // The host's private rate-limiter is not part of this transaction fixture.
}
function karen_json(int $status, array $body): never
{
    echo json_encode(['status' => $status, 'body' => $body], JSON_THROW_ON_ERROR);
    exit(0);
}
function karen_fail(int $status, string $error): never
{
    karen_json($status, ['ok' => false, 'error' => $error]);
}
function karen_sign_license(array $claims): array
{
    // Public, synthetic fixture seed: never a staging/production issuer key.
    $pair = sodium_crypto_sign_seed_keypair(hash('sha256', 'refresh-ci-issuer-not-a-secret', true));
    $header = ['alg' => 'EdDSA', 'typ' => 'hesabyar-license', 'kid' => 'test-issuer', 'env' => KAREN_ENV];
    $b64url = static fn(string $bytes): string => rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    $message = $b64url(json_encode($header, JSON_THROW_ON_ERROR)) . '.' . $b64url(json_encode($claims, JSON_THROW_ON_ERROR));
    $signature = sodium_crypto_sign_detached($message, sodium_crypto_sign_secretkey($pair));
    return [
        'token' => 'HY2.' . $message . '.' . $b64url($signature),
        'kid' => 'test-issuer',
        'issuer_public_key_b64' => base64_encode(sodium_crypto_sign_publickey($pair)),
    ];
}
