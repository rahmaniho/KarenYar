<?php
declare(strict_types=1);

// Real-clock/real-lock cases for the disposable DB harness; never deploy this file.
if (PHP_SAPI !== 'cli' || getenv('KAREN_LICENSE_DB_TESTS') !== '1') { exit(1); }

function refresh_freshness_timestamp(array $worker): int
{
    foreach (refresh_test_trace($worker) as $entry) {
        if ($entry['phase'] === 'after' && $entry['kind'] === 'input_clock') {
            return (int) $entry['timestamp'];
        }
    }
    throw new RuntimeException('Synthetic client timestamp was not recorded');
}

function refresh_freshness_wait_until(int $unix): void
{
    $deadline = microtime(true) + 8;
    while (time() < $unix) {
        if (microtime(true) > $deadline) { throw new RuntimeException('Real-clock freshness deadline'); }
        usleep(10000);
    }
}

function refresh_freshness_old_marker(string $label): void
{
    global $db;
    $stmt = $db->prepare('INSERT INTO device_refresh_nonces (nonce_hash, device_id, expires_at) VALUES (?, 2, ?)');
    $stmt->execute([hash('sha256', 'freshness-old-' . $label, true), gmdate('Y-m-d H:i:s', time() - 1800)]);
}

function refresh_freshness_aborted(array $worker, int $remainingNonces, string $error = 'invalid_timestamp'): void
{
    $response = refresh_test_finish($worker);
    refresh_test_response($response, 400, $error);
    refresh_test_assert(!array_key_exists('token', $response['body']), 'Aborted request must not return a signed token');
    $kinds = array_column(refresh_test_trace($worker), 'kind');
    refresh_test_assert(in_array('rollback', $kinds, true), 'Freshness abort must roll back');
    refresh_test_assert(!in_array('commit', $kinds, true), 'Freshness abort must never commit');
    refresh_test_effects($remainingNonces, 0, 0);
}

foreach ([
    'license' => 'SELECT id FROM licenses WHERE id = 1 FOR UPDATE',
    'account' => 'SELECT id FROM customers WHERE id = 1 FOR UPDATE',
    'device' => 'SELECT id FROM license_devices WHERE id = 1 FOR UPDATE',
] as $kind => $lockSql) {
    refresh_test_case('timestamp aging behind real ' . $kind . ' lock is rejected without effects', function () use ($db, $kind, $lockSql): void {
        refresh_freshness_old_marker($kind);
        $db->beginTransaction();
        try {
            $db->query($lockSql)->fetch();
            $worker = refresh_test_start(refresh_test_input(), ['stamp_offset' => -298]);
            refresh_test_wait($worker, 'before', $kind);
            refresh_test_wait_for_lock($worker);
            // The request was within the real 300-second window on entry.
            // Age it past the boundary while InnoDB actually holds it waiting.
            refresh_freshness_wait_until(refresh_freshness_timestamp($worker) + 301);
            $db->commit();
            refresh_freshness_aborted($worker, 1);
        } finally { if ($db->inTransaction()) { $db->rollBack(); } }
    });
}

foreach (['nonce', 'event'] as $kind) {
    refresh_test_case('timestamp aging after ' . $kind . ' SQL rolls back every effect before commit', function () use ($kind): void {
        refresh_freshness_old_marker('after-' . $kind);
        $worker = refresh_test_start(refresh_test_input(), ['stamp_offset' => -298, 'pause_after' => $kind]);
        refresh_test_wait($worker, 'after', $kind);
        try {
            refresh_freshness_wait_until(refresh_freshness_timestamp($worker) + 301);
        } finally { touch($worker['release']); }
        // Includes rollback of the legacy purge, inserted nonce, event and last_seen.
        refresh_freshness_aborted($worker, 1);
    });
}

