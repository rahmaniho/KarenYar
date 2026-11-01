<?php
declare(strict_types=1);

require '/home/karensof/private/karen-staging/bootstrap.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');

const KAREN_TEST_CONFIRM = 'STAGING_LICENSE_REVOCATION_TEST';
const KAREN_TEST_CUSTOMER = 'STAGING-CUSTOMER-001';

if (KAREN_ENV !== 'staging') {
    karen_fail(403, 'staging_only');
}
$confirm = $_GET['confirm'] ?? '';
if (!is_string($confirm) || $confirm !== KAREN_TEST_CONFIRM) {
    karen_fail(400, 'confirm_required');
}
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    karen_fail(405, 'method_not_allowed');
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_set_cookie_params([
        'lifetime' => 0, 'path' => '/', 'secure' => true,
        'httponly' => true, 'samesite' => 'Strict',
    ]);
    session_start();
}
if (empty($_SESSION['karen_license_revocation_csrf'])) {
    $_SESSION['karen_license_revocation_csrf'] = bin2hex(random_bytes(32));
}
$csrf = (string) $_SESSION['karen_license_revocation_csrf'];

try {
    $deviceFile = KAREN_PRIVATE_DIR . '/test-device.json';
    $tokenFile = KAREN_PRIVATE_DIR . '/test-token.json';
    if (!is_file($deviceFile) || !is_file($tokenFile)) {
        karen_fail(500, 'test_files_missing');
    }
    $device = json_decode((string) file_get_contents($deviceFile), true);
    $stored = json_decode((string) file_get_contents($tokenFile), true);
    if (!is_array($device) || !is_array($stored)) {
        karen_fail(500, 'invalid_test_files');
    }

    $deviceKeyId = strtolower(trim((string) ($device['device_key_id'] ?? '')));
    $token = trim((string) ($stored['token'] ?? ''));
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $deviceKeyId)) {
        karen_fail(500, 'invalid_test_device_id');
    }
    $parts = explode('.', $token);
    if (strlen($token) > 8192 || count($parts) !== 4 || $parts[0] !== 'HY2') {
        karen_fail(500, 'invalid_test_token');
    }
    $claims = json_decode(karen_b64url_decode($parts[2]), true);
    if (!is_array($claims) || empty($claims['jti']) || !is_string($claims['jti'])
        || ($claims['device_key_id'] ?? '') !== $deviceKeyId) {
        karen_fail(500, 'test_token_device_mismatch');
    }

    $pdo = karen_db();
    $column = $pdo->query("SHOW COLUMNS FROM licenses LIKE 'status'")->fetch();
    $type = (string) ($column['Type'] ?? '');
    $blockStatus = '';
    foreach (['revoked', 'suspended'] as $candidate) {
        if (strpos($type, "'" . $candidate . "'") !== false) {
            $blockStatus = $candidate;
            break;
        }
    }
    if ($blockStatus === '') {
        karen_fail(409, 'blocking_status_not_in_schema');
    }

    // Lock the license before reading its device, matching activation's lock order.
    $readState = static function (bool $lock) use ($pdo, $claims, $deviceKeyId, $blockStatus): array {
        $sql = <<<'SQL'
SELECT l.id, l.public_id, l.status, c.reference_code, p.code AS product_code
FROM licenses l
INNER JOIN customers c ON c.id = l.customer_id
INNER JOIN products p ON p.id = l.product_id
WHERE l.public_id = :public_id
LIMIT 1
SQL;
        $stmt = $pdo->prepare($sql . ($lock ? "\nFOR UPDATE" : ''));
        $stmt->bindValue(':public_id', $claims['jti'], PDO::PARAM_STR);
        $stmt->execute();
        $license = $stmt->fetch();
        if (!$license) {
            throw new RuntimeException('test_license_not_found');
        }

        $stmt = $pdo->prepare(<<<'SQL'
SELECT id, device_key_id, device_label, status
FROM license_devices
WHERE license_id = :license_id AND device_key_id = :device_key_id
LIMIT 1
SQL
        );
        $stmt->bindValue(':license_id', (int) $license['id'], PDO::PARAM_INT);
        $stmt->bindValue(':device_key_id', $deviceKeyId, PDO::PARAM_STR);
        $stmt->execute();
        $deviceRow = $stmt->fetch();

        if (!$deviceRow || $license['reference_code'] !== KAREN_TEST_CUSTOMER
            || $license['product_code'] !== 'hesabyar'
            || $deviceRow['status'] !== 'active'
            || (int) ($claims['device_id'] ?? 0) !== (int) $deviceRow['id']
            || !in_array($license['status'], ['active', $blockStatus], true)) {
            throw new RuntimeException('unexpected_test_license_state');
        }
        return [
            'license' => $license,
            'device' => $deviceRow,
            'public' => [
                'license_status' => (string) $license['status'],
                'device_status' => (string) $deviceRow['status'],
                'device_label' => (string) $deviceRow['device_label'],
                'blocking_status' => $blockStatus,
                'checked_at' => gmdate('c'),
            ],
        ];
    };

    $initial = $readState(false);

    if ($method === 'POST') {
        $input = karen_read_json();
        $suppliedCsrf = $input['csrf'] ?? '';
        if (!is_string($suppliedCsrf) || !hash_equals($csrf, $suppliedCsrf)) {
            karen_fail(403, 'invalid_test_csrf');
        }
        $action = $input['action'] ?? '';
        if (!in_array($action, ['prepare_verify', 'prepare_refresh', 'set_license_status'], true)) {
            karen_fail(400, 'invalid_test_action');
        }
        karen_rate_limit('license-revocation-test:' . bin2hex(karen_client_ip_hash()), 40, 300);

        if ($action === 'prepare_verify') {
            $state = $readState(false);
            karen_json(200, ['ok' => true, 'token' => $token, 'state' => $state['public']]);
        }
        if ($action === 'prepare_refresh') {
            if (!function_exists('sodium_crypto_sign_detached')) {
                karen_fail(500, 'sodium_missing');
            }
            $secret = base64_decode((string) ($device['secret_key_b64'] ?? ''), true);
            if ($secret === false || strlen($secret) !== 64) {
                karen_fail(500, 'invalid_test_device_secret');
            }
            $timestamp = time();
            $nonce = bin2hex(random_bytes(16));
            $message = implode("\n", [
                'karen-license-refresh-v1', 'hesabyar', $deviceKeyId, (string) $timestamp, $nonce,
            ]);
            $signature = sodium_crypto_sign_detached($message, $secret);
            sodium_memzero($secret);
            $state = $readState(false);
            karen_json(200, [
                'ok' => true,
                'state' => $state['public'],
                'request' => [
                    'product_code' => 'hesabyar',
                    'device_key_id' => $deviceKeyId,
                    'timestamp' => $timestamp,
                    'nonce' => $nonce,
                    'signature_b64' => base64_encode($signature),
                ],
            ]);
        }

        $target = $input['target_status'] ?? '';
        if (!in_array($target, ['active', $blockStatus], true)) {
            karen_fail(400, 'invalid_target_status');
        }
        $pdo->beginTransaction();
        try {
            $state = $readState(true);
            if ($state['license']['status'] !== $target) {
                $stmt = $pdo->prepare('UPDATE licenses SET status = :status WHERE id = :id');
                $stmt->bindValue(':status', $target, PDO::PARAM_STR);
                $stmt->bindValue(':id', (int) $state['license']['id'], PDO::PARAM_INT);
                $stmt->execute();

                $stmt = $pdo->prepare(<<<'SQL'
INSERT INTO license_events (license_id, device_id, event_type, ip_hash, user_agent, meta)
VALUES (:license_id, :device_id, :event_type, :ip_hash, :user_agent, :meta)
SQL
                );
                $stmt->bindValue(':license_id', (int) $state['license']['id'], PDO::PARAM_INT);
                $stmt->bindValue(':device_id', (int) $state['device']['id'], PDO::PARAM_INT);
                $stmt->bindValue(':event_type', $target === 'active' ? 'license.reactivated' : 'license.revoked', PDO::PARAM_STR);
                $stmt->bindValue(':ip_hash', karen_client_ip_hash(), PDO::PARAM_STR);
                $stmt->bindValue(':user_agent', substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255), PDO::PARAM_STR);
                $stmt->bindValue(':meta', json_encode([
                    'environment' => KAREN_ENV,
                    'source' => 'temporary-staging-test',
                    'previous_status' => $state['license']['status'],
                    'new_status' => $target,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), PDO::PARAM_STR);
                $stmt->execute();
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        $state = $readState(false);
        karen_json(200, ['ok' => true, 'state' => $state['public']]);
    }
    $initialState = $initial['public'];
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('karen staging license revocation test failed: ' . $e->getMessage());
    karen_fail(500, 'license_revocation_test_failed');
}

$nonce = base64_encode(random_bytes(18));
header("Content-Security-Policy: default-src 'none'; script-src 'nonce-" . $nonce . "'; style-src 'nonce-" . $nonce . "'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>تست لغو موقت لایسنس</title>
  <style nonce="<?php echo $nonce; ?>">
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    main { max-width: 720px; margin: auto; padding: 22px; background: #111827; border: 1px solid #334155; border-radius: 16px; }
    h1 { font-size: 20px; }
    p { color: #94a3b8; line-height: 1.9; }
    .warn { color: #fbbf24; }
    .state { padding: 14px; border-radius: 10px; background: #0b1220; line-height: 1.9; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0; }
    button { border: 0; border-radius: 10px; padding: 13px 16px; background: #4f46e5; color: white; font: inherit; cursor: pointer; }
    button.danger { background: #e11d48; }
    button.success { background: #047857; }
    button:disabled { opacity: .55; cursor: wait; }
    pre { direction: ltr; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; background: #0b1220; border: 1px solid #334155; border-radius: 10px; padding: 14px; font-size: 12px; line-height: 1.7; }
  </style>
</head>
<body>
<main>
  <h1>تست لغو موقت کل لایسنس آزمایشی</h1>
  <p class="warn">این صفحه فقط برای لایسنس آزمایشی است و بعد از تست باید حذف شود. دستگاه را تغییر نمی‌دهد؛ فقط وضعیت همین لایسنس را موقتاً عوض می‌کند.</p>
  <p>ترتیب: لغو موقت ← اجرای تست‌ها ← فعال‌کردن دوباره ← اجرای مجدد تست‌ها. لایسنس را در پایان active نگه دارید.</p>
  <div id="state" class="state" role="status" aria-live="polite"></div>
  <div class="actions">
    <button id="revoke" class="danger" type="button">۱٫ لغو موقت لایسنس</button>
    <button id="check" type="button">۲٫ اجرای تست‌ها</button>
    <button id="restore" class="success" type="button">۳٫ فعال‌کردن دوباره</button>
  </div>
  <pre id="output">منتظر تست...</pre>
</main>
<script nonce="<?php echo $nonce; ?>">
const CSRF = <?php echo json_encode($csrf); ?>;
const INITIAL_STATE = <?php echo json_encode($initialState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
const output = document.getElementById('output');
const stateBox = document.getElementById('state');
const buttons = Array.from(document.querySelectorAll('button'));
function showState(state) {
  stateBox.textContent = 'وضعیت لایسنس: ' + state.license_status +
    ' | وضعیت دستگاه: ' + state.device_status + ' | ' + state.device_label;
  document.getElementById('revoke').textContent = '۱٫ لغو موقت لایسنس (' + state.blocking_status + ')';
}
async function control(action, extra = {}) {
  const response = await fetch('?confirm=STAGING_LICENSE_REVOCATION_TEST', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, csrf: CSRF, ...extra })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || ('http_' + response.status));
  return data;
}
async function endpoint(path, payload) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: 'invalid_json_response' }; }
  return { status: response.status, data };
}
async function busy(work) {
  buttons.forEach(button => button.disabled = true);
  output.textContent = 'در حال انجام تست...';
  try { await work(); }
  catch (error) {
    output.textContent = JSON.stringify({ result: 'ERROR', error: String(error.message || error) }, null, 2);
  } finally { buttons.forEach(button => button.disabled = false); }
}
async function changeStatus(target) {
  await busy(async () => {
    const result = await control('set_license_status', { target_status: target });
    showState(result.state);
    output.textContent = JSON.stringify({
      result: 'STATUS_UPDATED', state: result.state,
      next: target === 'active' ? 'run_tests_again' : 'run_tests_then_restore'
    }, null, 2);
  });
}
document.getElementById('revoke').addEventListener('click', () => changeStatus(INITIAL_STATE.blocking_status));
document.getElementById('restore').addEventListener('click', () => changeStatus('active'));
document.getElementById('check').addEventListener('click', () => busy(async () => {
  const preparedVerify = await control('prepare_verify');
  const verify = await endpoint('v1/verify.php', { token: preparedVerify.token, product_code: 'hesabyar' });
  const preparedRefresh = await control('prepare_refresh');
  if (preparedVerify.state.license_status !== preparedRefresh.state.license_status ||
      preparedVerify.state.device_status !== preparedRefresh.state.device_status) {
    throw new Error('state_changed_retry');
  }
  const refresh = await endpoint('v1/refresh.php', preparedRefresh.request);
  const blocked = preparedRefresh.state.license_status !== 'active';
  const verifyPassed = blocked
    ? verify.status === 403 && verify.data.error === 'license_not_active'
    : verify.status === 200 && verify.data.ok === true && verify.data.valid === true;
  const refreshPassed = blocked
    ? refresh.status === 404 && refresh.data.error === 'device_or_license_invalid'
    : refresh.status === 200 && refresh.data.ok === true && typeof refresh.data.token === 'string';
  // Never display tokens, signatures, activation codes or private keys.
  output.textContent = JSON.stringify({
    result: verifyPassed && refreshPassed ? 'PASS' : 'FAIL',
    mode: blocked ? 'blocked_license' : 'active_license',
    state: preparedRefresh.state,
    checks: [
      { test: 'verify', passed: verifyPassed, http_status: verify.status,
        valid: verify.data.valid ?? null, error: verify.data.error ?? null },
      { test: 'refresh', passed: refreshPassed, http_status: refresh.status,
        ok: refresh.data.ok ?? null, error: refresh.data.error ?? null }
    ],
    next: blocked ? 'restore_license_then_run_tests_again' : 'finish_and_delete_this_test_page'
  }, null, 2);
}));
showState(INITIAL_STATE);
</script>
</body>
</html>
