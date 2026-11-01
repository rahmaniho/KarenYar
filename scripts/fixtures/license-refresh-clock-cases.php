<?php
declare(strict_types=1);

// Real MySQL/MariaDB SQL with controlled SESSION timestamp skew only.
// Never upload this fixture; it needs the disposable localhost transaction harness.
if (PHP_SAPI !== 'cli' || getenv('KAREN_LICENSE_DB_TESTS') !== '1') { exit(1); }

function refresh_clock_aborted(array $worker, int $status = 400, string $error = 'invalid_timestamp'): void
{
    $response = refresh_test_finish($worker);
    refresh_test_response($response, $status, $error);
    refresh_test_assert(!array_key_exists('token', $response['body']), 'Clock rejection must not return a signed token');
    $kinds = array_column(refresh_test_trace($worker), 'kind');
    refresh_test_assert(in_array('rollback', $kinds, true), 'Clock rejection must roll back');
    refresh_test_assert(!in_array('commit', $kinds, true), 'Clock rejection must never commit');
}

function refresh_clock_fixed_time(array $worker): int
{
    foreach (refresh_test_trace($worker) as $entry) {
        if ($entry['kind'] === 'db_clock_control') { return (int) $entry['timestamp']; }
    }
    throw new RuntimeException('Disposable session clock was not set');
}

function refresh_clock_nonce(array $worker): void
{
    global $db;
    $row = $db->query('SELECT UNIX_TIMESTAMP(created_at) AS created, UNIX_TIMESTAMP(expires_at) AS expires FROM device_refresh_nonces WHERE device_id = 1')->fetch();
    refresh_test_assert(is_array($row), 'Committed nonce exists');
    refresh_test_equal(refresh_clock_fixed_time($worker), (int) $row['created'], 'created_at is the controlled DB insertion clock');
    refresh_test_equal((int) $row['created'] + 600, (int) $row['expires'], 'Nonce expiry is exactly 600 seconds from DB insertion');
}

foreach ([-3600, 3600, -301, 301] as $offset) {
    refresh_test_case('PHP-fresh input is rejected outside the DB timestamp window: offset ' . $offset, function () use ($offset): void {
        refresh_freshness_old_marker('db-entry-' . $offset);
        $worker = refresh_test_start(refresh_test_input(), ['stamp_offset' => 0, 'db_offset_from_input' => $offset]);
        refresh_clock_aborted($worker);
        $kinds = array_column(refresh_test_trace($worker), 'kind');
        refresh_test_assert(!in_array('nonce', $kinds, true), 'Reject before nonce mutation when the post-lock DB clock disagrees');
        refresh_test_effects(1, 0, 0);
    });
}

foreach ([-300, 300] as $offset) {
    refresh_test_case('inclusive DB timestamp boundary remains valid: offset ' . $offset, function () use ($offset): void {
        $worker = refresh_test_start(refresh_test_input(), ['stamp_offset' => 0, 'db_offset_from_input' => $offset]);
        refresh_test_claims(refresh_test_finish($worker));
        refresh_clock_nonce($worker);
        refresh_test_effects(1, 1, 1);
    });
}

foreach ([-180, 180] as $offset) {
    refresh_test_case('nonce uses DB expiry while token keeps the PHP clock: skew ' . $offset, function () use ($offset): void {
        $before = time();
        $worker = refresh_test_start(refresh_test_input(), ['stamp_offset' => 0, 'db_offset_from_input' => $offset]);
        $claims = refresh_test_claims(refresh_test_finish($worker));
        refresh_test_assert($claims['iat'] >= $before && $claims['iat'] <= time(), 'Token iat remains PHP time, not the skewed DB clock');
        refresh_test_equal(7 * 86400, $claims['exp'] - $claims['iat'], 'Unchanged seven-day token');
        refresh_clock_nonce($worker);
        refresh_test_effects(1, 1, 1);
    });
}

