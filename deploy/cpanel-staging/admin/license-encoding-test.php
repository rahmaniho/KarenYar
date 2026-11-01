<?php
declare(strict_types=1);

/**
 * Temporary staging-only contract test for the license key/signature encoding fix.
 * Protected by admin Directory Privacy. Delete this file after a successful test.
 * It does not use a real activation code, does not register a device, and does not
 * read or display financial data, private keys, tokens, or activation codes.
 */

require '/home/karensof/private/karen-staging/bootstrap.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');

if (KAREN_ENV !== 'staging') {
    karen_fail(403, 'staging_only');
}

$adminUser = (string) ($_SERVER['REMOTE_USER'] ?? $_SERVER['PHP_AUTH_USER'] ?? $_SERVER['REDIRECT_REMOTE_USER'] ?? '');
if ($adminUser === '') {
    karen_fail(401, 'admin_auth_required');
}

require_once dirname(__DIR__) . '/v1/license-encoding.php';

function karen_encoding_test_e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$publicKeyB64Url = 'cBb_FcK0BC8SLBqQn_T2G6mRuwZTlPu23SnQrnG-8sc';
$signatureB64Url = 'VV1jS3ibqIQJ1BtFcUTPggiTjVAgJoU03VSxlRdVxy7nOXD3RCr92c6hwPT7XVjKx-40TcZe5qk_UkFGDYHiAA';
$serverNow = time();
$checks = [];

function karen_encoding_test_check(string $name, bool $ok, string $detail): void
{
    global $checks;
    $checks[] = ['name' => $name, 'ok' => $ok, 'detail' => $detail];
}

$decodedPublic = karen_license_decode_key_material($publicKeyB64Url, 32);
karen_encoding_test_check(
    'decode_base64url_public_key_32',
    $decodedPublic !== null && strlen($decodedPublic) === 32,
    'کلید عمومی base64url باید دقیقاً ۳۲ بایت شود.'
);

$decodedSignature = karen_license_decode_key_material($signatureB64Url, 64);
karen_encoding_test_check(
    'decode_base64url_signature_64',
    $decodedSignature !== null && strlen($decodedSignature) === 64,
    'امضای base64url باید دقیقاً ۶۴ بایت شود.'
);

$standardPublic = rtrim(strtr(base64_encode($decodedPublic === null ? '' : $decodedPublic), '+/', '-_'), '=');
karen_encoding_test_check(
    'canonical_roundtrip_public_key',
    $decodedPublic !== null && hash_equals($publicKeyB64Url, $standardPublic),
    'کلید عمومی باید canonical base64url باشد.'
);

$invalidCharacter = karen_license_decode_key_material($publicKeyB64Url . '!', 32);
karen_encoding_test_check(
    'reject_invalid_character',
    $invalidCharacter === null,
    'کاراکتر نامعتبر باید رد شود.'
);

$wrongLength = karen_license_decode_key_material($publicKeyB64Url, 31);
karen_encoding_test_check(
    'reject_wrong_length',
    $wrongLength === null,
    'طول اشتباه باید رد شود.'
);

$nonCanonicalPublic = substr($publicKeyB64Url, 0, -1) . 'd';
$nonCanonicalResult = karen_license_decode_key_material($nonCanonicalPublic, 32);
karen_encoding_test_check(
    'reject_noncanonical_trailing_bits',
    $nonCanonicalResult === null,
    'بیت‌های انتهایی غیرکانونیکال باید رد شوند.'
);

$serverOk = true;
foreach ($checks as $check) {
    if (!$check['ok']) {
        $serverOk = false;
        break;
    }
}

