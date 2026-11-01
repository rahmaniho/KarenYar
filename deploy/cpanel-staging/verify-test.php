<?php
declare(strict_types=1);

require '/home/karensof/private/karen-staging/bootstrap.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

const KAREN_TEST_CONFIRM = 'STAGING_VERIFY_TEST';

if (!isset($_GET['confirm']) || $_GET['confirm'] !== KAREN_TEST_CONFIRM) {
    karen_fail(400, 'confirm_required');
}

$tokenFile = KAREN_PRIVATE_DIR . '/test-token.json';

if (!is_file($tokenFile)) {
    karen_fail(500, 'test_token_missing');
}

$stored = json_decode((string) file_get_contents($tokenFile), true);

if (!is_array($stored) || empty($stored['token'])) {
    karen_fail(500, 'invalid_test_token');
}

$token = trim((string) $stored['token']);

if ($token === '' || substr($token, 0, 4) !== 'HY2.') {
    karen_fail(500, 'invalid_test_token');
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>تست بررسی لایسنس - staging</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 24px; background: #0f172a; color: #e2e8f0; }
    .card { max-width: 760px; margin: 0 auto; background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 24px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    p { color: #94a3b8; line-height: 1.8; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
    button { padding: 12px 18px; border: 0; border-radius: 10px; background: #4f46e5; color: white; cursor: pointer; }
    button.secondary { background: #334155; }
    button.danger { background: #e11d48; }
    button:disabled { opacity: .6; cursor: default; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0b1220; border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-top: 20px; }
    .warn { color: #fbbf24; }
  </style>
</head>
<body>
  <div class="card">
    <h1>تست بررسی/verify لایسنس در staging</h1>
    <p class="warn">این صفحه فقط برای تست آزمایشی است و بعد از پایان تست باید حذف شود.</p>
    <p>نسخه ۲: در تست دست‌کاری، پلن داخل توکن تغییر می‌کند و امضا ثابت می‌ماند. توکن در خروجی نمایش داده نمی‌شود، اما در سورس این صفحهٔ آزمایشی قرار دارد؛ پس از تست صفحه را حذف کنید.</p>

    <div class="actions">
      <button id="verify-valid" type="button">توکن معتبر</button>
      <button id="verify-tampered" type="button" class="danger">توکن دست‌کاری‌شده</button>
      <button id="verify-wrong-product" type="button" class="secondary">محصول اشتباه</button>
    </div>

    <pre id="output">منتظر تست...</pre>
  </div>

  <script>
    const TOKEN = <?php echo json_encode($token, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
    const output = document.getElementById('output');
    const buttons = Array.from(document.querySelectorAll('button'));

    async function runVerify(label, payload) {
      buttons.forEach((button) => button.disabled = true);
      output.textContent = 'در حال ارسال: ' + label;

      try {
        const response = await fetch('v1/verify.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { ok: false, error: 'invalid_json_response', raw: text }; }

        output.textContent = JSON.stringify({ test: label, http_status: response.status, ...data }, null, 2);
      } catch (err) {
        output.textContent = JSON.stringify({ ok: false, error: 'network_error', message: String(err) }, null, 2);
      } finally {
        buttons.forEach((button) => button.disabled = false);
      }
    }

    document.getElementById('verify-valid').addEventListener('click', () => {
      runVerify('valid_token', {
        product_code: 'hesabyar',
        token: TOKEN
      });
    });

    document.getElementById('verify-tampered').addEventListener('click', () => {
      try {
        const parts = TOKEN.split('.');
        if (parts.length !== 4) throw new Error('invalid_test_token');

        // Change signed claims, not unused padding bits in the signature.
        const payloadBase64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
        const payloadBytes = Uint8Array.from(
          atob(payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, '=')),
          (character) => character.charCodeAt(0)
        );
        const claims = JSON.parse(new TextDecoder().decode(payloadBytes));
        claims.plan = claims.plan === 'pro' ? 'proplus' : 'pro';

        const changedBytes = new TextEncoder().encode(JSON.stringify(claims));
        let binary = '';
        changedBytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        parts[2] = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const tampered = parts.join('.');
        if (tampered === TOKEN) throw new Error('token_was_not_changed');

        runVerify('changed_plan', {
          product_code: 'hesabyar',
          token: tampered
        });
      } catch (err) {
        output.textContent = JSON.stringify({
          ok: false,
          error: 'test_setup_failed',
          message: String(err)
        }, null, 2);
      }
    });

    document.getElementById('verify-wrong-product').addEventListener('click', () => {
      runVerify('wrong_product', {
        product_code: 'another-product',
        token: TOKEN
      });
    });
  </script>
</body>
</html>
