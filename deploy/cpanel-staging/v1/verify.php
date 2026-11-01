<?php
declare(strict_types=1);

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

function karen_verify_license_token(string $token): array
{
    if ($token === '' || strlen($token) > 8192 || substr($token, 0, 4) !== 'HY2.') {
        karen_fail(400, 'invalid_token');
    }

    $parts = explode('.', $token);

    if (count($parts) !== 4) {
        karen_fail(400, 'invalid_token');
    }

    [$prefix, $headerB64, $payloadB64, $signatureB64] = $parts;

    try {
        $headerJson = karen_b64url_decode($headerB64);
        $payloadJson = karen_b64url_decode($payloadB64);
        $signature = karen_b64url_decode($signatureB64);
    } catch (Throwable $e) {
        karen_fail(400, 'invalid_token');
    }

    $header = json_decode($headerJson, true);
    $claims = json_decode($payloadJson, true);

    if (!is_array($header) || !is_array($claims)) {
        karen_fail(400, 'invalid_token');
    }

    if (($header['alg'] ?? '') !== 'EdDSA') {
        karen_fail(400, 'invalid_algorithm');
    }

    if (($header['typ'] ?? '') !== 'hesabyar-license') {
        karen_fail(400, 'invalid_token_type');
    }

    if (($header['env'] ?? '') !== KAREN_ENV) {
        karen_fail(400, 'invalid_environment');
    }

    if (!function_exists('sodium_crypto_sign_verify_detached')) {
        karen_fail(500, 'sodium_missing');
    }

    $metaPath = KAREN_PRIVATE_DIR . '/keys/license-key-meta.json';

    if (!is_file($metaPath)) {
        karen_fail(500, 'missing_key_meta');
    }

    $meta = json_decode((string) file_get_contents($metaPath), true);

    if (!is_array($meta) || empty($meta['kid']) || empty($meta['public_key_b64'])) {
        karen_fail(500, 'invalid_key_meta');
    }

    if (($header['kid'] ?? '') !== (string) $meta['kid']) {
        karen_fail(400, 'unknown_kid');
    }

    $public = base64_decode((string) $meta['public_key_b64'], true);

    if ($public === false || strlen($public) !== 32) {
        karen_fail(500, 'invalid_public_key');
    }

    if (strlen($signature) !== 64) {
        karen_fail(400, 'invalid_signature');
    }

    $message = $headerB64 . '.' . $payloadB64;

    if (!sodium_crypto_sign_verify_detached($signature, $message, $public)) {
        karen_fail(401, 'invalid_signature');
    }

    foreach (['iss', 'aud', 'env', 'sub', 'jti', 'product', 'plan', 'device_key_id'] as $field) {
        if (!isset($claims[$field]) || !is_string($claims[$field]) || $claims[$field] === '') {
            karen_fail(400, 'invalid_claims');
        }
    }

    foreach (['device_id', 'max_devices', 'iat', 'nbf', 'exp'] as $field) {
        if (!isset($claims[$field]) || !is_int($claims[$field])) {
            karen_fail(400, 'invalid_claims');
        }
    }

    if (!isset($claims['features']) || !is_array($claims['features'])) {
        karen_fail(400, 'invalid_claims');
    }

    foreach ($claims['features'] as $feature) {
        if (!is_string($feature)) {
            karen_fail(400, 'invalid_claims');
        }
    }

    if ($claims['iss'] !== KAREN_ISSUER) {
        karen_fail(400, 'invalid_issuer');
    }

    if ($claims['aud'] !== KAREN_AUDIENCE) {
        karen_fail(400, 'invalid_audience');
    }

    if ($claims['env'] !== KAREN_ENV) {
        karen_fail(400, 'invalid_environment');
    }

    $now = time();

    if ($claims['exp'] <= $now) {
        karen_fail(401, 'token_expired');
    }

    if ($claims['nbf'] > $now + 60) {
        karen_fail(401, 'token_not_yet_valid');
    }

    if ($claims['iat'] > $now + 60) {
        karen_fail(400, 'invalid_issued_at');
    }

    return $claims;
}

try {
    $input = karen_read_json();

    $token = trim((string) ($input['token'] ?? ''));
    $productCode = trim((string) ($input['product_code'] ?? 'hesabyar'));

    if (!preg_match('/^[a-z0-9_-]{1,64}$/', $productCode)) {
        karen_fail(400, 'invalid_product_code');
    }

    karen_rate_limit('verify:ip:' . bin2hex(karen_client_ip_hash()), 120, 300);

    if ($token !== '') {
        karen_rate_limit('verify:token:' . hash('sha256', $token), 60, 300);
    }

    $claims = karen_verify_license_token($token);

    if ($claims['product'] !== $productCode) {
        karen_fail(400, 'product_mismatch');
    }

    $pdo = karen_db();

    $stmt = $pdo->prepare(<<<'SQL'
SELECT
    l.public_id,
    l.status AS license_status,
    l.expires_at,
    l.plan,
    d.id AS device_id,
    d.device_key_id,
    d.status AS device_status,
    p.code AS product_code,
    p.status AS product_status,
    c.status AS customer_status
FROM licenses l
INNER JOIN license_devices d ON d.license_id = l.id
INNER JOIN products p ON p.id = l.product_id
INNER JOIN customers c ON c.id = l.customer_id
WHERE l.public_id = :jti
  AND d.device_key_id = :device_key_id
LIMIT 1
SQL
    );

    $stmt->bindValue(':jti', $claims['jti'], PDO::PARAM_STR);
    $stmt->bindValue(':device_key_id', $claims['device_key_id'], PDO::PARAM_STR);
    $stmt->execute();

    $row = $stmt->fetch();

    if (!$row) {
        karen_fail(404, 'license_or_device_not_found');
    }

    if ((string) $row['product_code'] !== $productCode) {
        karen_fail(400, 'product_mismatch');
    }

    if ((int) $row['device_id'] !== $claims['device_id']) {
        karen_fail(400, 'device_mismatch');
    }

    if ((string) $row['plan'] !== $claims['plan']) {
        karen_fail(409, 'license_plan_changed');
    }

    if ($row['license_status'] !== 'active') {
        karen_fail(403, 'license_not_active');
    }

    if ($row['device_status'] !== 'active') {
        karen_fail(403, 'device_not_active');
    }

    if ($row['product_status'] !== 'active') {
        karen_fail(403, 'product_not_active');
    }

    if ($row['customer_status'] !== 'active') {
        karen_fail(403, 'customer_not_active');
    }

    if (!empty($row['expires_at'])) {
        $licenseExpiresAt = (new DateTimeImmutable((string) $row['expires_at'], new DateTimeZone('UTC')))->getTimestamp();

        if ($licenseExpiresAt <= time()) {
            karen_fail(403, 'license_expired');
        }
    }

    karen_json(200, [
        'ok' => true,
        'valid' => true,
        'environment' => KAREN_ENV,
        'checked_at' => gmdate('c'),
        'license' => [
            'public_id' => (string) $row['public_id'],
            'product' => (string) $row['product_code'],
            'plan' => (string) $row['plan'],
            'features' => $claims['features'],
            'device_id' => (int) $row['device_id'],
            'device_key_id' => (string) $row['device_key_id'],
            'token_expires_at' => gmdate('c', $claims['exp']),
            'license_expires_at' => $row['expires_at'],
        ],
    ]);
} catch (Throwable $e) {
    error_log('karen staging verify failed: ' . $e->getMessage());
    karen_fail(500, 'verify_failed');
}
