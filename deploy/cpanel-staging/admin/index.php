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

if (empty($_SESSION['karen_admin_csrf'])) {
    $_SESSION['karen_admin_csrf'] = bin2hex(random_bytes(32));
}
$csrf = (string) $_SESSION['karen_admin_csrf'];

function karen_admin_redirect(string $licensePublicId, string $message): void
{
    header('Location: ?license=' . urlencode($licensePublicId) . '&msg=' . urlencode($message));
    exit;
}

function karen_admin_page_url(int $page, array $params): string
{
    $params['page'] = max(1, $page);
    return './index.php?' . http_build_query($params);
}

function karen_admin_pager(int $page, int $pages, array $params): void
{
    if ($pages <= 1) {
        return;
    }
    $start = max(1, $page - 2);
    $end = min($pages, $page + 2);
    echo '<div class="pagination"><span class="muted small">صفحه ' . karen_admin_fa($page) . ' از ' . karen_admin_fa($pages) . '</span><div class="pager">';
    if ($page > 1) {
        echo '<a href="' . karen_admin_e(karen_admin_page_url($page - 1, $params)) . '" aria-label="قبلی">‹</a>';
    }
    if ($start > 1) {
        echo '<a href="' . karen_admin_e(karen_admin_page_url(1, $params)) . '">۱</a>';
        if ($start > 2) echo '<span class="muted">…</span>';
    }
    for ($i = $start; $i <= $end; $i++) {
        if ($i === $page) {
            echo '<span class="current">' . karen_admin_fa($i) . '</span>';
        } else {
            echo '<a href="' . karen_admin_e(karen_admin_page_url($i, $params)) . '">' . karen_admin_fa($i) . '</a>';
        }
    }
    if ($end < $pages) {
        if ($end < $pages - 1) echo '<span class="muted">…</span>';
        echo '<a href="' . karen_admin_e(karen_admin_page_url($pages, $params)) . '">' . karen_admin_fa($pages) . '</a>';
    }
    if ($page < $pages) {
        echo '<a href="' . karen_admin_e(karen_admin_page_url($page + 1, $params)) . '" aria-label="بعدی">›</a>';
    }
    echo '</div></div>';
}

$messages = [
    'device_revoked' => 'دستگاه مسدود شد.',
    'device_reactivated' => 'دستگاه دوباره فعال شد.',
    'device_already_active' => 'دستگاه از قبل فعال بود.',
    'device_already_revoked' => 'دستگاه از قبل مسدود بود.',
];

$view = (string) ($_GET['view'] ?? 'overview');
if (!in_array($view, ['overview', 'licenses', 'devices', 'events'], true)) {
    $view = 'overview';
}
$licensePublicId = trim((string) ($_GET['license'] ?? ''));
if ($licensePublicId !== '') {
    $view = 'license';
}
$messageKey = (string) ($_GET['msg'] ?? '');
$message = $messages[$messageKey] ?? '';
$q = trim((string) ($_GET['q'] ?? ''));
if (strlen($q) > 100) {
    $q = substr($q, 0, 100);
}
$statusFilter = (string) ($_GET['status'] ?? '');
$planFilter = (string) ($_GET['plan'] ?? '');
$page = max(1, (int) ($_GET['page'] ?? 1));
$perPage = 20;

