<?php
declare(strict_types=1);

require '/home/karensof/private/karen-staging/bootstrap.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

const KAREN_TEST_CONFIRM = 'STAGING_ACTIVATION_TEST';

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

if (!function_exists('sodium_crypto_sign_keypair')) {
    karen_fail(500, 'sodium_missing');
}

try {
    if (is_file($deviceFile)) {
        $device = json_decode((string) file_get_contents($deviceFile), true);

        if (!is_array($device) || empty($device['device_key_id']) || empty($device['public_key_b64']) || empty($device['secret_key_b64'])) {
            throw new RuntimeException('invalid_test_device');
        }
    } else {
        $keypair = sodium_crypto_sign_keypair();
        $secret = sodium_crypto_sign_secretkey($keypair);
        $public = sodium_crypto_sign_publickey($keypair);

        $device = [
            'device_key_id' => karen_uuidv4(),
            'secret_key_b64' => base64_encode($secret),
            'public_key_b64' => base64_encode($public),
            'label' => 'Staging test device',
            'created_at' => gmdate('c'),
        ];

        $written = file_put_contents(
            $deviceFile,
            json_encode($device, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n",
            LOCK_EX
        );

        if ($written === false) {
            throw new RuntimeException('test_device_write_failed');
        }

        @chmod($deviceFile, 0600);
        sodium_memzero($secret);
        sodium_memzero($keypair);
    }
} catch (Throwable $e) {
    error_log('karen staging test device failed: ' . $e->getMessage());
    karen_fail(500, 'test_device_failed');
}

$publicDevice = [
    'device_key_id' => (string) $device['device_key_id'],
    'device_public_key_b64' => (string) $device['public_key_b64'],
];
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>تست فعال‌سازی لایسنس - staging</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 24px; background: #0f172a; color: #e2e8f0; }
    .card { max-width: 720px; margin: 0 auto; background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 24px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    p { color: #94a3b8; line-height: 1.8; }
    label { display: block; margin: 16px 0 8px; }
    input { width: 100%; box-sizing: border-box; padding: 12px; border-radius: 10px; border: 1px solid #475569; background: #0b1220; color: #e2e8f0; }
    button { margin-top: 16px; padding: 12px 18px; border: 0; border-radius: 10px; background: #4f46e5; color: white; cursor: pointer; }
    button:disabled { opacity: .6; cursor: default; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0b1220; border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-top: 20px; }
    .warn { color: #fbbf24; }
    code { direction: ltr; display: inline-block; }
  </style>
</head>
<body>
  <div class="card">
    <h1>تست فعال‌سازی لایسنس در staging</h1>
    <p class="warn">این صفحه فقط برای تست آزمایشی است و بعد از پایان تست باید حذف شود.</p>
    <p>این صفحه یک دستگاه آزمایشی می‌سازد و کد فعال‌سازی را به endpoint فعال‌سازی می‌فرستد. کلید خصوصی دستگاه آزمایشی فقط در پوشه private ذخیره می‌شود و در صفحه نمایش داده نمی‌شود.</p>

    <form id="activation-form">
      <label for="activation_code">کد فعال‌سازی آزمایشی</label>
      <input id="activation_code" name="activation_code" autocomplete="off" required placeholder="KS-STAGE-...">

      <label for="device_label">نام دستگاه آزمایشی</label>
      <input id="device_label" name="device_label" value="Staging test device" maxlength="190">

      <button id="submit-btn" type="submit">فعال‌سازی آزمایشی</button>
    </form>

    <pre id="output">منتظر تست...</pre>
  </div>

  <script>
    const DEVICE = <?php echo json_encode($publicDevice, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
    const form = document.getElementById('activation-form');
    const output = document.getElementById('output');
    const button = document.getElementById('submit-btn');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      button.disabled = true;
      output.textContent = 'در حال ارسال...';

      const payload = {
        product_code: 'hesabyar',
        activation_code: document.getElementById('activation_code').value.trim(),
        device_key_id: DEVICE.device_key_id,
        device_public_key_b64: DEVICE.device_public_key_b64,
        device_label: document.getElementById('device_label').value.trim() || 'Staging test device'
      };

      try {
        const response = await fetch('v1/activations.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { ok: false, error: 'invalid_json_response', raw: text }; }

        output.textContent = JSON.stringify({ http_status: response.status, ...data }, null, 2);

        if (response.ok && data.ok && data.token) {
          await fetch('?confirm=STAGING_ACTIVATION_TEST&save_token=1', {
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
