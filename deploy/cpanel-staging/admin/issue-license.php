<?php
declare(strict_types=1);

define('KAREN_ADMIN_PAGE', true);
require '/home/karensof/private/karen-staging/bootstrap.php';
require __DIR__ . '/ui.php';

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

$error = '';
$issued = null;
$old = [
    'customer_reference' => '',
    'product_code' => '',
    'plan' => 'pro',
    'max_devices' => 2,
    'license_days' => 30,
    'activation_code_days' => 7,
];
$customers = [];
$products = [];

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

        $old = [
            'customer_reference' => $customerReference,
            'product_code' => $productCode,
            'plan' => $plan,
            'max_devices' => $maxDevices,
            'license_days' => $licenseDays,
            'activation_code_days' => $activationCodeDays,
        ];

        if ($customerReference === '' || strlen($customerReference) > 190) {
            $error = 'شناسه مشتری نامعتبر است.';
        } elseif (!preg_match('/^[a-z0-9_-]{1,64}$/', $productCode)) {
            $error = 'کد محصول نامعتبر است.';
        } elseif (!in_array($plan, ['pro', 'proplus'], true)) {
            $error = 'پلن انتخاب‌شده معتبر نیست.';
        } elseif ($maxDevices < 1 || $maxDevices > 20) {
            $error = 'تعداد دستگاه باید بین ۱ تا ۲۰ باشد.';
        } elseif ($licenseDays < 1 || $licenseDays > 3650) {
            $error = 'اعتبار لایسنس باید بین ۱ تا ۳۶۵۰ روز باشد.';
        } elseif ($activationCodeDays < 1 || $activationCodeDays > 30 || $activationCodeDays > $licenseDays) {
            $error = 'اعتبار کد فعال‌سازی باید بین ۱ تا ۳۰ روز و از اعتبار لایسنس بیشتر نباشد.';
        }

        if ($error === '') {
            $stmt = $pdo->prepare("SELECT id, reference_code FROM customers WHERE reference_code = :reference_code AND status = 'active' LIMIT 1");
            $stmt->bindValue(':reference_code', $customerReference, PDO::PARAM_STR);
            $stmt->execute();
            $customer = $stmt->fetch();
            if (!$customer) {
                $error = 'مشتری فعال با این شناسه یافت نشد.';
            }
        }

        if ($error === '') {
            $stmt = $pdo->prepare("SELECT id, code FROM products WHERE code = :code AND status = 'active' LIMIT 1");
            $stmt->bindValue(':code', $productCode, PDO::PARAM_STR);
            $stmt->execute();
            $product = $stmt->fetch();
            if (!$product) {
                $error = 'محصول فعال با این کد یافت نشد.';
            }
        }

        if ($error === '' && (!function_exists('karen_make_activation_code') || !function_exists('karen_activation_code_hash'))) {
            karen_fail(500, 'activation_helpers_missing');
        }

        if ($error === '') {
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
    }

    if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'POST'], true)) {
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
header("Content-Security-Policy: default-src 'none'; script-src 'self' 'nonce-" . $nonce . "'; style-src 'self'; font-src 'self'; img-src 'self' data:; manifest-src 'self'; worker-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

karen_admin_layout_start('صدور لایسنس', 'issue', $adminUser, $nonce);

if ($error !== '') {
    echo '<div class="alert danger">' . karen_admin_icon('alert') . '<div>' . karen_admin_e($error) . '</div></div>';
}

if ($issued):
?>
  <div class="page-head">
    <div>
      <h1>لایسنس صادر شد</h1>
      <p>کد فعال‌سازی را در جای امن نگه دار.</p>
    </div>
    <div class="actions">
      <a class="btn" href="./index.php?view=licenses"><?php echo karen_admin_icon('key'); ?>فهرست لایسنس‌ها</a>
      <a class="btn btn-primary" href="./issue-license.php"><?php echo karen_admin_icon('plus'); ?>صدور بعدی</a>
    </div>
  </div>

  <div class="alert warning"><?php echo karen_admin_icon('alert'); ?><div>این کد فقط همین یک‌بار نمایش داده می‌شود. در دیتابیس فقط هش آن ذخیره شده است. کد را در چت یا اسکرین‌شات عمومی نفرست.</div></div>

  <section class="card">
    <div class="card-head"><h2>کد فعال‌سازی</h2></div>
    <div class="card-body">
      <div class="code-box">
        <code id="activation-code"><?php echo karen_admin_e($issued['activation_code']); ?></code>
        <button class="btn btn-primary btn-sm" type="button" data-copy="#activation-code"><?php echo karen_admin_icon('copy'); ?>کپی</button>
      </div>
      <dl class="detail-grid" class="mt-16">
        <div class="detail-item"><dt>شناسه لایسنس</dt><dd><code><?php echo karen_admin_e($issued['public_id']); ?></code></dd></div>
        <div class="detail-item"><dt>مشتری</dt><dd><?php echo karen_admin_e($issued['customer_reference']); ?></dd></div>
        <div class="detail-item"><dt>محصول</dt><dd><?php echo karen_admin_e($issued['product_code']); ?></dd></div>
        <div class="detail-item"><dt>پلن</dt><dd><span class="badge plan"><?php echo karen_admin_e(karen_admin_plan_label($issued['plan'])); ?></span></dd></div>
        <div class="detail-item"><dt>حداکثر دستگاه</dt><dd><?php echo karen_admin_fa($issued['max_devices']); ?></dd></div>
        <div class="detail-item"><dt>انقضای لایسنس</dt><dd><?php echo karen_admin_dt($issued['license_expires_at']); ?></dd></div>
        <div class="detail-item"><dt>انقضای کد فعال‌سازی</dt><dd><?php echo karen_admin_dt($issued['activation_code_expires_at']); ?></dd></div>
      </dl>
    </div>
  </section>
<?php else: ?>
  <div class="page-head">
    <div>
      <h1>صدور لایسنس جدید</h1>
      <p>برای مشتری و محصول فعال، لایسنس و کد فعال‌سازی یک‌بارمصرف بساز.</p>
    </div>
    <div class="actions"><a class="btn" href="./index.php?view=licenses"><?php echo karen_admin_icon('arrow'); ?>بازگشت</a></div>
  </div>

  <div class="alert info"><?php echo karen_admin_icon('info'); ?><div>کد فعال‌سازی فقط یک‌بار پس از صدور نمایش داده می‌شود. فقط هش آن در دیتابیس ذخیره می‌شود.</div></div>

  <section class="card">
    <div class="card-head"><h2>مشخصات لایسنس</h2></div>
    <div class="card-body">
      <?php if (!$customers || !$products): ?>
        <div class="alert warning"><?php echo karen_admin_icon('alert'); ?><div>مشتری یا محصول فعالی در دیتابیس وجود ندارد. ابتدا باید مشتری و محصول فعال ثبت شوند.</div></div>
      <?php endif; ?>
      <form method="post" data-confirm="لایسنس جدید صادر شود؟ کد فعال‌سازی فقط یک‌بار نمایش داده می‌شود." data-confirm-title="صدور لایسنس" data-confirm-label="صادر کن">
        <input type="hidden" name="csrf" value="<?php echo karen_admin_e($csrf); ?>">
        <div class="form-grid">
          <div class="field">
            <label for="customer_reference">مشتری</label>
            <select class="input" id="customer_reference" name="customer_reference" required>
              <?php foreach ($customers as $customer): ?>
                <option value="<?php echo karen_admin_e($customer['reference_code']); ?>" <?php echo $old['customer_reference'] === $customer['reference_code'] ? 'selected' : ''; ?>><?php echo karen_admin_e($customer['reference_code']); ?></option>
              <?php endforeach; ?>
            </select>
          </div>
          <div class="field">
            <label for="product_code">محصول</label>
            <select class="input" id="product_code" name="product_code" required>
              <?php foreach ($products as $product): ?>
                <option value="<?php echo karen_admin_e($product['code']); ?>" <?php echo $old['product_code'] === $product['code'] ? 'selected' : ''; ?>><?php echo karen_admin_e($product['code']); ?></option>
              <?php endforeach; ?>
            </select>
          </div>
          <div class="field">
            <label for="plan">پلن</label>
            <select class="input" id="plan" name="plan" required>
              <option value="pro" <?php echo $old['plan'] === 'pro' ? 'selected' : ''; ?>>حرفه‌ای (pro)</option>
              <option value="proplus" <?php echo $old['plan'] === 'proplus' ? 'selected' : ''; ?>>حرفه‌ای پلاس (proplus)</option>
            </select>
          </div>
          <div class="field">
            <label for="max_devices">حداکثر دستگاه فعال</label>
            <input class="input" id="max_devices" name="max_devices" type="number" min="1" max="20" value="<?php echo (int) $old['max_devices']; ?>" required>
          </div>
          <div class="field">
            <label for="license_days">اعتبار لایسنس (روز)</label>
            <input class="input" id="license_days" name="license_days" type="number" min="1" max="3650" value="<?php echo (int) $old['license_days']; ?>" required>
          </div>
          <div class="field">
            <label for="activation_code_days">اعتبار کد فعال‌سازی (روز)</label>
            <input class="input" id="activation_code_days" name="activation_code_days" type="number" min="1" max="30" value="<?php echo (int) $old['activation_code_days']; ?>" required>
          </div>
          <div class="full">
            <button class="btn btn-primary" type="submit" <?php echo (!$customers || !$products) ? 'disabled' : ''; ?>><?php echo karen_admin_icon('plus'); ?>صدور لایسنس</button>
          </div>
        </div>
      </form>
    </div>
  </section>
<?php
endif;

karen_admin_layout_end();
