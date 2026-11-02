<?php
declare(strict_types=1);

require_once __DIR__ . '/license-encoding.php';
require '/home/karensof/private/karen-staging/bootstrap.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'https://staging.karen-soft.ir',
];

if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    karen_fail(405, 'method_not_allowed');
}

function karen_ed25519_public_pem(string $rawPublicKey): string
{
    $der = hex2bin('302a300506032b6570032100') . $rawPublicKey;

    return "-----BEGIN PUBLIC KEY-----\n"
        . chunk_split(base64_encode($der), 64, "\n")
        . "-----END PUBLIC KEY-----\n";
}

function karen_plan_features(string $plan): array
{
    if ($plan === 'pro' || $plan === 'proplus') {
        return [
            'backup',
            'pdf-export',
            'unlimited-products',
            'unlimited-transactions',
        ];
    }

    return [];
}

// Private, bounded metadata for the last completed staging POST. Never log
// activation codes/hashes, tokens, public keys, labels, headers or exception text.
$activationTrace = [
    'version' => 1,
    'started_at_utc' => gmdate('Y-m-d H:i:s'),
    'phase' => 'read_input',
    'outcome' => 'incomplete',
    'http_status' => null,
    'error_code' => null,
    'input_code_bytes' => null,
    'input_has_non_ascii' => null,
    'computed_hash_bytes' => null,
    'device_key_id' => null,
    'locator_license_id' => null,
    'license_public_id' => null,
    'committed' => false,
    'database_error_code' => null,
];

