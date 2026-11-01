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

try {
    $input = karen_read_json();

    $activationCode = trim((string) ($input['activation_code'] ?? ''));
    $deviceKeyId = strtolower(trim((string) ($input['device_key_id'] ?? '')));
    $devicePublicKeyB64 = trim((string) ($input['device_public_key_b64'] ?? ''));
    $deviceLabel = trim((string) ($input['device_label'] ?? 'Unknown device'));
    $productCode = trim((string) ($input['product_code'] ?? 'hesabyar'));

    if ($activationCode === '' || strlen($activationCode) > 128) {
        karen_fail(400, 'invalid_activation_code');
    }

    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $deviceKeyId)) {
        karen_fail(400, 'invalid_device_key_id');
    }

    $devicePublicKey = karen_license_decode_key_material($devicePublicKeyB64, 32);

    if ($devicePublicKey === null) {
        karen_fail(400, 'invalid_device_public_key');
    }

    if ($deviceLabel === '') {
        $deviceLabel = 'Unknown device';
    }

    if (strlen($deviceLabel) > 190) {
        karen_fail(400, 'invalid_device_label');
    }

    if (!preg_match('/^[a-z0-9_-]{1,64}$/', $productCode)) {
        karen_fail(400, 'invalid_product_code');
    }

    $activationCodeHash = karen_activation_code_hash($activationCode);

    karen_rate_limit('activation:ip:' . bin2hex(karen_client_ip_hash()), 30, 300);
    karen_rate_limit('activation:code:' . bin2hex($activationCodeHash), 10, 300);

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
    l.*,
    p.code AS product_code,
    p.status AS product_status,
    c.reference_code AS customer_reference,
    c.status AS customer_status
FROM licenses l
INNER JOIN products p ON p.id = l.product_id
INNER JOIN customers c ON c.id = l.customer_id
WHERE l.activation_code_hash = :activation_code_hash
  AND p.code = :product_code
  AND l.status = 'active'
  AND p.status = 'active'
  AND c.status = 'active'
  AND l.activation_code_expires_at > UTC_TIMESTAMP()
  AND (l.expires_at IS NULL OR l.expires_at > UTC_TIMESTAMP())
LIMIT 1
FOR UPDATE
SQL
    );

    $stmt->bindValue(':activation_code_hash', $activationCodeHash, PDO::PARAM_STR);
    $stmt->bindValue(':product_code', $productCode, PDO::PARAM_STR);
    $stmt->execute();

    $license = $stmt->fetch();

    if (!$license) {
        $abort(404, 'invalid_activation_code');
    }

    $expectedDevicePem = karen_ed25519_public_pem($devicePublicKey);

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

    $pdo->commit();

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

    error_log('karen staging activation failed: ' . $e->getMessage());
    karen_fail(500, 'activation_failed');
}
