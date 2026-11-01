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

function karen_refresh_message(string $productCode, string $deviceKeyId, int $timestamp, string $nonce): string
{
    return implode("\n", [
        'karen-license-refresh-v1',
        $productCode,
        $deviceKeyId,
        (string) $timestamp,
        $nonce,
    ]);
}

function karen_ed25519_public_raw_from_pem(string $pem): string
{
    $body = preg_replace('/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/', '', $pem);

    if (!is_string($body)) {
        throw new RuntimeException('invalid_public_key_pem');
    }

    $der = base64_decode($body, true);

    if ($der === false || strlen($der) !== 44) {
        throw new RuntimeException('invalid_public_key_pem');
    }

    $prefix = hex2bin('302a300506032b6570032100');

    if (substr($der, 0, 12) !== $prefix) {
        throw new RuntimeException('invalid_public_key_pem');
    }

    return substr($der, 12, 32);
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

try {
    $input = karen_read_json();

    $deviceKeyId = strtolower(trim((string) ($input['device_key_id'] ?? '')));
    $productCode = trim((string) ($input['product_code'] ?? 'hesabyar'));
    $timestamp = (int) ($input['timestamp'] ?? 0);
    $nonce = strtolower(trim((string) ($input['nonce'] ?? '')));
    $signatureB64 = trim((string) ($input['signature_b64'] ?? ''));

    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $deviceKeyId)) {
        karen_fail(400, 'invalid_device_key_id');
    }

    if (!preg_match('/^[a-z0-9_-]{1,64}$/', $productCode)) {
        karen_fail(400, 'invalid_product_code');
    }

    $now = time();

    if ($timestamp < $now - 300 || $timestamp > $now + 300) {
        karen_fail(400, 'invalid_timestamp');
    }

    if (!preg_match('/^[0-9a-f]{32,128}$/', $nonce)) {
        karen_fail(400, 'invalid_nonce');
    }

    $signature = karen_license_decode_key_material($signatureB64, 64);

    if ($signature === null) {
        karen_fail(400, 'invalid_signature');
    }

    if (!function_exists('sodium_crypto_sign_verify_detached')) {
        karen_fail(500, 'sodium_missing');
    }

    karen_rate_limit('refresh:ip:' . bin2hex(karen_client_ip_hash()), 60, 300);
    karen_rate_limit('refresh:device:' . $deviceKeyId, 30, 300);

    $pdo = karen_db();

    $abort = static function (int $status, string $error) use ($pdo): void {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        karen_fail($status, $error);
    };

    $pdo->beginTransaction();

    $stmt = $pdo->prepare(<<<'SQL'
SELECT
    d.*,
    l.public_id,
    l.product_id,
    l.customer_id,
    l.plan,
    l.max_devices,
    l.expires_at,
    p.code AS product_code,
    c.reference_code AS customer_reference
FROM license_devices d
INNER JOIN licenses l ON l.id = d.license_id
INNER JOIN products p ON p.id = l.product_id
INNER JOIN customers c ON c.id = l.customer_id
WHERE d.device_key_id = :device_key_id
  AND d.status = 'active'
  AND l.status = 'active'
  AND p.status = 'active'
  AND c.status = 'active'
  AND (l.expires_at IS NULL OR l.expires_at > UTC_TIMESTAMP())
LIMIT 1
FOR UPDATE
SQL
    );

    $stmt->bindValue(':device_key_id', $deviceKeyId, PDO::PARAM_STR);
    $stmt->execute();

    $row = $stmt->fetch();

    if (!$row) {
        $abort(404, 'device_or_license_invalid');
    }

    if ((string) $row['product_code'] !== $productCode) {
        $abort(400, 'product_mismatch');
    }

    $publicRaw = karen_ed25519_public_raw_from_pem((string) $row['public_key_pem']);
    $message = karen_refresh_message($productCode, $deviceKeyId, $timestamp, $nonce);

    if (!sodium_crypto_sign_verify_detached($signature, $message, $publicRaw)) {
        $abort(401, 'invalid_device_signature');
    }

    $pdo->exec('DELETE FROM device_refresh_nonces WHERE expires_at < UTC_TIMESTAMP() LIMIT 100');

    $nonceHash = hash('sha256', $deviceKeyId . '|' . $nonce, true);
    $nonceExpiresAt = gmdate('Y-m-d H:i:s', $now + 600);

    $stmt = $pdo->prepare(<<<'SQL'
INSERT INTO device_refresh_nonces (
    nonce_hash,
    device_id,
    expires_at
) VALUES (
    :nonce_hash,
    :device_id,
    :expires_at
)
SQL
    );

    $stmt->bindValue(':nonce_hash', $nonceHash, PDO::PARAM_STR);
    $stmt->bindValue(':device_id', (int) $row['id'], PDO::PARAM_INT);
    $stmt->bindValue(':expires_at', $nonceExpiresAt, PDO::PARAM_STR);

    try {
        $stmt->execute();
    } catch (PDOException $e) {
        if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
            $abort(409, 'replay_detected');
        }

        throw $e;
    }

    $stmt = $pdo->prepare(<<<'SQL'
UPDATE license_devices
SET last_seen_at = UTC_TIMESTAMP()
WHERE id = :id
SQL
    );
    $stmt->bindValue(':id', (int) $row['id'], PDO::PARAM_INT);
    $stmt->execute();

    $tokenExpiresAt = $now + 7 * 86400;

    if (!empty($row['expires_at'])) {
        $licenseExpiresAt = (new DateTimeImmutable((string) $row['expires_at'], new DateTimeZone('UTC')))->getTimestamp();
        $tokenExpiresAt = min($tokenExpiresAt, $licenseExpiresAt);
    }

    if ($tokenExpiresAt <= $now) {
        $abort(400, 'license_expired');
    }

    $claims = [
        'iss' => KAREN_ISSUER,
        'aud' => KAREN_AUDIENCE,
        'env' => KAREN_ENV,
        'sub' => (string) $row['customer_reference'],
        'jti' => (string) $row['public_id'],
        'product' => (string) $row['product_code'],
        'plan' => (string) $row['plan'],
        'features' => karen_plan_features((string) $row['plan']),
        'device_key_id' => $deviceKeyId,
        'device_id' => (int) $row['id'],
        'max_devices' => (int) $row['max_devices'],
        'iat' => $now,
        'nbf' => $now,
        'exp' => $tokenExpiresAt,
    ];

    $signed = karen_sign_license($claims);

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

    $stmt->bindValue(':license_id', (int) $row['license_id'], PDO::PARAM_INT);
    $stmt->bindValue(':device_id', (int) $row['id'], PDO::PARAM_INT);
    $stmt->bindValue(':event_type', 'license.refreshed', PDO::PARAM_STR);
    $stmt->bindValue(':ip_hash', karen_client_ip_hash(), PDO::PARAM_STR);
    $stmt->bindValue(':user_agent', substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255), PDO::PARAM_STR);
    $stmt->bindValue(':meta', json_encode([
        'environment' => KAREN_ENV,
        'device_key_id' => $deviceKeyId,
        'nonce_hash' => bin2hex($nonceHash),
        'token_exp' => $tokenExpiresAt,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), PDO::PARAM_STR);
    $stmt->execute();

    $pdo->commit();

    karen_json(200, [
        'ok' => true,
        'environment' => KAREN_ENV,
        'token_type' => 'Bearer',
        'token' => $signed['token'],
        'kid' => $signed['kid'],
        'issuer_public_key_b64' => $signed['issuer_public_key_b64'],
        'license' => [
            'public_id' => (string) $row['public_id'],
            'product' => (string) $row['product_code'],
            'plan' => (string) $row['plan'],
            'max_devices' => (int) $row['max_devices'],
            'device_id' => (int) $row['id'],
            'device_key_id' => $deviceKeyId,
            'token_expires_at' => gmdate('c', $tokenExpiresAt),
            'license_expires_at' => $row['expires_at'],
        ],
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('karen staging refresh failed: ' . $e->getMessage());
    karen_fail(500, 'refresh_failed');
}