if (defined('KAREN_ENV') && KAREN_ENV === 'staging') {
    register_shutdown_function(static function () use (&$activationTrace, &$pdo): void {
        $temporary = null;
        $handle = null;
        try {
            $report = $activationTrace;
            $report['finished_at_utc'] = gmdate('Y-m-d H:i:s');
            $report['source_sha256'] = hash_file('sha256', __FILE__);
            $report['php_version'] = PHP_VERSION;
            $report['php_sapi'] = PHP_SAPI;
            $report['http_status'] ??= http_response_code() ?: null;
            $report['db_schema'] = null;
            $report['db_utc_now'] = null;
            $report['db_time_zone'] = null;
            $report['transaction_open_at_report'] = $pdo instanceof PDO && $pdo->inTransaction();
            // No table read or new snapshot; only probe an already-open connection,
            // after normal commit/rollback. Never open a connection for reporting.
            if ($pdo instanceof PDO && !$report['transaction_open_at_report']) {
                try {
                    $context = $pdo->query('SELECT DATABASE() AS db_schema, UTC_TIMESTAMP() AS db_utc_now, @@session.time_zone AS db_time_zone')->fetch(PDO::FETCH_ASSOC);
                    if (is_array($context)) {
                        $report['db_schema'] = $context['db_schema'];
                        $report['db_utc_now'] = $context['db_utc_now'];
                        $report['db_time_zone'] = $context['db_time_zone'];
                    }
                } catch (Throwable) {
                    // A failed metadata probe must not change the API result.
                }
            }
            // The optional constant is server configuration, NOT a request input.
            // CI redirects it into its disposable scratch directory.
            $path = defined('KAREN_ACTIVATION_REPORT_FILE')
                ? (string) KAREN_ACTIVATION_REPORT_FILE
                : '/home/karensof/private/karen-staging/activation-last-attempt.json';
            $temporary = $path . '.tmp-' . bin2hex(random_bytes(6));
            $handle = @fopen($temporary, 'x');
            if ($handle === false || !@chmod($temporary, 0600)) {
                throw new RuntimeException('report_unavailable');
            }
            $json = json_encode($report, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
            if (@fwrite($handle, $json) !== strlen($json)) {
                throw new RuntimeException('report_unavailable');
            }
            fclose($handle);
            $handle = null;
            // Replace, never append or follow a destination symlink; fixed-size
            // private history of one attempt, without changing business records.
            if (!@rename($temporary, $path)) {
                throw new RuntimeException('report_unavailable');
            }
            $temporary = null;
        } catch (Throwable) {
            try { @error_log('karen staging activation report unavailable'); } catch (Throwable) {}
        } finally {
            try {
                if (is_resource($handle)) { @fclose($handle); }
                if ($temporary !== null && is_file($temporary)) { @unlink($temporary); }
            } catch (Throwable) {
                // Reporting/cleanup must never throw into the business response.
            }
        }
    });
}

$activationReject = static function (int $status, string $error) use (&$activationTrace): never {
    $activationTrace['outcome'] = 'rejected';
    $activationTrace['http_status'] = $status;
    $activationTrace['error_code'] = $error;
    karen_fail($status, $error);
};

try {
    $input = karen_read_json();

    $activationCode = trim((string) ($input['activation_code'] ?? ''));
    $deviceKeyId = strtolower(trim((string) ($input['device_key_id'] ?? '')));
    $devicePublicKeyB64 = trim((string) ($input['device_public_key_b64'] ?? ''));
    $deviceLabel = trim((string) ($input['device_label'] ?? 'Unknown device'));
    $productCode = trim((string) ($input['product_code'] ?? 'hesabyar'));

    $activationTrace['phase'] = 'validate_code';
    $activationTrace['input_code_bytes'] = strlen($activationCode);
    $activationTrace['input_has_non_ascii'] = strlen($activationCode) <= 128
        ? preg_match('/[^\x20-\x7E]/', $activationCode) === 1 : null;

    if ($activationCode === '' || strlen($activationCode) > 128) {
        $activationReject(400, 'invalid_activation_code');
    }

    $activationTrace['phase'] = 'validate_device_id';
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $deviceKeyId)) {
        $activationReject(400, 'invalid_device_key_id');
    }

    $activationTrace['device_key_id'] = $deviceKeyId;
    $activationTrace['phase'] = 'validate_device_key';
    $devicePublicKey = karen_license_decode_key_material($devicePublicKeyB64, 32);

    if ($devicePublicKey === null) {
        $activationReject(400, 'invalid_device_public_key');
    }

    $activationTrace['phase'] = 'validate_device_label';
    if ($deviceLabel === '') {
        $deviceLabel = 'Unknown device';
    }

    if (strlen($deviceLabel) > 190) {
        $activationReject(400, 'invalid_device_label');
    }

    $activationTrace['phase'] = 'validate_product';
    if (!preg_match('/^[a-z0-9_-]{1,64}$/', $productCode)) {
        $activationReject(400, 'invalid_product_code');
    }

    $activationTrace['phase'] = 'hash_code';
    $activationCodeHash = karen_activation_code_hash($activationCode);
    $activationTrace['computed_hash_bytes'] = strlen($activationCodeHash);

    $activationTrace['phase'] = 'rate_limit';
    karen_rate_limit('activation:ip:' . bin2hex(karen_client_ip_hash()), 30, 300);
    karen_rate_limit('activation:code:' . bin2hex($activationCodeHash), 10, 300);

    $activationTrace['phase'] = 'database_connect';
    $pdo = karen_db();
    // Match refresh/maintenance when reading TIMESTAMP columns and DB expiry.
    $pdo->exec("SET time_zone = '+00:00'");

    $abort = static function (int $status, string $error) use ($pdo, $activationReject): void {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        $activationReject($status, $error);
    };

    $activationTrace['phase'] = 'license_lookup';
    // Locate only, outside the transaction: do not start an RR snapshot here.
    $stmt = $pdo->prepare(<<<'SQL'
SELECT id
FROM licenses
WHERE activation_code_hash = :activation_code_hash
LIMIT 1
SQL
    );
    $stmt->bindValue(':activation_code_hash', $activationCodeHash, PDO::PARAM_STR);
    $stmt->execute();
    $licenseId = (int) $stmt->fetchColumn();
    $activationTrace['locator_license_id'] = $licenseId > 0 ? $licenseId : null;

    if ($licenseId <= 0) {
        $abort(404, 'invalid_activation_code');
    }

    $activationTrace['phase'] = 'license_recheck';
    $pdo->beginTransaction();

    // Match refresh/admin: lock the license PK before shared metadata or devices.
    // Recheck the code after waiting; the locator is not an authorization decision.
    $stmt = $pdo->prepare(<<<'SQL'
SELECT id, public_id, product_id, customer_id, plan, max_devices, expires_at,
       activation_code_expires_at
FROM licenses
WHERE id = :license_id
  AND activation_code_hash = :activation_code_hash
  AND status = 'active'
  AND activation_code_expires_at > UTC_TIMESTAMP()
  AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())