refresh_test_case('refresh normalizes a non-UTC session before reading TIMESTAMP or storing nonce expiry', function () use ($db): void {
    $db->exec('UPDATE licenses SET expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY) WHERE id = 1');
    $expiry = (int) $db->query('SELECT UNIX_TIMESTAMP(expires_at) FROM licenses WHERE id = 1')->fetchColumn();
    $worker = refresh_test_start(refresh_test_input(), [
        'stamp_offset' => 0, 'initial_time_zone' => '+05:45', 'db_offset_from_input' => 0,
    ]);
    $claims = refresh_test_claims(refresh_test_finish($worker));
    refresh_test_equal($expiry, $claims['exp'], 'License TIMESTAMP is parsed/capped in UTC');
    refresh_clock_nonce($worker);
    refresh_test_effects(1, 1, 1);
});

foreach (['nonce', 'event'] as $kind) {
    foreach ([-3600, 3600] as $offset) {
        refresh_test_case('DB clock shift after ' . $kind . ' cannot commit PHP-fresh input: offset ' . $offset, function () use ($kind, $offset): void {
            refresh_freshness_old_marker('db-late-' . $kind . '-' . $offset);
            $worker = refresh_test_start(refresh_test_input(), [
                'stamp_offset' => 0, 'db_shift_after' => [$kind => $offset],
            ]);
            refresh_clock_aborted($worker);
            refresh_test_effects(1, 0, 0);
        });
    }
}

refresh_test_case('license expired by the precommit DB clock cannot return a PHP-unexpired signed token', function () use ($db): void {
    refresh_freshness_old_marker('db-license-expiry');
    $db->exec('UPDATE licenses SET expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 120 SECOND) WHERE id = 1');
    $worker = refresh_test_start(refresh_test_input(), [
        'stamp_offset' => 0, 'db_shift_after' => ['event' => 200],
    ]);
    refresh_clock_aborted($worker, 400, 'license_expired');
    refresh_test_effects(1, 0, 0);
});

foreach ([1, 2] as $call) {
    refresh_test_case('DB clock query failure ' . $call . ' fails closed and rolls back without a PHP fallback', function () use ($call): void {
        refresh_freshness_old_marker('db-clock-failure-' . $call);
        $worker = refresh_test_start(refresh_test_input(), ['stamp_offset' => 0, 'fail_clock' => $call]);
        refresh_clock_aborted($worker, 500, 'refresh_failed');
        refresh_test_effects(1, 0, 0);
    });
}

foreach ([-180, 180] as $offset) {
    refresh_test_case('same signed input remains replay-rejected under DB clock skew ' . $offset, function () use ($offset): void {
        $input = refresh_test_input();
        $first = refresh_test_start($input, ['db_offset_from_input' => $offset]);
        refresh_test_claims(refresh_test_finish($first));
        refresh_clock_nonce($first);
        $replay = refresh_test_start($input, ['db_offset_from_input' => $offset]);
        refresh_clock_aborted($replay, 409, 'replay_detected');
        refresh_test_effects(1, 1, 1);
    });
}

refresh_test_case('real independent cleanup cannot revive PHP-fresh input whose DB replay window ended', function () use ($db, $password, $options): void {
    // A future-dated, still PHP-valid request is accepted only once. Advance the
    // disposable sessions' DB clock, not PHP/OS time, past both expiry and grace.
    $input = refresh_test_input(1, ['timestamp' => time() + 200]);
    $first = refresh_test_start($input, ['db_offset_from_input' => 0]);
    refresh_test_claims(refresh_test_finish($first));
    refresh_clock_nonce($first);
    $maintenance = new PDO((string) getenv('KAREN_LICENSE_TEST_DSN'), 'root', $password, $options);
    $maintenance->exec('SET timestamp = ' . ($input['timestamp'] + 1800));
    refresh_test_equal(1, karen_nonce_cleanup($maintenance, true)['deleted'], 'Actual independent cleanup deletes the now-old committed marker');
    $maintenance = null;
    refresh_test_effects(0, 1, 1);
    refresh_test_assert(abs($input['timestamp'] - time()) <= 300, 'Old signature still passes the unchanged initial PHP gate');
    $replay = refresh_test_start($input, ['db_offset_from_input' => 1800]);
    refresh_clock_aborted($replay);
    refresh_test_effects(0, 1, 1);
});
