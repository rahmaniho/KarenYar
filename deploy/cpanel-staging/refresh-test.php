<?php
declare(strict_types=1);

require '/home/karensof/private/karen-staging/bootstrap.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

const KAREN_TEST_CONFIRM = 'STAGING_REFRESH_TEST';

if (!isset($_GET['confirm']) || $_GET['confirm'] !== KAREN_TEST_CONFIRM) {
    karen_fail(400, 'confirm_required');
}

$deviceFile = KAREN_PRIVATE_DIR . '/test-device.json';
$tokenFile = KAREN_PRIVATE_DIR . '/test-token.json';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset($_GET['save_token'])) {
    $input = karen_read_json();
    $token = trim((string) ($input['token'] ?? ''));

    if ($token === '' || strlen($token) > 8192 || substr($token, 0, 4) !== 'HY2.') {
        karen_fail(400, 'invalid_token');
    }

    $payload = [
        'token' => $token,
        'license' => $input['license'] ?? null,
        'saved_at' => gmdate('c'),
    ];

    $written = file_put_contents(
        $tokenFile,
        json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n",
        LOCK_EX
    );

    if ($written === false) {
        karen_fail(500, 'token_save_failed');
    }

    @chmod($tokenFile, 0600);
    karen_json(200, ['ok' => true]);
}

if (!function_exists('sodium_crypto_sign_detached')) {
    karen_fail(500, 'sodium_missing');
}

try {
    if (!is_file($deviceFile)) {
        throw new RuntimeException('test_device_missing');
    }

    $device = json_decode((string) file_get_contents($deviceFile), true);

    if (!is_array($device) || empty($device['device_key_id']) || empty($device['secret_key_b64'])) {
        throw new RuntimeException('invalid_test_device');
    }

    $deviceKeyId = strtolower((string) $device['device_key_id']);
    $secret = base64_decode((string) $device['secret_key_b64'], true);

    if ($secret === false || strlen($secret) !== 64) {
        throw new RuntimeException('invalid_test_device_secret');
    }

    $productCode = 'hesabyar';
    $timestamp = time();
    $nonce = bin2hex(random_bytes(16));

    $message = implode("\n", [
        'karen-license-refresh-v1',
        $productCode,
        $deviceKeyId,
        (string) $timestamp,
        $nonce,
    ]);

    $signature = sodium_crypto_sign_detached($message, $secret);
    sodium_memzero($secret);

    $requestPayload = [
        'product_code' => $productCode,
        'device_key_id' => $deviceKeyId,
        'timestamp' => $timestamp,
        'nonce' => $nonce,
        'signature_b64' => base64_encode($signature),
    ];
} catch (Throwable $e) {
    error_log('karen staging refresh test failed: ' . $e->getMessage());
    karen_fail(500, 'refresh_test_prepare_failed');
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>تست تمدید لایسنس - staging</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 24px; background: #0f172a; color: #e2e8f0; }
    .card { max-width: 720px; margin: 0 auto; background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 24px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    p { color: #94a3b8; line-height: 1.8; }
    button { margin-top: 16px; padding: 12px 18px; border: 0; border-radius: 10px; background: #10b981; color: white; cursor: pointer; }
    button:disabled { opacity: .6; cursor: default; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0b1220; border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-top: 20px; }
    .warn { color: #fbbf24; }
  </style>
</head>
<body>
  <div class="card">
    <h1>تست تمدید/refresh لایسنس در staging</h1>
    <p class="warn">این صفحه فقط برای تست آزمایشی است و بعد از پایان تست باید حذف شود.</p>
    <p>این صفحه با کلید خصوصی دستگاه آزمایشی یک درخواست امضاشده می‌سازد و به endpoint تمدید می‌فرستد. کلید خصوصی در صفحه نمایش داده نمی‌شود.</p>

    <button id="refresh-btn" type="button">تمدید آزمایشی لایسنس</button>

    <pre id="output">منتظر تست...</pre>
  </div>

  <script>
    const REQUEST_PAYLOAD = <?php echo json_encode($requestPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
    const output = document.getElementById('output');
    const button = document.getElementById('refresh-btn');

    button.addEventListener('click', async () => {
      button.disabled = true;
      output.textContent = 'در حال ارسال...';

      try {
        const response = await fetch('v1/refresh.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(REQUEST_PAYLOAD)
        });

        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { ok: false, error: 'invalid_json_response', raw: text }; }

        output.textContent = JSON.stringify({ http_status: response.status, ...data }, null, 2);

        if (response.ok && data.ok && data.token) {
          await fetch('?confirm=STAGING_REFRESH_TEST&save_token=1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: data.token, license: data.license || null })
          });
        }
      } catch (err) {
        output.textContent = JSON.stringify({ ok: false, error: 'network_error', message: String(err) }, null, 2);
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>