LIMIT 1
FOR UPDATE
SQL
    );
    $stmt->bindValue(':license_id', $licenseId, PDO::PARAM_INT);
    $stmt->bindValue(':activation_code_hash', $activationCodeHash, PDO::PARAM_STR);
    $stmt->execute();
    $license = $stmt->fetch();

    if (!$license) {
        $abort(404, 'invalid_activation_code');
    }

    $publicId = (string) $license['public_id'];
    $activationTrace['license_public_id'] = preg_match('/^[A-Za-z0-9_-]{1,64}$/', $publicId) ? $publicId : null;
    $activationTrace['phase'] = 'account_recheck';
    $stmt = $pdo->prepare(<<<'SQL'
SELECT p.code AS product_code, c.reference_code AS customer_reference
FROM products p
INNER JOIN customers c ON c.id = :customer_id
WHERE p.id = :product_id
  AND p.code = :product_code
  AND p.status = 'active'
  AND c.status = 'active'
LIMIT 1
FOR UPDATE
SQL
    );
    $stmt->bindValue(':product_id', (int) $license['product_id'], PDO::PARAM_INT);
    $stmt->bindValue(':customer_id', (int) $license['customer_id'], PDO::PARAM_INT);
    $stmt->bindValue(':product_code', $productCode, PDO::PARAM_STR);
    $stmt->execute();
    $account = $stmt->fetch();

    if (!$account) {
        $abort(404, 'invalid_activation_code');
    }

    $license = array_merge($license, $account);

    $expectedDevicePem = karen_ed25519_public_pem($devicePublicKey);

    $activationTrace['phase'] = 'device_lookup';
    $stmt = $pdo->prepare(<<<'SQL'
SELECT *
FROM license_devices
WHERE device_key_id = :device_key_id
LIMIT 1
FOR UPDATE
SQL
    );
    $stmt->bindValue(':device_key_id', $deviceKeyId, PDO::PARAM_STR);
    $stmt->execute();

    $existingDevice = $stmt->fetch();

    $activationTrace['phase'] = 'code_expiry_after_lock';
    // The first statement's UTC_TIMESTAMP can predate a license/device lock wait.
    $clock = $pdo->prepare('SELECT UNIX_TIMESTAMP()');
    $clock->execute();
    $dbNow = (int) $clock->fetchColumn();

    if ($dbNow <= 0) {
        throw new RuntimeException('database_clock_invalid');
    }

    $activationCodeExpiresAt = (new DateTimeImmutable((string) $license['activation_code_expires_at'], new DateTimeZone('UTC')))->getTimestamp();

    if ($activationCodeExpiresAt <= $dbNow) {
        $abort(404, 'invalid_activation_code');
    }

    $activationTrace['phase'] = 'device_binding';
    if ($existingDevice) {
        if ((int) $existingDevice['license_id'] !== (int) $license['id']) {
            $abort(409, 'device_already_registered');
        }

        if ($existingDevice['status'] !== 'active') {
            $abort(403, 'device_revoked');
        }

        if (!hash_equals((string) $existingDevice['public_key_pem'], $expectedDevicePem)) {
            $abort(409, 'device_key_mismatch');
        }

        $deviceId = (int) $existingDevice['id'];

        $stmt = $pdo->prepare(<<<'SQL'
UPDATE license_devices
SET last_seen_at = UTC_TIMESTAMP()
WHERE id = :id
SQL
        );
        $stmt->bindValue(':id', $deviceId, PDO::PARAM_INT);
        $stmt->execute();

        $eventType = 'activation.reused';
    } else {
        $activationTrace['phase'] = 'device_capacity';
        $stmt = $pdo->prepare(<<<'SQL'
SELECT COUNT(*)
FROM license_devices
WHERE license_id = :license_id
  AND status = 'active'
SQL
        );
        $stmt->bindValue(':license_id', (int) $license['id'], PDO::PARAM_INT);
        $stmt->execute();

        $activeDevices = (int) $stmt->fetchColumn();

        if ($activeDevices >= (int) $license['max_devices']) {
            $abort(403, 'device_limit_reached');
        }

        $activationTrace['phase'] = 'device_insert';
        $stmt = $pdo->prepare(<<<'SQL'
INSERT INTO license_devices (
    license_id,
    device_key_id,
    device_label,
    public_key_pem,
    status,
    activated_at,
    last_seen_at
) VALUES (
    :license_id,
    :device_key_id,
    :device_label,
    :public_key_pem,
    'active',
    UTC_TIMESTAMP(),
    UTC_TIMESTAMP()
)
SQL
        );

        $stmt->bindValue(':license_id', (int) $license['id'], PDO::PARAM_INT);
        $stmt->bindValue(':device_key_id', $deviceKeyId, PDO::PARAM_STR);
        $stmt->bindValue(':device_label', $deviceLabel, PDO::PARAM_STR);
        $stmt->bindValue(':public_key_pem', $expectedDevicePem, PDO::PARAM_STR);
        $stmt->execute();

        $deviceId = (int) $pdo->lastInsertId();
        $eventType = 'activation.created';
    }

    $activationTrace['phase'] = 'token_lifetime';
    $now = time();
    $tokenExpiresAt = $now + 7 * 86400;

    if (!empty($license['expires_at'])) {
        $licenseExpiresAt = (new DateTimeImmutable((string) $license['expires_at'], new DateTimeZone('UTC')))->getTimestamp();
        $tokenExpiresAt = min($tokenExpiresAt, $licenseExpiresAt);
    }

    if ($tokenExpiresAt <= $now) {
        $abort(400, 'license_expired');
    }

    $claims = [
        'iss' => KAREN_ISSUER,
        'aud' => KAREN_AUDIENCE,
        'env' => KAREN_ENV,
        'sub' => (string) $license['customer_reference'],
        'jti' => (string) $license['public_id'],
        'product' => (string) $license['product_code'],
        'plan' => (string) $license['plan'],
        'features' => karen_plan_features((string) $license['plan']),
        'device_key_id' => $deviceKeyId,
        'device_id' => $deviceId,
        'max_devices' => (int) $license['max_devices'],
        'iat' => $now,
        'nbf' => $now,
        'exp' => $tokenExpiresAt,
    ];

    $activationTrace['phase'] = 'token_signing';
    $signed = karen_sign_license($claims);

    $activationTrace['phase'] = 'event_insert';
    $stmt = $pdo->prepare(<<<'SQL'
INSERT INTO license_events (
    license_id,
    device_id,
    event_type,
    ip_hash,
    user_agent,
    meta
) VALUES (
    :license_id,
    :device_id,
    :event_type,
    :ip_hash,
    :user_agent,
    :meta
)
SQL
    );

    $stmt->bindValue(':license_id', (int) $license['id'], PDO::PARAM_INT);
    $stmt->bindValue(':device_id', $deviceId, PDO::PARAM_INT);
    $stmt->bindValue(':event_type', $eventType, PDO::PARAM_STR);
    $stmt->bindValue(':ip_hash', karen_client_ip_hash(), PDO::PARAM_STR);
    $stmt->bindValue(':user_agent', substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255), PDO::PARAM_STR);
    $stmt->bindValue(':meta', json_encode([
        'environment' => KAREN_ENV,
        'device_key_id' => $deviceKeyId,
        'token_exp' => $tokenExpiresAt,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), PDO::PARAM_STR);
    $stmt->execute();

    $activationTrace['phase'] = 'precommit_clock';
    // Fail closed if DB work/signing consumed the remaining code/token lifetime.
    // These are point-in-time gates, not a guarantee against arbitrary clock jumps.
    $clock->execute();
    $dbNow = (int) $clock->fetchColumn();
    $commitNow = time();

    if ($dbNow <= 0) {
        throw new RuntimeException('database_clock_invalid');
    }

    $activationTrace['phase'] = 'precommit_expiry';
    if ($activationCodeExpiresAt <= $dbNow) {
        $abort(404, 'invalid_activation_code');
    }

    if ($tokenExpiresAt <= $commitNow || $tokenExpiresAt <= $dbNow) {
        $abort(400, 'license_expired');
    }

    $activationTrace['phase'] = 'commit';
    $commitResult = $pdo->commit();
    $activationTrace['phase'] = $commitResult ? 'committed' : 'commit_returned_false';
    $activationTrace['committed'] = $commitResult;
    $activationTrace['outcome'] = 'succeeded';
    $activationTrace['http_status'] = 200;

    karen_json(200, [
        'ok' => true,
        'environment' => KAREN_ENV,
        'token_type' => 'Bearer',
        'token' => $signed['token'],
        'kid' => $signed['kid'],
        'issuer_public_key_b64' => $signed['issuer_public_key_b64'],
        'license' => [
            'public_id' => (string) $license['public_id'],
            'product' => (string) $license['product_code'],
            'plan' => (string) $license['plan'],
            'max_devices' => (int) $license['max_devices'],
            'device_id' => $deviceId,
            'device_key_id' => $deviceKeyId,
            'token_expires_at' => gmdate('c', $tokenExpiresAt),
            'license_expires_at' => $license['expires_at'],
        ],
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $activationTrace['outcome'] = 'failed';
    $activationTrace['http_status'] = 500;
    $activationTrace['error_code'] = 'activation_failed';
    $activationTrace['database_error_code'] = $e instanceof PDOException ? (int) ($e->errorInfo[1] ?? 0) : null;
    error_log('karen staging activation failed at ' . $activationTrace['phase']);
    karen_fail(500, 'activation_failed');
}
