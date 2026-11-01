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

if (empty($_SESSION['karen_admin_csrf'])) {
    $_SESSION['karen_admin_csrf'] = bin2hex(random_bytes(32));
}
$csrf = (string) $_SESSION['karen_admin_csrf'];

function karen_admin_e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function karen_admin_redirect(string $licensePublicId, string $message): void
{
    header('Location: ?license=' . urlencode($licensePublicId) . '&msg=' . urlencode($message));
    exit;
}

$messages = [
    'device_revoked' => 'دستگاه مسدود شد.',
    'device_reactivated' => 'دستگاه دوباره فعال شد.',
    'device_already_active' => 'دستگاه از قبل فعال بود.',
    'device_already_revoked' => 'دستگاه از قبل مسدود بود.',
];

$licensePublicId = trim((string) ($_GET['license'] ?? ''));
$messageKey = (string) ($_GET['msg'] ?? '');
$message = $messages[$messageKey] ?? '';
$license = null;
$devices = [];
$events = [];
$licenses = [];

try {
    $pdo = karen_db();

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $suppliedCsrf = (string) ($_POST['csrf'] ?? '');
        if (!hash_equals($csrf, $suppliedCsrf)) {
            karen_fail(403, 'invalid_csrf');
        }

        $action = (string) ($_POST['action'] ?? '');
        $licensePublicId = trim((string) ($_POST['license_public_id'] ?? ''));
        $deviceKeyId = strtolower(trim((string) ($_POST['device_key_id'] ?? '')));

        if (!in_array($action, ['device_revoke', 'device_reactivate'], true)) {
            karen_fail(400, 'invalid_action');
        }
        if ($licensePublicId === '' || strlen($licensePublicId) > 64) {
            karen_fail(400, 'invalid_license_id');
        }
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $deviceKeyId)) {
            karen_fail(400, 'invalid_device_key_id');
        }

        karen_rate_limit(
            'admin:' . hash('sha256', $adminUser) . ':' . bin2hex(karen_client_ip_hash()),
            60,
            300
        );

        $abort = static function (int $status, string $error) use ($pdo): void {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            karen_fail($status, $error);
        };

        $pdo->beginTransaction();

        $stmt = $pdo->prepare('SELECT id, status, max_devices FROM licenses WHERE public_id = :public_id LIMIT 1 FOR UPDATE');
        $stmt->bindValue(':public_id', $licensePublicId, PDO::PARAM_STR);
        $stmt->execute();
        $licenseRow = $stmt->fetch();
        if (!$licenseRow) {
            $abort(404, 'license_not_found');
        }

        $stmt = $pdo->prepare('SELECT id, status FROM license_devices WHERE license_id = :license_id AND device_key_id = :device_key_id LIMIT 1 FOR UPDATE');
        $stmt->bindValue(':license_id', (int) $licenseRow['id'], PDO::PARAM_INT);
        $stmt->bindValue(':device_key_id', $deviceKeyId, PDO::PARAM_STR);
        $stmt->execute();
        $deviceRow = $stmt->fetch();
        if (!$deviceRow) {
            $abort(404, 'device_not_found');
        }

        $messageKey = '';
        $eventType = '';
        $newStatus = null;

        if ($action === 'device_revoke') {
            if ($deviceRow['status'] === 'revoked') {
                $messageKey = 'device_already_revoked';
            } else {
                $newStatus = 'revoked';
                $eventType = 'device.revoked';
                $messageKey = 'device_revoked';
            }
        }

        if ($action === 'device_reactivate') {
            if ($deviceRow['status'] === 'active') {
                $messageKey = 'device_already_active';
            } else {
                if ($licenseRow['status'] !== 'active') {
                    $abort(409, 'license_not_active');
                }

                $stmt = $pdo->prepare("SELECT COUNT(*) FROM license_devices WHERE license_id = :license_id AND status = 'active'");
                $stmt->bindValue(':license_id', (int) $licenseRow['id'], PDO::PARAM_INT);
                $stmt->execute();
                $activeDevices = (int) $stmt->fetchColumn();

                if ($activeDevices >= (int) $licenseRow['max_devices']) {
                    $abort(403, 'device_limit_reached');
                }

                $newStatus = 'active';
                $eventType = 'device.reactivated';
                $messageKey = 'device_reactivated';
            }
        }

        if ($newStatus !== null) {
            $stmt = $pdo->prepare('UPDATE license_devices SET status = :status WHERE id = :id');
            $stmt->bindValue(':status', $newStatus, PDO::PARAM_STR);
            $stmt->bindValue(':id', (int) $deviceRow['id'], PDO::PARAM_INT);
            $stmt->execute();

            $stmt = $pdo->prepare(<<<'SQL'
INSERT INTO license_events (license_id, device_id, event_type, ip_hash, user_agent, meta)
VALUES (:license_id, :device_id, :event_type, :ip_hash, :user_agent, :meta)
SQL
            );
            $stmt->bindValue(':license_id', (int) $licenseRow['id'], PDO::PARAM_INT);
            $stmt->bindValue(':device_id', (int) $deviceRow['id'], PDO::PARAM_INT);
            $stmt->bindValue(':event_type', $eventType, PDO::PARAM_STR);
            $stmt->bindValue(':ip_hash', karen_client_ip_hash(), PDO::PARAM_STR);
            $stmt->bindValue(':user_agent', substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255), PDO::PARAM_STR);
            $stmt->bindValue(':meta', json_encode([
                'environment' => KAREN_ENV,
                'source' => 'staging-admin-panel',
                'admin_user' => $adminUser,
                'new_status' => $newStatus,
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), PDO::PARAM_STR);
            $stmt->execute();
        }

        $pdo->commit();
        karen_admin_redirect($licensePublicId, $messageKey);
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        header('Allow: GET, POST');
        karen_fail(405, 'method_not_allowed');
    }

    if ($licensePublicId !== '') {
        $stmt = $pdo->prepare(<<<'SQL'
SELECT l.public_id, l.plan, l.status, l.max_devices, l.expires_at,
       c.reference_code, p.code AS product_code
FROM licenses l
INNER JOIN customers c ON c.id = l.customer_id
INNER JOIN products p ON p.id = l.product_id
WHERE l.public_id = :public_id
LIMIT 1
SQL
        );
        $stmt->bindValue(':public_id', $licensePublicId, PDO::PARAM_STR);
        $stmt->execute();
        $license = $stmt->fetch();

        if (!$license) {
            karen_fail(404, 'license_not_found');
        }

        $stmt = $pdo->prepare(<<<'SQL'
SELECT id, device_key_id, device_label, status, activated_at, last_seen_at
FROM license_devices
WHERE license_id = (SELECT id FROM licenses WHERE public_id = :public_id LIMIT 1)
ORDER BY id DESC
SQL
        );
        $stmt->bindValue(':public_id', $licensePublicId, PDO::PARAM_STR);
        $stmt->execute();
        $devices = $stmt->fetchAll();

        $stmt = $pdo->prepare(<<<'SQL'
SELECT e.event_type, e.created_at, d.device_label
FROM license_events e
LEFT JOIN license_devices d ON d.id = e.device_id
WHERE e.license_id = (SELECT id FROM licenses WHERE public_id = :public_id LIMIT 1)
ORDER BY e.id DESC
LIMIT 20
SQL
        );
        $stmt->bindValue(':public_id', $licensePublicId, PDO::PARAM_STR);
        $stmt->execute();
        $events = $stmt->fetchAll();
    } else {
        $licenses = $pdo->query(<<<'SQL'
SELECT l.public_id, l.plan, l.status, l.max_devices, l.expires_at,
       c.reference_code, p.code AS product_code,
       (SELECT COUNT(*) FROM license_devices d WHERE d.license_id = l.id AND d.status = 'active') AS active_devices
FROM licenses l
INNER JOIN customers c ON c.id = l.customer_id
INNER JOIN products p ON p.id = l.product_id
ORDER BY l.id DESC
LIMIT 100
SQL
        )->fetchAll();
    }
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('karen staging admin failed: ' . $e->getMessage());
    karen_fail(500, 'admin_failed');
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
  <title>ادمین لایسنس staging</title>
  <style nonce="<?php echo $nonce; ?>">
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    main { max-width: 960px; margin: auto; }
    a { color: #93c5fd; }
    h1 { font-size: 20px; }
    h2 { font-size: 17px; margin-top: 28px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 14px; padding: 16px; margin: 14px 0; }
    .muted { color: #94a3b8; }
    .msg { background: #064e3b; border: 1px solid #10b981; border-radius: 10px; padding: 12px; margin: 12px 0; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 640px; }
    th, td { border-bottom: 1px solid #334155; padding: 10px; text-align: right; vertical-align: top; }
    th { color: #94a3b8; font-weight: 600; }
    code { direction: ltr; display: inline-block; word-break: break-all; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #334155; }
    .badge.active { background: #064e3b; color: #a7f3d0; }
    .badge.revoked, .badge.suspended, .badge.expired { background: #7f1d1d; color: #fecaca; }
    button { border: 0; border-radius: 8px; padding: 9px 12px; color: white; cursor: pointer; font: inherit; }
    button.danger { background: #e11d48; }
    button.success { background: #047857; }
    form { margin: 0; }
  </style>
</head>
<body>
<main>
  <h1>پنل ادمین لایسنس — staging</h1>
  <p class="muted">کاربر: <?php echo karen_admin_e($adminUser); ?> | محیط: <?php echo karen_admin_e(KAREN_ENV); ?></p>
  <p><a href="./">فهرست لایسنس‌ها</a></p>

  <?php if ($message !== ''): ?>
    <div class="msg"><?php echo karen_admin_e($message); ?></div>
  <?php endif; ?>

  <?php if ($license): ?>
    <div class="card">
      <h2>لایسنس</h2>
      <p>شناسه: <code><?php echo karen_admin_e($license['public_id']); ?></code></p>
      <p>مشتری: <?php echo karen_admin_e($license['reference_code']); ?> | محصول: <?php echo karen_admin_e($license['product_code']); ?></p>
      <p>پلن: <?php echo karen_admin_e($license['plan']); ?> | وضعیت: <span class="badge <?php echo karen_admin_e($license['status']); ?>"><?php echo karen_admin_e($license['status']); ?></span></p>
      <p>حداکثر دستگاه: <?php echo (int) $license['max_devices']; ?> | انقضا: <?php echo karen_admin_e($license['expires_at'] ?? 'نامحدود'); ?></p>
    </div>

    <h2>دستگاه‌ها</h2>
    <div class="card table-wrap">
      <table>
        <thead>
          <tr><th>نام</th><th>شناسه دستگاه</th><th>وضعیت</th><th>فعال‌سازی</th><th>آخرین مشاهده</th><th>عملیات</th></tr>
        </thead>
        <tbody>
        <?php foreach ($devices as $device): ?>
          <tr>
            <td><?php echo karen_admin_e($device['device_label']); ?></td>
            <td><code><?php echo karen_admin_e($device['device_key_id']); ?></code></td>
            <td><span class="badge <?php echo karen_admin_e($device['status']); ?>"><?php echo karen_admin_e($device['status']); ?></span></td>
            <td><?php echo karen_admin_e($device['activated_at'] ?? '-'); ?></td>
            <td><?php echo karen_admin_e($device['last_seen_at'] ?? '-'); ?></td>
            <td>
              <form method="post">
                <input type="hidden" name="csrf" value="<?php echo karen_admin_e($csrf); ?>">
                <input type="hidden" name="license_public_id" value="<?php echo karen_admin_e($license['public_id']); ?>">
                <input type="hidden" name="device_key_id" value="<?php echo karen_admin_e($device['device_key_id']); ?>">
                <?php if ($device['status'] === 'active'): ?>
                  <button class="danger" type="submit" name="action" value="device_revoke">مسدودکردن</button>
                <?php else: ?>
                  <button class="success" type="submit" name="action" value="device_reactivate">فعال‌سازی مجدد</button>
                <?php endif; ?>
              </form>
            </td>
          </tr>
        <?php endforeach; ?>
        <?php if (!$devices): ?>
          <tr><td colspan="6">دستگاهی ثبت نشده است.</td></tr>
        <?php endif; ?>
        </tbody>
      </table>
    </div>

    <h2>رویدادهای اخیر</h2>
    <div class="card table-wrap">
      <table>
        <thead><tr><th>زمان</th><th>رویداد</th><th>دستگاه</th></tr></thead>
        <tbody>
        <?php foreach ($events as $event): ?>
          <tr>
            <td><?php echo karen_admin_e($event['created_at'] ?? '-'); ?></td>
            <td><code><?php echo karen_admin_e($event['event_type']); ?></code></td>
            <td><?php echo karen_admin_e($event['device_label'] ?? '-'); ?></td>
          </tr>
        <?php endforeach; ?>
        <?php if (!$events): ?>
          <tr><td colspan="3">رویدادی ثبت نشده است.</td></tr>
        <?php endif; ?>
        </tbody>
      </table>
    </div>
  <?php else: ?>
    <h2>لایسنس‌ها</h2>
    <div class="card table-wrap">
      <table>
        <thead>
          <tr><th>شناسه</th><th>مشتری</th><th>محصول</th><th>پلن</th><th>وضعیت</th><th>دستگاه فعال</th><th>انقضا</th><th>جزئیات</th></tr>
        </thead>
        <tbody>
        <?php foreach ($licenses as $row): ?>
          <tr>
            <td><code><?php echo karen_admin_e($row['public_id']); ?></code></td>
            <td><?php echo karen_admin_e($row['reference_code']); ?></td>
            <td><?php echo karen_admin_e($row['product_code']); ?></td>
            <td><?php echo karen_admin_e($row['plan']); ?></td>
            <td><span class="badge <?php echo karen_admin_e($row['status']); ?>"><?php echo karen_admin_e($row['status']); ?></span></td>
            <td><?php echo (int) $row['active_devices']; ?> از <?php echo (int) $row['max_devices']; ?></td>
            <td><?php echo karen_admin_e($row['expires_at'] ?? 'نامحدود'); ?></td>
            <td><a href="?license=<?php echo urlencode((string) $row['public_id']); ?>">نمایش</a></td>
          </tr>
        <?php endforeach; ?>
        <?php if (!$licenses): ?>
          <tr><td colspan="8">لایسنسی یافت نشد.</td></tr>
        <?php endif; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</main>
</body>
</html>