refresh_test_case('valid lock wait refreshes token and nonce clocks rather than reusing entry time', function () use ($db): void {
    $db->beginTransaction();
    try {
        $db->query('SELECT id FROM licenses WHERE id = 1 FOR UPDATE')->fetch();
        $worker = refresh_test_start(refresh_test_input(), ['stamp_offset' => 0]);
        refresh_test_wait($worker, 'before', 'license');
        refresh_test_wait_for_lock($worker);
        $entry = refresh_freshness_timestamp($worker);
        refresh_freshness_wait_until($entry + 2);
        $release = time();
        $db->commit();
        $claims = refresh_test_claims(refresh_test_finish($worker));
        refresh_test_assert($claims['iat'] >= $release && $claims['iat'] > $entry, 'Token uses the post-lock PHP clock');
        refresh_test_equal($claims['iat'], $claims['nbf'], 'Refreshed nbf');
        refresh_test_equal(7 * 86400, $claims['exp'] - $claims['iat'], 'Unchanged token TTL');
        $expiry = (int) $db->query('SELECT UNIX_TIMESTAMP(expires_at) FROM device_refresh_nonces WHERE device_id = 1')->fetchColumn();
        refresh_test_equal($claims['iat'] + 600, $expiry, 'Nonce TTL starts from the refreshed PHP clock');
        $seen = (int) $db->query('SELECT UNIX_TIMESTAMP(last_seen_at) FROM license_devices WHERE id = 1')->fetchColumn();
        refresh_test_assert($seen >= $release, 'last_seen remains a post-lock DB timestamp');
        refresh_test_effects(1, 1, 1);
    } finally { if ($db->inTransaction()) { $db->rollBack(); } }
});

refresh_test_case('license expiring while its real lock waits cannot return an expired token', function () use ($db): void {
    $db->beginTransaction();
    try {
        $db->exec('UPDATE licenses SET expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 SECOND) WHERE id = 1');
        $expiry = (int) $db->query('SELECT UNIX_TIMESTAMP(expires_at) FROM licenses WHERE id = 1')->fetchColumn();
        $worker = refresh_test_start(refresh_test_input(), ['stamp_offset' => 0]);
        refresh_test_wait($worker, 'before', 'license');
        refresh_test_wait_for_lock($worker);
        refresh_freshness_wait_until($expiry + 1);
        $db->commit();
        $response = refresh_test_finish($worker);
        // Engines may reject at the active-license locking read or at the PHP cap.
        refresh_test_assert(in_array($response['status'], [400, 404], true), 'Expired locked license must not return 200');
        refresh_test_response($response, $response['status'], $response['status'] === 400 ? 'license_expired' : 'device_or_license_invalid');
        refresh_test_assert(!array_key_exists('token', $response['body']), 'Expired license never returns a token');
        refresh_test_effects(0, 0, 0);
    } finally { if ($db->inTransaction()) { $db->rollBack(); } }
});

refresh_test_case('license expiring after event SQL rolls back signed token and all writes', function () use ($db): void {
    refresh_freshness_old_marker('expired-after-event');
    $db->exec('UPDATE licenses SET expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 4 SECOND) WHERE id = 1');
    $expiry = (int) $db->query('SELECT UNIX_TIMESTAMP(expires_at) FROM licenses WHERE id = 1')->fetchColumn();
    $worker = refresh_test_start(refresh_test_input(), ['stamp_offset' => 0, 'pause_after' => 'event']);
    refresh_test_wait($worker, 'after', 'event');
    try { refresh_freshness_wait_until($expiry + 1); }
    finally { touch($worker['release']); }
    refresh_freshness_aborted($worker, 1, 'license_expired');
});

refresh_test_case('independent cleanup cannot revive a signed request aging behind a real license lock', function () use ($db, $devices, $options, $password): void {
    $input = refresh_test_input();
    $hash = hash('sha256', $devices[1]['key_id'] . '|' . $input['nonce'], true);
    $stmt = $db->prepare('INSERT INTO device_refresh_nonces (nonce_hash, device_id, expires_at) VALUES (?, 1, ?)');
    $stmt->execute([$hash, gmdate('Y-m-d H:i:s', time() - 1800)]);
    $db->beginTransaction();
    try {
        $db->query('SELECT id FROM licenses WHERE id = 1 FOR UPDATE')->fetch();
        $worker = refresh_test_start($input, ['stamp_offset' => -298]);
        refresh_test_wait($worker, 'before', 'license');
        refresh_test_wait_for_lock($worker);
        $maintenance = new PDO((string) getenv('KAREN_LICENSE_TEST_DSN'), 'root', $password, $options);
        $result = karen_nonce_cleanup($maintenance, true);
        refresh_test_equal(1, $result['deleted'], 'Real independent cleanup removes the old marker without the parent lock');
        $maintenance = null;
        refresh_freshness_wait_until(refresh_freshness_timestamp($worker) + 301);
        $db->commit();
        refresh_freshness_aborted($worker, 0);
    } finally { if ($db->inTransaction()) { $db->rollBack(); } }
});
