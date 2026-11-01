<?php
declare(strict_types=1);

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

if (empty($_SESSION['karen_issue_license_csrf'])) {
    $_SESSION['karen_issue_license_csrf'] = bin2hex(random_bytes(32));
}
$csrf = (string) $_SESSION['karen_issue_license_csrf'];

function karen_issue_e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$error = '';
$issued = null;

if (isset($_GET['created'])) {
    if (!empty($_SESSION['karen_issue_license_flash']) && is_array($_SESSION['karen_issue_license_flash'])) {
        $issued = $_SESSION['karen_issue_license_flash'];
        unset($_SESSION['karen_issue_license_flash']);
    } else {
        $error = 'کد فعال‌سازی فقط یک‌بار نمایش داده می‌شود. اگر آن را ندیدی، از پنل اصلی لایسنس صادرشده را بررسی کن و در صورت نیاز یک لایسنس جدید صادر کن.';
    }
}

try {
    $pdo = karen_db();

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $suppliedCsrf = (string) ($_POST['csrf'] ?? '');
        if (!hash_equals($csrf, $suppliedCsrf)) {
            karen_fail(403, 'invalid_csrf');
        }

        karen_rate_limit(
            'admin-issue:' . hash('sha256', $adminUser) . ':' . bin2hex(karen_client_ip_hash()),
            20,
            300
        );

        $customerReference = trim((string) ($_POST['customer_reference'] ?? ''));
        $productCode = trim((string) ($_POST['product_code'] ?? ''));
        $plan = trim((string) ($_POST['plan'] ?? ''));
        $maxDevices = (int) ($_POST['max_devices'] ?? 0);
        $licenseDays = (int) ($_POST['license_days'] ?? 0);
        $activationCodeDays = (int) ($_POST['activation_code_days'] ?? 0);

        if ($customerReference === '' || strlen($customerReference) > 190) {
            karen_fail(400, 'invalid_customer_reference');
        }
        if (!preg_match('/^[a-z0-9_-]{1,64}$/', $productCode)) {
            karen_fail(400, 'invalid_product_code');
        }
        if (!in_array($plan, ['pro', 'proplus'], true)) {
            karen_fail(400, 'invalid_plan');
        }
        if ($maxDevices < 1 || $maxDevices > 20) {
            karen_fail(400, 'invalid_max_devices');
        }
        if ($licenseDays < 1 || $licenseDays > 3650) {
            karen_fail(400, 'invalid_license_days');
        }
        if ($activationCodeDays < 1 || $activationCodeDays > 30 || $activationCodeDays > $licenseDays) {
            karen_fail(400, 'invalid_activation_code_days');
        }

        $stmt = $pdo->prepare("SELECT id, reference_code FROM customers WHERE reference_code = :reference_code AND status = 'active' LIMIT 1");
        $stmt->bindValue(':reference_code', $customerReference, PDO::PARAM_STR);
        $stmt->execute();
        $customer = $stmt->fetch();
        if (!$customer) {
            karen_fail(404, 'customer_not_found');
        }

        $stmt = $pdo->prepare("SELECT id, code FROM products WHERE code = :code AND status = 'active' LIMIT 1");
        $stmt->bindValue(':code', $productCode, PDO::PARAM_STR);
        $stmt->execute();
        $product = $stmt->fetch();
        if (!$product) {
            karen_fail(404, 'product_not_found');
        }

        if (!function_exists('karen_make_activation_code') || !function_exists('karen_activation_code_hash')) {
            karen_fail(500, 'activation_helpers_missing');
        }

        $activationCode = karen_make_activation_code();
        $activationCodeHash = karen_activation_code_hash($activationCode);
        $publicId = karen_uuidv4();
        $now = time();
        $licenseExpiresAt = gmdate('Y-m-d H:i:s', $now + $licenseDays * 86400);
        $activationCodeExpiresAt = gmdate('Y-m-d H:i:s', $now + $activationCodeDays * 86400);

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(<<<'SQL'
INSERT INTO licenses (
    customer_id, product_id, public_id, plan, status, max_devices,
    activation_code_hash, activation_code_expires_at, expires_at
) VALUES (
    :customer_id, :product_id, :public_id, :plan, 'active', :max_devices,
    :activation_code_hash, :activation_code_expires_at, :expires_at
)
SQL
            );
            $stmt->bindValue(':customer_id', (int) $customer['id'], PDO::PARAM_INT);
            $stmt->bindValue(':product_id', (int) $product['id'], PDO::PARAM_INT);
            $stmt->bindValue(':public_id', $publicId, PDO::PARAM_STR);
            $stmt->bindValue(':plan', $plan, PDO::PARAM_STR);
            $stmt->bindValue(':max_devices', $maxDevices, PDO::PARAM_INT);
            $stmt->bindValue(':activation_code_hash', $activationCodeHash, PDO::PARAM_STR);
            $stmt->bindValue(':activation_code_expires_at', $activationCodeExpiresAt, PDO::PARAM_STR);
            $stmt->bindValue(':expires_at', $licenseExpiresAt, PDO::PARAM_STR);
            $stmt->execute();
            $licenseId = (int) $pdo->lastInsertId();

            $deviceColumn = $pdo->query("SHOW COLUMNS FROM license_events LIKE 'device_id'")->fetch();
            if ($deviceColumn && strtoupper((string) ($deviceColumn['Null'] ?? '')) === 'YES') {
                $stmt = $pdo->prepare(<<<'SQL'
INSERT INTO license_events (license_id, device_id, event_type, ip_hash, user_agent, meta)
VALUES (:license_id, NULL, 'license.issued', :ip_hash, :user_agent, :meta)
SQL
                );
                $stmt->bindValue(':license_id', $licenseId, PDO::PARAM_INT);
                $stmt->bindValue(':ip_hash', karen_client_ip_hash(), PDO::PARAM_STR);
                $stmt->bindValue(':user_agent', substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255), PDO::PARAM_STR);
                $stmt->bindValue(':meta', json_encode([
                    'environment' => KAREN_ENV,
                    'source' => 'staging-admin-panel',
                    'admin_user' => $adminUser,
                    'plan' => $plan,
                    'max_devices' => $maxDevices,
                    'license_days' => $licenseDays,
                    'activation_code_days' => $activationCodeDays,
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

        $_SESSION['karen_issue_license_flash'] = [
            'activation_code' => $activationCode,
            'public_id' => $publicId,
            'customer_reference' => (string) $customer['reference_code'],
            'product_code' => (string) $product['code'],
            'plan' => $plan,
            'max_devices' => $maxDevices,
            'license_expires_at' => $licenseExpiresAt,
            'activation_code_expires_at' => $activationCodeExpiresAt,
        ];
        $_SESSION['karen_issue_license_csrf'] = bin2hex(random_bytes(32));
        session_write_close();
        header('Location: ?created=1');
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        header('Allow: GET, POST');
        karen_fail(405, 'method_not_allowed');
    }

    $customers = $pdo->query("SELECT reference_code FROM customers WHERE status = 'active' ORDER BY reference_code ASC LIMIT 200")->fetchAll();
    $products = $pdo->query("SELECT code FROM products WHERE status = 'active' ORDER BY code ASC LIMIT 100")->fetchAll();
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('karen staging issue license failed: ' . $e->getMessage());
    karen_fail(500, 'issue_license_failed');
}

$nonce = base64_encode(random_bytes(18));
header("Content-Security-Policy: default-src 'none'; style-src 'nonce-" . $nonce . "'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>صدور لایسنس — staging</title>
  <style nonce="<?php echo $nonce; ?>">
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    main { max-width: 720px; margin: auto; }
    a { color: #93c5fd; }
    h1 { font-size: 20px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 14px; padding: 16px; margin: 14px 0; }
    .warn { color: #fbbf24; line-height: 1.9; }
    .error { background: #7f1d1d; border: 1px solid #fecaca; border-radius: 10px; padding: 12px; margin: 12px 0; }
    label { display: block; margin: 14px 0 6px; }
    input, select { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #475569; background: #0b1220; color: #e2e8f0; font: inherit; }
    button { margin-top: 18px; border: 0; border-radius: 10px; padding: 13px 16px; background: #4f46e5; color: white; cursor: pointer; font: inherit; }
    code { direction: ltr; display: block; word-break: break-all; background: #0b1220; border: 1px solid #334155; border-radius: 10px; padding: 12px; }
    .muted { color: #94a3b8; }
  </style>
</head>
<body>
<main>
  <h1>صدور لایسنس جدید — staging</h1>
  <p><a href="./">بازگشت به پنل ادمین</a></p>

  <?php if ($error !== ''): ?>
    <div class="error"><?php echo karen_issue_e($error); ?></div>
  <?php endif; ?>

  <?php if ($issued): ?>
    <div class="card">
      <h2>لایسنس صادر شد</h2>
      <p class="warn">این کد فقط همین یک‌بار نمایش داده می‌شود. آن را در جای امن کپی کن. در دیتابیس فقط هش آن ذخیره شده است. کد را در چت یا اسکرین‌شات عمومی نفرست.</p>
      <p>کد فعال‌سازی:</p>
      <code><?php echo karen_issue_e($issued['activation_code']); ?></code>
      <p>شناسه لایسنس: <span class="muted"><?php echo karen_issue_e($issued['public_id']); ?></span></p>
      <p>مشتری: <?php echo karen_issue_e($issued['customer_reference']); ?> | محصول: <?php echo karen_issue_e($issued['product_code']); ?></p>
      <p>پلن: <?php echo karen_issue_e($issued['plan']); ?> | حداکثر دستگاه: <?php echo (int) $issued['max_devices']; ?></p>
      <p>انقضای لایسنس: <?php echo karen_issue_e($issued['license_expires_at']); ?> UTC</p>
      <p>انقضای کد فعال‌سازی: <?php echo karen_issue_e($issued['activation_code_expires_at']); ?> UTC</p>
    </div>
  <?php else: ?>
    <div class="card">
      <p class="warn">این صفحه برای مشتری‌ها و محصول‌های فعال موجود در دیتابیس لایسنس صادر می‌کند. کد فعال‌سازی فقط یک‌بار نمایش داده می‌شود.</p>
      <form method="post">
        <input type="hidden" name="csrf" value="<?php echo karen_issue_e($csrf); ?>">

        <label for="customer_reference">مشتری</label>
        <select id="customer_reference" name="customer_reference" required>
          <?php foreach ($customers as $customer): ?>
            <option value="<?php echo karen_issue_e($customer['reference_code']); ?>"><?php echo karen_issue_e($customer['reference_code']); ?></option>
          <?php endforeach; ?>
        </select>

        <label for="product_code">محصول</label>
        <select id="product_code" name="product_code" required>
          <?php foreach ($products as $product): ?>
            <option value="<?php echo karen_issue_e($product['code']); ?>"><?php echo karen_issue_e($product['code']); ?></option>
          <?php endforeach; ?>
        </select>

        <label for="plan">پلن</label>
        <select id="plan" name="plan" required>
          <option value="pro">pro</option>
          <option value="proplus">proplus</option>
        </select>

        <label for="max_devices">حداکثر دستگاه‌های فعال</label>
        <input id="max_devices" name="max_devices" type="number" min="1" max="20" value="2" required>

        <label for="license_days">اعتبار لایسنس چند روز؟</label>
        <input id="license_days" name="license_days" type="number" min="1" max="3650" value="30" required>

        <label for="activation_code_days">کد فعال‌سازی چند روز اعتبار داشته باشد؟</label>
        <input id="activation_code_days" name="activation_code_days" type="number" min="1" max="30" value="7" required>

        <button type="submit">صدور لایسنس</button>
      </form>
    </div>
  <?php endif; ?>
</main>
</body>
</html>
