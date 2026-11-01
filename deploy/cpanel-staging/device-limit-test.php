<?php
declare(strict_types=1);

require '/home/karensof/private/karen-staging/bootstrap.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');

const KAREN_TEST_CONFIRM = 'STAGING_DEVICE_LIMIT_TEST';
const KAREN_TEST_CUSTOMER = 'STAGING-CUSTOMER-001';
const KAREN_TEMP_LABEL_PREFIX = 'LIMIT-TEST-';

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
        'lifetime' => 0,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

if (empty($_SESSION['karen_device_limit_test_csrf'])) {
    $_SESSION['karen_device_limit_test_csrf'] = bin2hex(random_bytes(32));
}
$csrf = (string) $_SESSION['karen_device_limit_test_csrf'];

$tempFiles = [
    'a' => KAREN_PRIVATE_DIR . '/limit-test-device-a.json',
    'b' => KAREN_PRIVATE_DIR . '/limit-test-device-b.json',
];

try {
    $tokenFile = KAREN_PRIVATE_DIR . '/test-token.json';
    if (!is_file($tokenFile)) {
        karen_fail(500, 'test_token_missing');
    }

    $stored = json_decode((string) file_get_contents($tokenFile), true);
    $originalToken = trim((string) ($stored['token'] ?? ''));
    $parts = explode('.', $originalToken);

    if (!is_array($stored) || strlen($originalToken) > 8192 || count($parts) !== 4 || $parts[0] !== 'HY2') {
        karen_fail(500, 'invalid_test_token');
    }

    $claims = json_decode(karen_b64url_decode($parts[2]), true);
    if (!is_array($claims) || empty($claims['jti']) || !is_string($claims['jti'])
        || empty($claims['device_key_id']) || !is_string($claims['device_key_id'])) {
        karen_fail(500, 'invalid_test_token_claims');
    }

    $pdo = karen_db();

    $stmt = $pdo->prepare(<<<'SQL'
SELECT l.id, l.public_id, l.status, l.max_devices,
       c.reference_code, p.code AS product_code
FROM licenses l
INNER JOIN customers c ON c.id = l.customer_id
INNER JOIN products p ON p.id = l.product_id
WHERE l.public_id = :public_id
LIMIT 1
SQL
    );
    $stmt->bindValue(':public_id', $claims['jti'], PDO::PARAM_STR);
    $stmt->execute();
    $license = $stmt->fetch();

    if (!$license || $license['reference_code'] !== KAREN_TEST_CUSTOMER
        || $license['product_code'] !== 'hesabyar'
        || $license['status'] !== 'active' || (int) $license['max_devices'] !== 2) {
        karen_fail(409, 'unexpected_test_license_state');
    }

    $licenseId = (int) $license['id'];
    $originalDeviceKeyId = strtolower($claims['device_key_id']);

    $stmt = $pdo->prepare(<<<'SQL'
SELECT id, status
FROM license_devices
WHERE license_id = :license_id AND device_key_id = :device_key_id
LIMIT 1
SQL
    );
    $stmt->bindValue(':license_id', $licenseId, PDO::PARAM_INT);
    $stmt->bindValue(':device_key_id', $originalDeviceKeyId, PDO::PARAM_STR);
    $stmt->execute();
    $originalDevice = $stmt->fetch();

    if (!$originalDevice || $originalDevice['status'] !== 'active') {
        karen_fail(409, 'original_device_not_active');
    }

    $readState = static function () use ($pdo, $licenseId, $originalDeviceKeyId): array {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM license_devices WHERE license_id = :license_id AND status = 'active'");
        $stmt->bindValue(':license_id', $licenseId, PDO::PARAM_INT);
        $stmt->execute();
        $activeCount = (int) $stmt->fetchColumn();

        $stmt = $pdo->prepare(<<<'SQL'
SELECT device_label, status
FROM license_devices
WHERE license_id = :license_id AND device_label IN ('LIMIT-TEST-A', 'LIMIT-TEST-B')
SQL
        );
        $stmt->bindValue(':license_id', $licenseId, PDO::PARAM_INT);
        $stmt->execute();
        $tempStatuses = ['a' => null, 'b' => null];
        foreach ($stmt->fetchAll() as $row) {
            if ($row['device_label'] === 'LIMIT-TEST-A') {
                $tempStatuses['a'] = (string) $row['status'];
            }
            if ($row['device_label'] === 'LIMIT-TEST-B') {
                $tempStatuses['b'] = (string) $row['status'];
            }
        }

        $stmt = $pdo->prepare('SELECT status FROM license_devices WHERE license_id = :license_id AND device_key_id = :device_key_id LIMIT 1');
        $stmt->bindValue(':license_id', $licenseId, PDO::PARAM_INT);
        $stmt->bindValue(':device_key_id', $originalDeviceKeyId, PDO::PARAM_STR);
        $stmt->execute();
        $originalStatus = (string) $stmt->fetchColumn();

        return [
            'active_devices' => $activeCount,
            'max_devices' => 2,
            'original_device_status' => $originalStatus,
            'temp_a_status' => $tempStatuses['a'],
            'temp_b_status' => $tempStatuses['b'],
            'checked_at' => gmdate('c'),
        ];
    };

    $revokeTempDevices = static function () use ($pdo, $licenseId): int {
        $stmt = $pdo->prepare(<<<'SQL'
SELECT id, device_key_id, status, device_label
FROM license_devices
WHERE license_id = :license_id AND device_label LIKE 'LIMIT-TEST-%'
FOR UPDATE
SQL
        );
        $stmt->bindValue(':license_id', $licenseId, PDO::PARAM_INT);
        $stmt->execute();
        $tempDevices = $stmt->fetchAll();
        $revoked = 0;

        foreach ($tempDevices as $device) {
            $deviceId = (int) $device['id'];

            $deleteNonces = $pdo->prepare('DELETE FROM device_refresh_nonces WHERE device_id = :device_id');
            $deleteNonces->bindValue(':device_id', $deviceId, PDO::PARAM_INT);
            $deleteNonces->execute();

            // Archive old temporary labels so a later run does not confuse them
            // with the newly created LIMIT-TEST-A / LIMIT-TEST-B devices.
            $archive = $pdo->prepare('UPDATE license_devices SET device_label = :label WHERE id = :id');
            $archive->bindValue(':label', 'LT-ARCHIVE-' . $deviceId, PDO::PARAM_STR);
            $archive->bindValue(':id', $deviceId, PDO::PARAM_INT);
            $archive->execute();

            if ($device['status'] === 'active') {
                $update = $pdo->prepare("UPDATE license_devices SET status = 'revoked' WHERE id = :id");
                $update->bindValue(':id', $deviceId, PDO::PARAM_INT);
                $update->execute();
                $revoked++;

                $event = $pdo->prepare(<<<'SQL'
INSERT INTO license_events (license_id, device_id, event_type, ip_hash, user_agent, meta)
VALUES (:license_id, :device_id, 'device.revoked', :ip_hash, :user_agent, :meta)
SQL
                );
                $event->bindValue(':license_id', $licenseId, PDO::PARAM_INT);
                $event->bindValue(':device_id', $deviceId, PDO::PARAM_INT);
                $event->bindValue(':ip_hash', karen_client_ip_hash(), PDO::PARAM_STR);
                $event->bindValue(':user_agent', substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255), PDO::PARAM_STR);
                $event->bindValue(':meta', json_encode([
                    'environment' => KAREN_ENV,
                    'source' => 'temporary-device-limit-test',
                    'device_label' => $device['device_label'],
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), PDO::PARAM_STR);
                $event->execute();
            }
        }

        return $revoked;
    };

    $deleteTempFiles = static function () use ($tempFiles): void {
        foreach ($tempFiles as $file) {
            if (is_file($file) && !@unlink($file)) {
                throw new RuntimeException('temp_file_delete_failed');
            }
        }
    };

    if ($method === 'POST') {
        $input = karen_read_json();
        $suppliedCsrf = $input['csrf'] ?? '';
        if (!is_string($suppliedCsrf) || !hash_equals($csrf, $suppliedCsrf)) {
            karen_fail(403, 'invalid_test_csrf');
        }

        $action = $input['action'] ?? '';
        if (!in_array($action, ['state', 'prepare', 'cleanup', 'prepare_original_verify'], true)) {
            karen_fail(400, 'invalid_test_action');
        }

        karen_rate_limit('device-limit-test:' . bin2hex(karen_client_ip_hash()), 60, 300);

        if ($action === 'state') {
            karen_json(200, ['ok' => true, 'state' => $readState()]);
        }

        if ($action === 'prepare_original_verify') {
            karen_json(200, ['ok' => true, 'token' => $originalToken, 'state' => $readState()]);
        }

        if ($action === 'prepare') {
            if (!function_exists('sodium_crypto_sign_keypair')) {
                karen_fail(500, 'sodium_missing');
            }

            $pdo->beginTransaction();
            try {
                $lock = $pdo->prepare('SELECT id FROM licenses WHERE id = :id FOR UPDATE');
                $lock->bindValue(':id', $licenseId, PDO::PARAM_INT);
                $lock->execute();
                $revokeTempDevices();
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }

            $deleteTempFiles();
            $publicDevices = [];

            foreach (['a' => 'LIMIT-TEST-A', 'b' => 'LIMIT-TEST-B'] as $key => $label) {
                $keypair = sodium_crypto_sign_keypair();
                $secret = sodium_crypto_sign_secretkey($keypair);
                $public = sodium_crypto_sign_publickey($keypair);
                $deviceKeyId = karen_uuidv4();

                $payload = [
                    'device_key_id' => $deviceKeyId,
                    'secret_key_b64' => base64_encode($secret),
                    'public_key_b64' => base64_encode($public),
                    'label' => $label,
                    'created_at' => gmdate('c'),
                ];

                $written = file_put_contents(
                    $tempFiles[$key],
                    json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n",
                    LOCK_EX
                );

                if ($written === false) {
                    throw new RuntimeException('temp_device_write_failed');
                }
                @chmod($tempFiles[$key], 0600);
                sodium_memzero($secret);
                sodium_memzero($keypair);

                $publicDevices[$key] = [
                    'device_key_id' => $deviceKeyId,
                    'device_public_key_b64' => base64_encode($public),
                    'device_label' => $label,
                ];
            }

            $state = $readState();
            if ($state['active_devices'] !== 1) {
                karen_fail(409, 'unexpected_baseline_active_devices');
            }

            karen_json(200, ['ok' => true, 'devices' => $publicDevices, 'state' => $state]);
        }

        if ($action === 'cleanup') {
            $pdo->beginTransaction();
            try {
                $lock = $pdo->prepare('SELECT id FROM licenses WHERE id = :id FOR UPDATE');
                $lock->bindValue(':id', $licenseId, PDO::PARAM_INT);
                $lock->execute();
                $revokeTempDevices();
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }

            $deleteTempFiles();
            $state = $readState();
            if ($state['active_devices'] !== 1 || $state['original_device_status'] !== 'active') {
                karen_fail(409, 'cleanup_state_unexpected');
            }

            karen_json(200, ['ok' => true, 'state' => $state]);
        }
    }

    $initialState = $readState();
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('karen staging device limit test failed: ' . $e->getMessage());
    karen_fail(500, 'device_limit_test_failed');
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
  <title>تست محدودیت تعداد دستگاه</title>
  <style nonce="<?php echo $nonce; ?>">
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    main { max-width: 720px; margin: auto; padding: 22px; background: #111827; border: 1px solid #334155; border-radius: 16px; }
    h1 { font-size: 20px; }
    p { color: #94a3b8; line-height: 1.9; }
    .warn { color: #fbbf24; }
    .state { padding: 14px; border-radius: 10px; background: #0b1220; line-height: 1.9; }
    label { display: block; margin: 16px 0 8px; }
    input { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #475569; background: #0b1220; color: #e2e8f0; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0; }
    button { border: 0; border-radius: 10px; padding: 13px 16px; background: #4f46e5; color: white; font: inherit; cursor: pointer; }
    button.success { background: #047857; }
    button:disabled { opacity: .55; cursor: wait; }
    pre { direction: ltr; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; background: #0b1220; border: 1px solid #334155; border-radius: 10px; padding: 14px; font-size: 12px; line-height: 1.7; }
  </style>
</head>
<body>
<main>
  <h1>تست محدودیت تعداد دستگاه‌ها</h1>
  <p class="warn">این صفحه موقت است و بعد از تست باید حذف شود. کد فعال‌سازی فقط از فرم زیر به endpoint فعال‌سازی ارسال می‌شود و در خروجی نمایش داده نمی‌شود.</p>
  <p>لایسنس آزمایشی باید حداکثر ۲ دستگاه داشته باشد. دستگاه دوم باید فعال شود، دستگاه سوم باید رد شود، سپس دستگاه‌های موقت پاک‌سازی شوند.</p>
  <div id="state" class="state" role="status" aria-live="polite"><?php
    echo 'دستگاه‌های فعال: ' . (int) $initialState['active_devices'] .
      ' از ' . (int) $initialState['max_devices'] .
      ' | دستگاه اصلی: ' . htmlspecialchars((string) $initialState['original_device_status'], ENT_QUOTES, 'UTF-8');
  ?></div>
  <div id="js-status" class="state">JS: اجرا نشده</div>
  <script nonce="<?php echo $nonce; ?>">
    document.getElementById('js-status').textContent = 'JS: اجرا شد';
    window.addEventListener('error', function (event) {
      var box = document.getElementById('output');
      if (box) box.textContent = 'JS_ERROR: ' + (event.message || 'unknown');
    });
  </script>

  <label for="activation_code">کد فعال‌سازی آزمایشی</label>
  <input id="activation_code" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="KS-STAGE-...">

  <div class="actions">
    <button id="prepare" type="button">۱٫ آماده‌سازی دستگاه‌های موقت</button>
    <button id="run" type="button">۲٫ اجرای تست محدودیت</button>
    <button id="cleanup" class="success" type="button">۳٫ پاک‌سازی و بررسی نهایی</button>
  </div>

  <pre id="output">منتظر تست...</pre>
</main>
<script nonce="<?php echo $nonce; ?>">
const CSRF = <?php echo json_encode($csrf); ?>;
const INITIAL_STATE = <?php echo json_encode($initialState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
const output = document.getElementById('output');
const stateBox = document.getElementById('state');
const buttons = Array.from(document.querySelectorAll('button'));
let preparedDevices = null;

function showState(state) {
  stateBox.textContent =
    'دستگاه‌های فعال: ' + state.active_devices + ' از ' + state.max_devices +
    ' | دستگاه اصلی: ' + state.original_device_status +
    ' | موقت A: ' + (state.temp_a_status || 'ثبت نشده') +
    ' | موقت B: ' + (state.temp_b_status || 'ثبت نشده');
}

async function control(action, extra = {}) {
  const response = await fetch('?confirm=STAGING_DEVICE_LIMIT_TEST', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, csrf: CSRF, ...extra })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || ('http_' + response.status));
  return data;
}

async function endpoint(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

document.getElementById('prepare').addEventListener('click', () => busy(async () => {
  const result = await control('prepare');
  preparedDevices = result.devices;
  showState(result.state);
  output.textContent = JSON.stringify({ result: 'PREPARED', state: result.state, next: 'enter_activation_code_then_run' }, null, 2);
}));

document.getElementById('run').addEventListener('click', () => busy(async () => {
  if (!preparedDevices) throw new Error('prepare_devices_first');
  const activationCode = document.getElementById('activation_code').value.trim();
  if (!activationCode) throw new Error('activation_code_required');

  const payloadA = {
    product_code: 'hesabyar',
    activation_code: activationCode,
    device_key_id: preparedDevices.a.device_key_id,
    device_public_key_b64: preparedDevices.a.device_public_key_b64,
    device_label: preparedDevices.a.device_label
  };
  const payloadB = {
    product_code: 'hesabyar',
    activation_code: activationCode,
    device_key_id: preparedDevices.b.device_key_id,
    device_public_key_b64: preparedDevices.b.device_public_key_b64,
    device_label: preparedDevices.b.device_label
  };

  const second = await endpoint('v1/activations.php', payloadA);
  if (second.status === 429) {
    output.textContent = JSON.stringify({
      result: 'RATE_LIMITED',
      error: second.data.error ?? 'rate_limited',
      retry_after_seconds: 360,
      next: 'cleanup_then_wait_six_to_ten_minutes_before_one_new_run'
    }, null, 2);
    return;
  }

  const third = await endpoint('v1/activations.php', payloadB);
  if (third.status === 429) {
    output.textContent = JSON.stringify({
      result: 'RATE_LIMITED',
      error: third.data.error ?? 'rate_limited',
      retry_after_seconds: 360,
      next: 'cleanup_then_wait_six_to_ten_minutes_before_one_new_run'
    }, null, 2);
    return;
  }

  const reuse = await endpoint('v1/activations.php', payloadA);
  if (reuse.status === 429) {
    output.textContent = JSON.stringify({
      result: 'RATE_LIMITED',
      error: reuse.data.error ?? 'rate_limited',
      retry_after_seconds: 360,
      next: 'cleanup_then_wait_six_to_ten_minutes_before_one_new_run'
    }, null, 2);
    return;
  }

  const stateResult = await control('state');
  const state = stateResult.state;
  showState(state);

  const checks = [
    { test: 'second_device_activation', passed: second.status === 200 && second.data.ok === true,
      http_status: second.status, ok: second.data.ok ?? null, error: second.data.error ?? null },
    { test: 'third_device_blocked', passed: third.status === 403 && third.data.error === 'device_limit_reached',
      http_status: third.status, error: third.data.error ?? null },
    { test: 'second_device_reuse', passed: reuse.status === 200 && reuse.data.ok === true,
      http_status: reuse.status, ok: reuse.data.ok ?? null, error: reuse.data.error ?? null },
    { test: 'active_device_count', passed: state.active_devices === 2 && state.temp_b_status === null,
      active_devices: state.active_devices, temp_b_status: state.temp_b_status }
  ];

  output.textContent = JSON.stringify({
    result: checks.every(check => check.passed) ? 'PASS' : 'FAIL',
    mode: 'device_limit',
    checks,
    next: 'cleanup_and_final_check'
  }, null, 2);
}));

document.getElementById('cleanup').addEventListener('click', () => busy(async () => {
  const cleanup = await control('cleanup');
  showState(cleanup.state);
  preparedDevices = null;
  document.getElementById('activation_code').value = '';

  const preparedVerify = await control('prepare_original_verify');
  const verify = await endpoint('v1/verify.php', { token: preparedVerify.token, product_code: 'hesabyar' });
  const passed = cleanup.state.active_devices === 1 &&
    cleanup.state.original_device_status === 'active' &&
    verify.status === 200 && verify.data.ok === true && verify.data.valid === true;

  output.textContent = JSON.stringify({
    result: passed ? 'PASS' : 'FAIL',
    mode: 'cleanup',
    state: cleanup.state,
    original_verify: { http_status: verify.status, valid: verify.data.valid ?? null, error: verify.data.error ?? null },
    next: passed ? 'delete_this_test_page' : 'send_error_output'
  }, null, 2);
}));

showState(INITIAL_STATE);
</script>
</body>
</html>