$license = null;
$devices = [];
$events = [];
$licenses = [];
$deviceRows = [];
$eventRows = [];
$stats = [
    'licenses' => 0,
    'active_licenses' => 0,
    'active_devices' => 0,
    'expiring_soon' => 0,
    'revoked_devices' => 0,
    'events_today' => 0,
];
$recentLicenses = [];
$recentEvents = [];
$totalRows = 0;
$pages = 1;

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

    // Dashboard statistics
    $stats['licenses'] = (int) $pdo->query('SELECT COUNT(*) FROM licenses')->fetchColumn();
    $stats['active_licenses'] = (int) $pdo->query("SELECT COUNT(*) FROM licenses WHERE status = 'active'")->fetchColumn();
    $stats['active_devices'] = (int) $pdo->query("SELECT COUNT(*) FROM license_devices WHERE status = 'active'")->fetchColumn();
    $stats['revoked_devices'] = (int) $pdo->query("SELECT COUNT(*) FROM license_devices WHERE status = 'revoked'")->fetchColumn();
    $stats['expiring_soon'] = (int) $pdo->query("SELECT COUNT(*) FROM licenses WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)")->fetchColumn();
    $stats['events_today'] = (int) $pdo->query('SELECT COUNT(*) FROM license_events WHERE created_at >= UTC_DATE()')->fetchColumn();

    if ($view === 'license') {
        $stmt = $pdo->prepare(<<<'SQL'
SELECT l.public_id, l.plan, l.status, l.max_devices, l.expires_at, l.activation_code_expires_at,
       c.reference_code, p.code AS product_code,
       (SELECT COUNT(*) FROM license_devices d WHERE d.license_id = l.id AND d.status = 'active') AS active_devices
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
LIMIT 30
SQL
        );
        $stmt->bindValue(':public_id', $licensePublicId, PDO::PARAM_STR);
        $stmt->execute();
        $events = $stmt->fetchAll();
    } elseif ($view === 'licenses') {
        $where = [];
        $params = [];
        if ($q !== '') {
            $where[] = '(l.public_id LIKE :q OR c.reference_code LIKE :q OR p.code LIKE :q)';
            $params[':q'] = '%' . $q . '%';
        }
        if (in_array($statusFilter, ['active', 'revoked', 'suspended', 'expired'], true)) {
            $where[] = 'l.status = :status';
            $params[':status'] = $statusFilter;
        }
        if (in_array($planFilter, ['pro', 'proplus'], true)) {
            $where[] = 'l.plan = :plan';
            $params[':plan'] = $planFilter;
        }
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM licenses l INNER JOIN customers c ON c.id = l.customer_id INNER JOIN products p ON p.id = l.product_id $whereSql");
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $stmt->execute();
        $totalRows = (int) $stmt->fetchColumn();
        $pages = max(1, (int) ceil($totalRows / $perPage));
        $page = min($page, $pages);
        $offset = ($page - 1) * $perPage;

        $stmt = $pdo->prepare(<<<SQL
SELECT l.public_id, l.plan, l.status, l.max_devices, l.expires_at,
       c.reference_code, p.code AS product_code,
       (SELECT COUNT(*) FROM license_devices d WHERE d.license_id = l.id AND d.status = 'active') AS active_devices
FROM licenses l
INNER JOIN customers c ON c.id = l.customer_id
INNER JOIN products p ON p.id = l.product_id
$whereSql
ORDER BY l.id DESC
LIMIT :limit OFFSET :offset
SQL
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $licenses = $stmt->fetchAll();
    } elseif ($view === 'devices') {
        $where = [];
        $params = [];
        if ($q !== '') {
            $where[] = '(d.device_label LIKE :q OR d.device_key_id LIKE :q OR l.public_id LIKE :q OR c.reference_code LIKE :q)';
            $params[':q'] = '%' . $q . '%';
        }
        if (in_array($statusFilter, ['active', 'revoked'], true)) {
            $where[] = 'd.status = :status';
            $params[':status'] = $statusFilter;
        }
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM license_devices d INNER JOIN licenses l ON l.id = d.license_id INNER JOIN customers c ON c.id = l.customer_id $whereSql");
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $stmt->execute();
        $totalRows = (int) $stmt->fetchColumn();
        $pages = max(1, (int) ceil($totalRows / $perPage));
        $page = min($page, $pages);
        $offset = ($page - 1) * $perPage;

        $stmt = $pdo->prepare(<<<SQL
SELECT d.device_key_id, d.device_label, d.status, d.activated_at, d.last_seen_at,
       l.public_id, l.plan, l.status AS license_status, c.reference_code
FROM license_devices d
INNER JOIN licenses l ON l.id = d.license_id
INNER JOIN customers c ON c.id = l.customer_id
$whereSql
ORDER BY d.id DESC
LIMIT :limit OFFSET :offset
SQL
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $deviceRows = $stmt->fetchAll();
    } elseif ($view === 'events') {
        $where = [];
        $params = [];
        if ($q !== '') {
            $where[] = '(e.event_type LIKE :q OR l.public_id LIKE :q OR d.device_label LIKE :q)';
            $params[':q'] = '%' . $q . '%';
        }
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM license_events e LEFT JOIN licenses l ON l.id = e.license_id LEFT JOIN license_devices d ON d.id = e.device_id $whereSql");
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $stmt->execute();
        $totalRows = (int) $stmt->fetchColumn();
        $pages = max(1, (int) ceil($totalRows / $perPage));
        $page = min($page, $pages);
        $offset = ($page - 1) * $perPage;

        $stmt = $pdo->prepare(<<<SQL
SELECT e.event_type, e.created_at, e.meta, l.public_id, d.device_label
FROM license_events e
LEFT JOIN licenses l ON l.id = e.license_id
LEFT JOIN license_devices d ON d.id = e.device_id
$whereSql
ORDER BY e.id DESC
LIMIT :limit OFFSET :offset
SQL
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $eventRows = $stmt->fetchAll();
    } else {
        $recentLicenses = $pdo->query(<<<'SQL'
SELECT l.public_id, l.plan, l.status, l.max_devices, l.expires_at,
       c.reference_code, p.code AS product_code,
       (SELECT COUNT(*) FROM license_devices d WHERE d.license_id = l.id AND d.status = 'active') AS active_devices
FROM licenses l
INNER JOIN customers c ON c.id = l.customer_id
INNER JOIN products p ON p.id = l.product_id
ORDER BY l.id DESC
LIMIT 8
SQL
        )->fetchAll();

        $recentEvents = $pdo->query(<<<'SQL'
SELECT e.event_type, e.created_at, l.public_id, d.device_label
FROM license_events e
LEFT JOIN licenses l ON l.id = e.license_id
LEFT JOIN license_devices d ON d.id = e.device_id
ORDER BY e.id DESC
LIMIT 8
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

$titles = [
    'overview' => 'نمای کلی',
    'licenses' => 'لایسنس‌ها',
    'devices' => 'دستگاه‌ها',
    'events' => 'رویدادها',
    'license' => 'جزئیات لایسنس',
];
$title = $titles[$view] ?? 'نمای کلی';
$activeNav = $view === 'license' ? 'licenses' : $view;

$nonce = base64_encode(random_bytes(18));
header("Content-Security-Policy: default-src 'none'; script-src 'self' 'nonce-" . $nonce . "'; style-src 'self'; font-src 'self'; img-src 'self' data:; manifest-src 'self'; worker-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

karen_admin_layout_start($title, $activeNav, $adminUser, $nonce);

if ($message !== '') {
    echo '<div class="hidden" data-toast="' . karen_admin_e($message) . '" data-toast-type="success"></div>';
}

$eventLabels = [
    'license.issued' => 'صدور لایسنس',
    'license.activated' => 'فعال‌سازی لایسنس',
    'license.refreshed' => 'تمدید نشست',
    'license.revoked' => 'مسدودسازی لایسنس',
    'device.activated' => 'فعال‌سازی دستگاه',
    'device.revoked' => 'مسدودسازی دستگاه',
    'device.reactivated' => 'فعال‌سازی مجدد دستگاه',
];

if ($view === 'overview'):
?>
  <div class="page-head">
    <div>
      <h1>سلام، <?php echo karen_admin_e($adminUser); ?> 👋</h1>
      <p>وضعیت لحظه‌ای لایسنس‌ها و دستگاه‌های محیط آزمایشی.</p>
    </div>
    <div class="actions">
      <a class="btn" href="./index.php?view=licenses"><?php echo karen_admin_icon('key'); ?>مدیریت لایسنس‌ها</a>
      <a class="btn btn-primary" href="./issue-license.php"><?php echo karen_admin_icon('plus'); ?>صدور لایسنس</a>
    </div>
  </div>

  <div class="grid kpis">
    <div class="card kpi">
      <div class="kpi-top"><span class="kpi-label">کل لایسنس‌ها</span><span class="kpi-icon"><?php echo karen_admin_icon('key'); ?></span></div>
      <div class="kpi-value"><?php echo karen_admin_fa($stats['licenses']); ?></div>
      <div class="kpi-hint"><?php echo karen_admin_fa($stats['active_licenses']); ?> لایسنس فعال</div>
    </div>
    <div class="card kpi success">
      <div class="kpi-top"><span class="kpi-label">دستگاه‌های فعال</span><span class="kpi-icon"><?php echo karen_admin_icon('phone'); ?></span></div>
      <div class="kpi-value"><?php echo karen_admin_fa($stats['active_devices']); ?></div>
      <div class="kpi-hint"><?php echo karen_admin_fa($stats['revoked_devices']); ?> دستگاه مسدود</div>
    </div>
    <div class="card kpi warning">
      <div class="kpi-top"><span class="kpi-label">انقضا تا ۷ روز آینده</span><span class="kpi-icon"><?php echo karen_admin_icon('clock'); ?></span></div>
      <div class="kpi-value"><?php echo karen_admin_fa($stats['expiring_soon']); ?></div>
      <div class="kpi-hint">نیازمند پیگیری تمدید</div>
    </div>
    <div class="card kpi">
      <div class="kpi-top"><span class="kpi-label">رویدادهای امروز</span><span class="kpi-icon"><?php echo karen_admin_icon('activity'); ?></span></div>
      <div class="kpi-value"><?php echo karen_admin_fa($stats['events_today']); ?></div>
      <div class="kpi-hint">از نیمه‌شب UTC</div>
    </div>
  </div>

  <div class="grid two-col">
    <section class="card">
      <div class="card-head">
        <h2>آخرین لایسنس‌ها</h2>
        <a class="btn btn-ghost btn-sm" href="./index.php?view=licenses">همه</a>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>مشتری</th><th>پلن</th><th>وضعیت</th><th>دستگاه</th><th>جزئیات</th></tr></thead>
          <tbody>
          <?php foreach ($recentLicenses as $row): ?>
            <tr>
              <td><strong><?php echo karen_admin_e($row['reference_code']); ?></strong><div class="muted small"><?php echo karen_admin_e($row['product_code']); ?></div></td>
              <td><span class="badge plan"><?php echo karen_admin_e(karen_admin_plan_label($row['plan'])); ?></span></td>
              <td><?php echo karen_admin_badge($row['status']); ?></td>
              <td><?php echo karen_admin_fa($row['active_devices']); ?> / <?php echo karen_admin_fa($row['max_devices']); ?></td>
              <td><a class="btn btn-sm" href="<?php echo karen_admin_e(karen_admin_url(['license' => $row['public_id']])); ?>">نمایش</a></td>
            </tr>
          <?php endforeach; ?>
          <?php if (!$recentLicenses): ?>
            <tr><td colspan="5"><div class="empty"><?php echo karen_admin_icon('key'); ?><div>هنوز لایسنسی صادر نشده است.</div></div></td></tr>
          <?php endif; ?>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>رویدادهای اخیر</h2>
        <a class="btn btn-ghost btn-sm" href="./index.php?view=events">همه</a>
      </div>
      <div class="timeline">
        <?php foreach ($recentEvents as $event): ?>
          <div class="timeline-item">
            <span class="timeline-dot"></span>
            <div>
              <div class="timeline-title"><?php echo karen_admin_e($eventLabels[$event['event_type']] ?? $event['event_type']); ?></div>
              <div class="timeline-meta">
                <?php if (!empty($event['public_id'])): ?><a href="<?php echo karen_admin_e(karen_admin_url(['license' => $event['public_id']])); ?>"><code><?php echo karen_admin_e(substr((string) $event['public_id'], 0, 8)); ?>…</code></a><?php endif; ?>
                <?php if (!empty($event['device_label'])): ?> · <?php echo karen_admin_e($event['device_label']); ?><?php endif; ?>
                · <?php echo karen_admin_e($event['created_at'] ?? ''); ?>
              </div>
            </div>
          </div>
        <?php endforeach; ?>
        <?php if (!$recentEvents): ?>
          <div class="empty"><?php echo karen_admin_icon('activity'); ?><div>رویدادی ثبت نشده است.</div></div>
        <?php endif; ?>
      </div>
    </section>
  </div>
<?php elseif ($view === 'licenses'): ?>
  <div class="page-head">
    <div>
      <h1>لایسنس‌ها</h1>
      <p><?php echo karen_admin_fa($totalRows); ?> لایسنس یافت شد.</p>
    </div>
    <div class="actions"><a class="btn btn-primary" href="./issue-license.php"><?php echo karen_admin_icon('plus'); ?>صدور لایسنس</a></div>
  </div>

  <section class="card">
    <form class="toolbar" method="get" action="./index.php">
      <input type="hidden" name="view" value="licenses">
      <div class="search">
        <?php echo karen_admin_icon('search'); ?>
        <input class="input" type="search" name="q" value="<?php echo karen_admin_e($q); ?>" placeholder="جستجوی شناسه، مشتری یا محصول…">
      </div>
      <select class="input" name="status" aria-label="وضعیت">
        <option value="">همه وضعیت‌ها</option>
        <?php foreach (['active'=>'فعال','revoked'=>'مسدود','suspended'=>'معلق','expired'=>'منقضی'] as $key=>$label): ?>
          <option value="<?php echo $key; ?>" <?php echo $statusFilter === $key ? 'selected' : ''; ?>><?php echo $label; ?></option>
        <?php endforeach; ?>
      </select>
      <select class="input" name="plan" aria-label="پلن">
        <option value="">همه پلن‌ها</option>
        <option value="pro" <?php echo $planFilter === 'pro' ? 'selected' : ''; ?>>حرفه‌ای</option>
        <option value="proplus" <?php echo $planFilter === 'proplus' ? 'selected' : ''; ?>>حرفه‌ای پلاس</option>
      </select>
      <button class="btn" type="submit">اعمال</button>
      <?php if ($q !== '' || $statusFilter !== '' || $planFilter !== ''): ?><a class="btn btn-ghost" href="./index.php?view=licenses">پاک‌کردن</a><?php endif; ?>
    </form>
    <div class="table-wrap">
      <table>
        <thead><tr><th>شناسه</th><th>مشتری</th><th>محصول</th><th>پلن</th><th>وضعیت</th><th>دستگاه فعال</th><th>انقضا</th><th>جزئیات</th></tr></thead>
        <tbody>
        <?php foreach ($licenses as $row): ?>
          <tr>
            <td><code><?php echo karen_admin_e(substr((string) $row['public_id'], 0, 8)); ?>…</code></td>
            <td><strong><?php echo karen_admin_e($row['reference_code']); ?></strong></td>
            <td><?php echo karen_admin_e($row['product_code']); ?></td>
            <td><span class="badge plan"><?php echo karen_admin_e(karen_admin_plan_label($row['plan'])); ?></span></td>
            <td><?php echo karen_admin_badge($row['status']); ?></td>
            <td>
              <div><?php echo karen_admin_fa($row['active_devices']); ?> از <?php echo karen_admin_fa($row['max_devices']); ?></div>
              <meter min="0" max="<?php echo (int) $row['max_devices']; ?>" value="<?php echo (int) $row['active_devices']; ?>"></meter>
            </td>
            <td><?php echo karen_admin_dt($row['expires_at'] ?? null); ?></td>
            <td><a class="btn btn-sm" href="<?php echo karen_admin_e(karen_admin_url(['license' => $row['public_id']])); ?>">نمایش</a></td>
          </tr>
        <?php endforeach; ?>
        <?php if (!$licenses): ?>
          <tr><td colspan="8"><div class="empty"><?php echo karen_admin_icon('search'); ?><div>لایسنسی مطابق جستجو یافت نشد.</div></div></td></tr>
        <?php endif; ?>
        </tbody>
      </table>
    </div>
    <?php karen_admin_pager($page, $pages, ['view'=>'licenses','q'=>$q,'status'=>$statusFilter,'plan'=>$planFilter]); ?>
  </section>
<?php elseif ($view === 'devices'): ?>
  <div class="page-head">
    <div>
      <h1>دستگاه‌ها</h1>
      <p><?php echo karen_admin_fa($totalRows); ?> دستگاه ثبت‌شده.</p>
    </div>
  </div>

  <section class="card">
    <form class="toolbar" method="get" action="./index.php">
      <input type="hidden" name="view" value="devices">
      <div class="search">
        <?php echo karen_admin_icon('search'); ?>
        <input class="input" type="search" name="q" value="<?php echo karen_admin_e($q); ?>" placeholder="جستجوی نام دستگاه، شناسه یا مشتری…">
      </div>
      <select class="input" name="status" aria-label="وضعیت">
        <option value="">همه وضعیت‌ها</option>
        <option value="active" <?php echo $statusFilter === 'active' ? 'selected' : ''; ?>>فعال</option>
        <option value="revoked" <?php echo $statusFilter === 'revoked' ? 'selected' : ''; ?>>مسدود</option>
      </select>
      <button class="btn" type="submit">اعمال</button>
      <?php if ($q !== '' || $statusFilter !== ''): ?><a class="btn btn-ghost" href="./index.php?view=devices">پاک‌کردن</a><?php endif; ?>
    </form>
    <div class="table-wrap">
      <table>
        <thead><tr><th>دستگاه</th><th>مشتری</th><th>لایسنس</th><th>وضعیت</th><th>آخرین مشاهده</th><th>عملیات</th></tr></thead>
        <tbody>
        <?php foreach ($deviceRows as $row): ?>
          <tr>
            <td><strong><?php echo karen_admin_e($row['device_label'] ?: 'بدون نام'); ?></strong><div class="muted small"><code><?php echo karen_admin_e(substr((string) $row['device_key_id'], 0, 8)); ?>…</code></div></td>
            <td><?php echo karen_admin_e($row['reference_code']); ?></td>
            <td><a href="<?php echo karen_admin_e(karen_admin_url(['license' => $row['public_id']])); ?>"><code><?php echo karen_admin_e(substr((string) $row['public_id'], 0, 8)); ?>…</code></a><div><?php echo karen_admin_badge($row['license_status']); ?></div></td>
            <td><?php echo karen_admin_badge($row['status']); ?></td>
            <td><?php echo karen_admin_dt($row['last_seen_at'] ?? null); ?></td>
            <td>
              <form method="post" data-confirm="<?php echo $row['status'] === 'active' ? 'این دستگاه مسدود شود؟ دسترسی آن تا فعال‌سازی مجدد قطع می‌شود.' : 'این دستگاه دوباره فعال شود؟'; ?>" data-confirm-title="<?php echo $row['status'] === 'active' ? 'مسدودسازی دستگاه' : 'فعال‌سازی مجدد'; ?>" data-confirm-label="<?php echo $row['status'] === 'active' ? 'مسدود کن' : 'فعال کن'; ?>">
                <input type="hidden" name="csrf" value="<?php echo karen_admin_e($csrf); ?>">
                <input type="hidden" name="license_public_id" value="<?php echo karen_admin_e($row['public_id']); ?>">
                <input type="hidden" name="device_key_id" value="<?php echo karen_admin_e($row['device_key_id']); ?>">
                <input type="hidden" name="action" value="<?php echo $row['status'] === 'active' ? 'device_revoke' : 'device_reactivate'; ?>">
                <button class="btn btn-sm <?php echo $row['status'] === 'active' ? 'btn-danger' : 'btn-success'; ?>" type="submit"><?php echo $row['status'] === 'active' ? 'مسدودکردن' : 'فعال‌سازی مجدد'; ?></button>
              </form>
            </td>
          </tr>
        <?php endforeach; ?>
        <?php if (!$deviceRows): ?>
          <tr><td colspan="6"><div class="empty"><?php echo karen_admin_icon('phone'); ?><div>دستگاهی یافت نشد.</div></div></td></tr>
        <?php endif; ?>
        </tbody>
      </table>
    </div>
    <?php karen_admin_pager($page, $pages, ['view'=>'devices','q'=>$q,'status'=>$statusFilter]); ?>
  </section>
<?php elseif ($view === 'events'): ?>
  <div class="page-head">
    <div>
      <h1>رویدادها</h1>
      <p><?php echo karen_admin_fa($totalRows); ?> رویداد ثبت‌شده.</p>
    </div>
  </div>

  <section class="card">
    <form class="toolbar" method="get" action="./index.php">
      <input type="hidden" name="view" value="events">
      <div class="search">
        <?php echo karen_admin_icon('search'); ?>
        <input class="input" type="search" name="q" value="<?php echo karen_admin_e($q); ?>" placeholder="جستجوی رویداد، لایسنس یا دستگاه…">
      </div>
      <button class="btn" type="submit">جستجو</button>
      <?php if ($q !== ''): ?><a class="btn btn-ghost" href="./index.php?view=events">پاک‌کردن</a><?php endif; ?>
    </form>
    <div class="table-wrap">
      <table>
        <thead><tr><th>زمان</th><th>رویداد</th><th>لایسنس</th><th>دستگاه</th></tr></thead>
        <tbody>
        <?php foreach ($eventRows as $row): ?>
          <tr>
            <td><?php echo karen_admin_dt($row['created_at'] ?? null); ?></td>
            <td><span class="badge plan"><?php echo karen_admin_e($eventLabels[$row['event_type']] ?? $row['event_type']); ?></span><div class="muted small"><code><?php echo karen_admin_e($row['event_type']); ?></code></div></td>
            <td><?php if (!empty($row['public_id'])): ?><a href="<?php echo karen_admin_e(karen_admin_url(['license' => $row['public_id']])); ?>"><code><?php echo karen_admin_e(substr((string) $row['public_id'], 0, 8)); ?>…</code></a><?php else: ?>—<?php endif; ?></td>
            <td><?php echo karen_admin_e($row['device_label'] ?? '—'); ?></td>
          </tr>
        <?php endforeach; ?>
        <?php if (!$eventRows): ?>
          <tr><td colspan="4"><div class="empty"><?php echo karen_admin_icon('activity'); ?><div>رویدادی یافت نشد.</div></div></td></tr>
        <?php endif; ?>
        </tbody>
      </table>
    </div>
    <?php karen_admin_pager($page, $pages, ['view'=>'events','q'=>$q]); ?>
  </section>
<?php elseif ($view === 'license' && $license): ?>
  <div class="page-head">
    <div>
      <h1>جزئیات لایسنس</h1>
      <p><code id="license-id"><?php echo karen_admin_e($license['public_id']); ?></code></p>
    </div>
    <div class="actions">
      <button class="btn" type="button" data-copy="#license-id"><?php echo karen_admin_icon('copy'); ?>کپی شناسه</button>
      <a class="btn" href="./index.php?view=licenses"><?php echo karen_admin_icon('arrow'); ?>بازگشت</a>
    </div>
  </div>

  <section class="card" class="mb-16">
    <div class="card-body">
      <dl class="detail-grid">
        <div class="detail-item"><dt>مشتری</dt><dd><?php echo karen_admin_e($license['reference_code']); ?></dd></div>
        <div class="detail-item"><dt>محصول</dt><dd><?php echo karen_admin_e($license['product_code']); ?></dd></div>
        <div class="detail-item"><dt>پلن</dt><dd><span class="badge plan"><?php echo karen_admin_e(karen_admin_plan_label($license['plan'])); ?></span></dd></div>
        <div class="detail-item"><dt>وضعیت</dt><dd><?php echo karen_admin_badge($license['status']); ?></dd></div>
        <div class="detail-item"><dt>دستگاه فعال</dt><dd><?php echo karen_admin_fa($license['active_devices']); ?> از <?php echo karen_admin_fa($license['max_devices']); ?></dd></div>
        <div class="detail-item"><dt>انقضای لایسنس</dt><dd><?php echo karen_admin_dt($license['expires_at'] ?? null); ?></dd></div>
        <div class="detail-item"><dt>انقضای کد فعال‌سازی</dt><dd><?php echo karen_admin_dt($license['activation_code_expires_at'] ?? null); ?></dd></div>
        <div class="detail-item"><dt>ظرفیت</dt><dd><meter min="0" max="<?php echo (int) $license['max_devices']; ?>" value="<?php echo (int) $license['active_devices']; ?>"></meter></dd></div>
      </dl>
    </div>
  </section>

  <section class="card" class="mb-16">
    <div class="card-head"><h2>دستگاه‌ها</h2><span class="muted small"><?php echo karen_admin_fa(count($devices)); ?> دستگاه</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>نام</th><th>شناسه دستگاه</th><th>وضعیت</th><th>فعال‌سازی</th><th>آخرین مشاهده</th><th>عملیات</th></tr></thead>
        <tbody>
        <?php foreach ($devices as $device): ?>
          <tr>
            <td><strong><?php echo karen_admin_e($device['device_label'] ?: 'بدون نام'); ?></strong></td>
            <td><code><?php echo karen_admin_e($device['device_key_id']); ?></code></td>
            <td><?php echo karen_admin_badge($device['status']); ?></td>
            <td><?php echo karen_admin_dt($device['activated_at'] ?? null); ?></td>
            <td><?php echo karen_admin_dt($device['last_seen_at'] ?? null); ?></td>
            <td>
              <form method="post" data-confirm="<?php echo $device['status'] === 'active' ? 'این دستگاه مسدود شود؟' : 'این دستگاه دوباره فعال شود؟'; ?>" data-confirm-title="<?php echo $device['status'] === 'active' ? 'مسدودسازی دستگاه' : 'فعال‌سازی مجدد'; ?>" data-confirm-label="<?php echo $device['status'] === 'active' ? 'مسدود کن' : 'فعال کن'; ?>">
                <input type="hidden" name="csrf" value="<?php echo karen_admin_e($csrf); ?>">
                <input type="hidden" name="license_public_id" value="<?php echo karen_admin_e($license['public_id']); ?>">
                <input type="hidden" name="device_key_id" value="<?php echo karen_admin_e($device['device_key_id']); ?>">
                <input type="hidden" name="action" value="<?php echo $device['status'] === 'active' ? 'device_revoke' : 'device_reactivate'; ?>">
                <button class="btn btn-sm <?php echo $device['status'] === 'active' ? 'btn-danger' : 'btn-success'; ?>" type="submit"><?php echo $device['status'] === 'active' ? 'مسدودکردن' : 'فعال‌سازی مجدد'; ?></button>
              </form>
            </td>
          </tr>
        <?php endforeach; ?>
        <?php if (!$devices): ?>
          <tr><td colspan="6"><div class="empty"><?php echo karen_admin_icon('phone'); ?><div>دستگاهی ثبت نشده است.</div></div></td></tr>
        <?php endif; ?>
        </tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>رویدادهای این لایسنس</h2></div>
    <div class="timeline">
      <?php foreach ($events as $event): ?>
        <div class="timeline-item">
          <span class="timeline-dot"></span>
          <div>
            <div class="timeline-title"><?php echo karen_admin_e($eventLabels[$event['event_type']] ?? $event['event_type']); ?></div>
            <div class="timeline-meta"><?php echo karen_admin_e($event['device_label'] ?? ''); ?> · <?php echo karen_admin_e($event['created_at'] ?? ''); ?> UTC</div>
          </div>
        </div>
      <?php endforeach; ?>
      <?php if (!$events): ?>
        <div class="empty"><?php echo karen_admin_icon('activity'); ?><div>رویدادی ثبت نشده است.</div></div>
      <?php endif; ?>
    </div>
  </section>
<?php endif;

karen_admin_layout_end();