$nonce = base64_encode(random_bytes(18));
header("Content-Security-Policy: default-src 'none'; script-src 'nonce-" . $nonce . "'; style-src 'nonce-" . $nonce . "'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>تست قرارداد encoding لایسنس — staging</title>
  <style nonce="<?php echo $nonce; ?>">
    body { margin: 0; padding: 16px; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: auto; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 14px; padding: 16px; margin: 14px 0; }
    .ok { color: #34d399; }
    .fail { color: #f87171; }
    .warn { color: #fbbf24; }
    .muted { color: #94a3b8; font-size: 13px; line-height: 1.8; }
    button { border: 0; border-radius: 10px; padding: 13px 16px; background: #4f46e5; color: white; cursor: pointer; font: inherit; }
    button:disabled { opacity: .6; cursor: default; }
    pre { direction: ltr; text-align: left; white-space: pre-wrap; word-break: break-word; background: #0b1220; border: 1px solid #334155; border-radius: 10px; padding: 12px; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
<main>
  <h1>تست قرارداد encoding لایسنس</h1>
  <p class="muted">این صفحه موقت است و فقط برای staging است. بعد از موفقیت، فایل <code>admin/license-encoding-test.php</code> را حذف کنید.</p>

  <div class="card">
    <h2>تست سمت سرور</h2>
    <ul>
      <?php foreach ($checks as $check): ?>
        <li class="<?php echo $check['ok'] ? 'ok' : 'fail'; ?>">
          <?php echo karen_encoding_test_e($check['name']); ?> —
          <?php echo $check['ok'] ? 'PASS' : 'FAIL'; ?>
          <span class="muted"><?php echo karen_encoding_test_e($check['detail']); ?></span>
        </li>
      <?php endforeach; ?>
    </ul>
    <p class="<?php echo $serverOk ? 'ok' : 'fail'; ?>">
      نتیجهٔ سمت سرور: <?php echo $serverOk ? 'PASS' : 'FAIL'; ?>
    </p>
  </div>

  <div class="card">
    <h2>تست زندهٔ endpointها</h2>
    <p class="muted">این تست از کد فعال‌سازی واقعی استفاده نمی‌کند و دستگاهی ثبت نمی‌کند. فقط بررسی می‌کند که endpointها ورودی base64url را از نظر encoding رد نکنند.</p>
    <button id="run" type="button">اجرای تست زنده</button>
    <pre id="output">هنوز اجرا نشده است.</pre>
  </div>
</main>

<script nonce="<?php echo $nonce; ?>">
(function () {
  'use strict';

  var SERVER_NOW = <?php echo (int) $serverNow; ?>;
  var PUBLIC_KEY_B64URL = <?php echo json_encode($publicKeyB64Url, JSON_UNESCAPED_SLASHES); ?>;
  var SIGNATURE_B64URL = <?php echo json_encode($signatureB64Url, JSON_UNESCAPED_SLASHES); ?>;
  var SERVER_OK = <?php echo $serverOk ? 'true' : 'false'; ?>;
  var button = document.getElementById('run');
  var output = document.getElementById('output');

  function randomHex(bytes) {
    var array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    var text = '';
    for (var i = 0; i < array.length; i += 1) {
      text += array[i].toString(16).padStart(2, '0');
    }
    return text;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID().toLowerCase();
    var hex = randomHex(16);
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-a' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
  }

  async function postJson(path, body) {
    var response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit'
    });
    var data = null;
    try { data = await response.json(); } catch (e) {}
    return { status: response.status, data: data };
  }

  function line(name, ok, detail) {
    return (ok ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + detail;
  }

  button.addEventListener('click', async function () {
    button.disabled = true;
    output.textContent = 'در حال اجرا...';
    var lines = [];
    var liveOk = true;

    try {
      var activation = await postJson('/v1/activations.php', {
        activation_code: 'ENCODING-TEST-INVALID-CODE',
        device_key_id: uuid(),
        device_public_key_b64: PUBLIC_KEY_B64URL,
        device_label: 'encoding-contract-test',
        product_code: 'hesabyar'
      });
      var activationError = activation.data && activation.data.error ? activation.data.error : 'no_json_error';
      var activationPass = activation.status === 404 && activationError === 'invalid_activation_code';
      if (!activationPass) liveOk = false;
      lines.push(line('activations_base64url_contract', activationPass, 'HTTP ' + activation.status + ' error=' + activationError + ' expected=404 invalid_activation_code'));
    } catch (e) {
      liveOk = false;
      lines.push(line('activations_base64url_contract', false, String(e)));
    }

    try {
      var refresh = await postJson('/v1/refresh.php', {
        device_key_id: uuid(),
        product_code: 'hesabyar',
        timestamp: SERVER_NOW,
        nonce: randomHex(16),
        signature_b64: SIGNATURE_B64URL
      });
      var refreshError = refresh.data && refresh.data.error ? refresh.data.error : 'no_json_error';
      var refreshPass = refresh.status === 404 && refreshError === 'device_or_license_invalid';
      if (!refreshPass) liveOk = false;
      lines.push(line('refresh_base64url_contract', refreshPass, 'HTTP ' + refresh.status + ' error=' + refreshError + ' expected=404 device_or_license_invalid'));
    } catch (e) {
      liveOk = false;
      lines.push(line('refresh_base64url_contract', false, String(e)));
    }

    var overall = SERVER_OK && liveOk;
    lines.unshift(overall ? 'OVERALL PASS' : 'OVERALL FAIL');
    if (!overall) {
      lines.push('اگر error=rate_limited دیدید، حدود ۱۰ دقیقه صبر کنید و فقط یک بار دیگر اجرا کنید.');
    } else {
      lines.push('بعد از موفقیت، این فایل را از پوشه admin حذف کنید: license-encoding-test.php');
    }
    output.textContent = lines.join('\n');
    button.disabled = false;
  });
})();
</script>
</body>
</html>
