<?php
declare(strict_types=1);

if (!defined('KAREN_ADMIN_PAGE')) {
    header('HTTP/1.1 404 Not Found');
    exit;
}

function karen_admin_e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function karen_admin_fa($value): string
{
    return strtr((string) $value, ['0'=>'۰','1'=>'۱','2'=>'۲','3'=>'۳','4'=>'۴','5'=>'۵','6'=>'۶','7'=>'۷','8'=>'۸','9'=>'۹']);
}

function karen_admin_icon(string $name): string
{
    $paths = [
        'shield' => '<path d="M12 3 5 6v5c0 5 3.4 8.4 7 10 3.6-1.6 7-5 7-10V6Z"/><circle cx="12" cy="10.5" r="2"/><path d="M11 12h2l.7 5h-3.4Z"/>',
        'grid' => '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
        'key' => '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2M15 5l4 4M12 8l4 4"/>',
        'phone' => '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
        'activity' => '<path d="M3 12h4l2.5-7 5 14L17 12h4"/>',
        'plus' => '<path d="M12 5v14M5 12h14"/>',
        'search' => '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
        'sun' => '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        'moon' => '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
        'menu' => '<path d="M4 7h16M4 12h16M4 17h16"/>',
        'x' => '<path d="M6 6l12 12M18 6 6 18"/>',
        'download' => '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
        'copy' => '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
        'check' => '<path d="m5 12 4.5 4.5L19 7"/>',
        'alert' => '<path d="M12 3 2.5 20h19Z"/><path d="M12 9v5M12 17.5v.5"/>',
        'info' => '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
        'clock' => '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        'users' => '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 13.6A6.5 6.5 0 0 1 21.5 20"/>',
        'box' => '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
        'arrow' => '<path d="M19 12H5M11 6l-6 6 6 6"/>',
        'external' => '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/>',
        'trash' => '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
        'refresh' => '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
        'logout' => '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    ];
    $body = $paths[$name] ?? $paths['info'];
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $body . '</svg>';
}

function karen_admin_status_label(string $status): string
{
    $map = [
        'active' => 'فعال',
        'revoked' => 'مسدود',
        'suspended' => 'معلق',
        'expired' => 'منقضی',
        'pending' => 'در انتظار',
    ];
    return $map[$status] ?? $status;
}

function karen_admin_plan_label(string $plan): string
{
    $map = ['pro' => 'حرفه‌ای', 'proplus' => 'حرفه‌ای پلاس'];
    return $map[$plan] ?? $plan;
}

function karen_admin_badge(string $status, string $label = ''): string
{
    $class = preg_replace('/[^a-z0-9_-]/', '', strtolower($status));
    return '<span class="badge ' . $class . '">' . karen_admin_e($label !== '' ? $label : karen_admin_status_label($status)) . '</span>';
}

function karen_admin_dt($value): string
{
    if ($value === null || $value === '') {
        return '—';
    }
    return karen_admin_e($value) . ' <span class="muted small">UTC</span>';
}

function karen_admin_url(array $params = []): string
{
    $params = array_filter($params, static function ($v) {
        return $v !== null && $v !== '';
    });
    return './index.php' . ($params ? '?' . http_build_query($params) : '');
}

function karen_admin_layout_start(string $title, string $active, string $adminUser, string $nonce): void
{
    $e = 'karen_admin_e';
    $icon = 'karen_admin_icon';
    $nav = [
        'overview' => ['./index.php', 'نمای کلی', 'grid'],
        'licenses' => ['./index.php?view=licenses', 'لایسنس‌ها', 'key'],
        'devices' => ['./index.php?view=devices', 'دستگاه‌ها', 'phone'],
        'events' => ['./index.php?view=events', 'رویدادها', 'activity'],
        'issue' => ['./issue-license.php', 'صدور لایسنس', 'plus'],
    ];
    ?>
<!doctype html>
<html lang="fa" dir="rtl" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#0b1220">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="ادمین staging">
  <link rel="manifest" href="./manifest.json">
  <link rel="icon" href="./assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="./assets/apple-touch-icon.png">
  <title><?php echo $e($title); ?> — ادمین حساب‌یار</title>
  <script nonce="<?php echo $e($nonce); ?>">
    try {
      var t = localStorage.getItem('karen-admin-theme');
      if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    } catch (e) {}
  </script>
  <link rel="stylesheet" href="./assets/admin.css?v=20261101">
  <script src="./assets/admin.js?v=20261101" defer></script>
</head>
<body data-page="<?php echo $e($active); ?>">
<div class="app">
  <div class="overlay" data-nav-close></div>
  <aside class="sidebar" id="sidebar" aria-label="ناوبری اصلی">
    <div class="brand">
      <div class="brand-logo"><?php echo $icon('shield'); ?></div>
      <div>
        <div class="brand-title">حساب‌یار کارن</div>
        <div class="brand-sub">مرکز مدیریت لایسنس</div>
      </div>
    </div>
    <nav class="nav">
      <div class="nav-label">مدیریت</div>
      <?php foreach ($nav as $key => $item): ?>
        <a href="<?php echo $e($item[0]); ?>" class="<?php echo $active === $key ? 'active' : ''; ?>">
          <?php echo $icon($item[2]); ?><span><?php echo $e($item[1]); ?></span>
        </a>
      <?php endforeach; ?>
      <div class="nav-label">میان‌بر</div>
      <a href="/app/" target="_blank" rel="noopener"><?php echo $icon('external'); ?><span>وب‌اپ آزمایشی</span></a>
    </nav>
    <div class="sidebar-foot">
      <div class="install-card" data-install-card>
        <?php echo $icon('download'); ?>
        <div>
          <strong>نصب اپ اندروید</strong>
          <div class="muted small">داشبورد را مثل اپ نصب کن.</div>
          <button class="btn btn-primary btn-sm" type="button" data-install>نصب</button>
        </div>
      </div>
      <div class="user-chip">
        <div class="avatar"><?php echo $e(function_exists('mb_substr') ? mb_substr($adminUser, 0, 1, 'UTF-8') : substr($adminUser, 0, 1)); ?></div>
        <div>
          <div class="small"><strong><?php echo $e($adminUser); ?></strong></div>
          <div class="muted small">Directory Privacy فعال</div>
        </div>
      </div>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <button class="icon-btn menu-btn" type="button" data-nav-open aria-label="باز کردن منو"><?php echo $icon('menu'); ?></button>
      <h1 class="page-title"><?php echo $e($title); ?></h1>
      <div class="topbar-spacer"></div>
      <span class="env-pill"><span class="env-dot"></span>آزمایشی</span>
      <button class="icon-btn" type="button" data-theme-toggle aria-label="تغییر پوسته"><?php echo $icon('sun'); ?></button>
      <button class="icon-btn hidden" type="button" data-install aria-label="نصب اپ"><?php echo $icon('download'); ?></button>
    </header>
    <main class="content">
<?php
}

function karen_admin_layout_end(): void
{
    $icon = 'karen_admin_icon';
    ?>
    </main>
  </div>

  <nav class="mobile-nav" aria-label="ناوبری موبایل">
    <a href="./index.php" data-mobile="overview"><?php echo $icon('grid'); ?><span>نمای کلی</span></a>
    <a href="./index.php?view=licenses" data-mobile="licenses"><?php echo $icon('key'); ?><span>لایسنس</span></a>
    <a href="./index.php?view=devices" data-mobile="devices"><?php echo $icon('phone'); ?><span>دستگاه</span></a>
    <a href="./issue-license.php" data-mobile="issue"><?php echo $icon('plus'); ?><span>صدور</span></a>
  </nav>

  <div class="toast-stack" data-toasts></div>

  <div class="modal-backdrop" data-modal>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h3 id="modal-title" data-modal-title>تأیید عملیات</h3>
      <p data-modal-body>آیا مطمئن هستی؟</p>
      <div class="modal-actions">
        <button class="btn" type="button" data-modal-cancel>انصراف</button>
        <button class="btn btn-primary" type="button" data-modal-confirm>تأیید</button>
      </div>
    </div>
  </div>
</div>
</body>
</html>
<?php
}
