<?php
declare(strict_types=1);

// Actual activations.php + refresh.php, real InnoDB transactions and Ed25519.
// Private bootstrap/hash/rate-limit/HTTP are doubles. Admin-style changes below
// use PDO and the license-first protocol; they do NOT execute admin/index.php.
// CLI-only, synthetic disposable data. Never upload this fixture to cPanel.
if (PHP_SAPI !== 'cli' || getenv('KAREN_LICENSE_DB_TESTS') !== '1') { exit(1); }

function activation_test_case(string $name, callable $call): void
{
    refresh_test_case('activation: ' . $name, static function () use ($call): void {
        global $db;
        $stmt = $db->prepare('UPDATE licenses SET activation_code_hash = ?, activation_code_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY) WHERE id = ?');
        foreach ([1 => 'public-code-A', 2 => 'public-code-B'] as $id => $code) {
            // Same PUBLIC synthetic hasher as the test bootstrap, not the host's hasher.
            $stmt->execute([hash('sha256', 'public-activation-test|' . $code, true), $id]);
        }
        $call();
    });
}
function activation_test_input(int $device = 1, int $license = 1, array $overrides = [], bool $legacy = false): array
{
    global $devices;
    $pair = sodium_crypto_sign_seed_keypair(hash('sha256', 'public-device-test-seed-' . $device, true));
    $public = sodium_crypto_sign_publickey($pair);
    $devices[$device] = [
        'key_id' => '11111111-1111-4111-8111-' . str_pad((string) $device, 12, '0', STR_PAD_LEFT),
        'secret' => sodium_crypto_sign_secretkey($pair),
    ];
    return array_replace([
        'activation_code' => $license === 1 ? 'public-code-A' : 'public-code-B',
        'device_key_id' => $devices[$device]['key_id'],
        'device_public_key_b64' => $legacy ? base64_encode($public) : rtrim(strtr(base64_encode($public), '+/', '-_'), '='),
        'device_label' => 'Synthetic activation device',
        'product_code' => 'hesabyar',
    ], $overrides);
}
function activation_test_start(array $input, array $controls = []): array
{
    global $activationEndpoint;
    return refresh_test_start($input, $controls, $activationEndpoint);
}
function activation_test_request(array $input, array $controls = []): array
{
    return refresh_test_finish(activation_test_start($input, $controls));
}
function activation_test_unchanged(): void
{
    global $db;
    refresh_test_effects(0, 0, 0);
    refresh_test_equal(3, (int) $db->query('SELECT COUNT(*) FROM license_devices')->fetchColumn(), 'No device inserted/deleted');
}
function activation_test_active_count(): int
{
    global $db;
    return (int) $db->query("SELECT COUNT(*) FROM license_devices WHERE license_id = 1 AND status = 'active'")->fetchColumn();
}
function activation_test_aborted(array $worker, int $status, string $error): void
{
    $response = refresh_test_finish($worker);
    refresh_test_response($response, $status, $error);
    refresh_test_assert(!array_key_exists('token', $response['body']), 'Rejected activation never returns a token');
    $kinds = array_column(refresh_test_trace($worker), 'kind');
    refresh_test_assert(in_array('rollback', $kinds, true), 'Rejected transaction rolls back');
    refresh_test_assert(!in_array('commit', $kinds, true), 'Rejected transaction never commits');
    activation_test_unchanged();
}

activation_test_case('new device uses license, metadata, device locks and unchanged signed claims', function () use ($db): void {
    $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2");
    $input = activation_test_input(4);
    $worker = activation_test_start($input);
    $response = refresh_test_finish($worker);
    $claims = refresh_test_claims($response);
    $stmt = $db->prepare('SELECT id, license_id FROM license_devices WHERE device_key_id = ?');
    $stmt->execute([$input['device_key_id']]);
    $row = $stmt->fetch();
    refresh_test_assert(is_array($row), 'Actual endpoint inserted a new device');
    refresh_test_equal((int) $row['id'], $claims['device_id'], 'AUTO_INCREMENT ID is signed');
    refresh_test_equal($claims['device_id'], $response['body']['license']['device_id'], 'Response device matches claims');
    refresh_test_equal(1, (int) $row['license_id'], 'Device binding');
    refresh_test_equal($input['device_key_id'], $claims['device_key_id'], 'Client key binding');
    refresh_test_equal('test-license-A', $claims['jti'], 'License ID unchanged');
    refresh_test_equal('TEST-CUSTOMER-A', $claims['sub'], 'Customer unchanged');
    refresh_test_equal('pro', $claims['plan'], 'Plan unchanged');
    refresh_test_equal(['backup', 'pdf-export', 'unlimited-products', 'unlimited-transactions'], $claims['features'], 'Features unchanged');
    refresh_test_equal(2, $claims['max_devices'], 'Device cap unchanged');
    refresh_test_equal(7 * 86400, $claims['exp'] - $claims['iat'], 'Seven-day token unchanged');
    refresh_test_equal('activation.created', $db->query('SELECT event_type FROM license_events')->fetchColumn(), 'Created event');
    refresh_test_effects(0, 1, 1);
    refresh_test_equal(2, activation_test_active_count(), 'Revoked slot reused without exceeding cap');
    $reads = array_values(array_filter(refresh_test_trace($worker), static fn(array $entry): bool => $entry['phase'] === 'before' && str_starts_with((string) $entry['sql'], 'SELECT')));
    refresh_test_equal(['activation_locator', 'license', 'account', 'device', 'clock', 'count', 'clock'], array_column($reads, 'kind'), 'Executed read order');
    refresh_test_equal([false, true, true, true, true, true, true], array_column($reads, 'transaction'), 'Only the locator runs outside the transaction');
    refresh_test_assert(!str_contains($reads[1]['sql'], 'JOIN'), 'License-first locking does not depend on a join plan');
    refresh_test_assert(str_contains($reads[1]['sql'], 'id = :license_id') && str_contains($reads[1]['sql'], 'FOR UPDATE'), 'Primary-key license predicate and locking read');
    refresh_test_assert(str_contains($reads[1]['sql'], 'activation_code_hash = :activation_code_hash'), 'Code binding is rechecked under lock');
    refresh_test_assert(!in_array('nonce_delete', array_column(refresh_test_trace($worker), 'kind'), true), 'Activation does not purge refresh nonces');
});

activation_test_case('same device can reuse a valid code at cap with legacy base64', function () use ($db): void {
    $claims = refresh_test_claims(activation_test_request(activation_test_input(1, 1, [], true)));
    refresh_test_equal(1, $claims['device_id'], 'Existing device reused');
    refresh_test_equal(2, activation_test_active_count(), 'At-cap reuse creates no slot');
    refresh_test_equal(3, (int) $db->query('SELECT COUNT(*) FROM license_devices')->fetchColumn(), 'No duplicate device');
    refresh_test_equal('activation.reused', $db->query('SELECT event_type FROM license_events')->fetchColumn(), 'Reuse event');
    refresh_test_effects(0, 1, 1);
});

activation_test_case('unknown code remains 404 without starting an authorization transaction', function (): void {
    $worker = activation_test_start(activation_test_input(1, 1, ['activation_code' => 'public-unknown-code']));
    refresh_test_response(refresh_test_finish($worker), 404, 'invalid_activation_code');
    refresh_test_assert(!in_array('begin', array_column(refresh_test_trace($worker), 'kind'), true), 'Unknown locator never starts a transaction');
    activation_test_unchanged();
});

activation_test_case('new device at capacity remains 403 and makes no partial writes', function (): void {
    activation_test_aborted(activation_test_start(activation_test_input(4)), 403, 'device_limit_reached');
});

activation_test_case('existing key cannot be replaced by a different public key', function (): void {
    $other = activation_test_input(2);
    activation_test_aborted(activation_test_start(activation_test_input(1, 1, ['device_public_key_b64' => $other['device_public_key_b64']])), 409, 'device_key_mismatch');
});

activation_test_case('revoked device is not silently reactivated', function () use ($db): void {
    $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 1");
    activation_test_aborted(activation_test_start(activation_test_input()), 403, 'device_revoked');
    refresh_test_equal('revoked', $db->query('SELECT status FROM license_devices WHERE id = 1')->fetchColumn(), 'Revocation preserved');
});

activation_test_case('existing device cannot be rebound to a different license', function () use ($db): void {
    activation_test_aborted(activation_test_start(activation_test_input(1, 2)), 409, 'device_already_registered');
    refresh_test_equal(1, (int) $db->query('SELECT license_id FROM license_devices WHERE id = 1')->fetchColumn(), 'Original binding preserved');
});

activation_test_case('two new devices competing for the last slot cannot exceed capacity', function () use ($db): void {
    $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2");
    $first = activation_test_start(activation_test_input(4), ['pause_after' => 'event']);
    refresh_test_wait($first, 'after', 'event');
    $second = activation_test_start(activation_test_input(5));
    refresh_test_wait($second, 'before', 'license');
    refresh_test_wait_for_lock($second);
    touch($first['release']);
    refresh_test_claims(refresh_test_finish($first));
    refresh_test_response(refresh_test_finish($second), 403, 'device_limit_reached');
    refresh_test_equal(2, activation_test_active_count(), 'Exactly the configured active cap');
    refresh_test_equal(4, (int) $db->query('SELECT COUNT(*) FROM license_devices')->fetchColumn(), 'Only one new device inserted');
    refresh_test_effects(0, 1, 1);
});

activation_test_case('concurrent requests for the same new key are create then reuse', function () use ($db): void {
    $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2");
    $input = activation_test_input(4);
    $first = activation_test_start($input, ['pause_after' => 'event']);
    refresh_test_wait($first, 'after', 'event');
    $second = activation_test_start($input);
    refresh_test_wait($second, 'before', 'license');
    refresh_test_wait_for_lock($second);
    touch($first['release']);
    $a = refresh_test_claims(refresh_test_finish($first));
    $b = refresh_test_claims(refresh_test_finish($second));
    refresh_test_equal($a['device_id'], $b['device_id'], 'Both responses bind to the one committed device');
    refresh_test_equal(4, (int) $db->query('SELECT COUNT(*) FROM license_devices')->fetchColumn(), 'One insert only');
    refresh_test_equal(['activation.created', 'activation.reused'], $db->query('SELECT event_type FROM license_events ORDER BY id')->fetchAll(PDO::FETCH_COLUMN), 'Actual create/reuse events');
    refresh_test_effects(0, 2, 1);
});

activation_test_case('cross-license absent-key race preserves one binding and safe retry', function () use ($db): void {
    // Different product/customer rows deliberately avoid shared metadata serialization.
    $db->exec("INSERT INTO products (id, code, status) VALUES (2, 'other-app', 'active')");
    $db->exec('UPDATE licenses SET product_id = 2 WHERE id = 2');
    $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2");
    $inputs = [activation_test_input(4), activation_test_input(4, 2, ['product_code' => 'other-app'])];
    $workers = [];
    foreach ($inputs as $input) {
        $worker = activation_test_start($input, ['pause_after' => 'device']);
        refresh_test_wait($worker, 'after', 'device');
        $workers[] = $worker;
    }
    foreach ($workers as $worker) { touch($worker['release']); }
    $responses = array_map('refresh_test_finish', $workers);
    $winners = array_keys(array_filter($responses, static fn(array $response): bool => $response['status'] === 200));
    refresh_test_equal(1, count($winners), 'Exactly one cross-license registration commits');
    $winner = $winners[0];
    $loser = 1 - $winner;
    refresh_test_claims($responses[$winner], $inputs[$winner]['product_code']);
    // Preserve the current 500 transient contract; do not pretend retries are fixed.
    refresh_test_assert(in_array($responses[$loser]['status'], [409, 500], true), 'Loser rejects rather than returning a second token');
    if ($responses[$loser]['status'] === 500) {
        refresh_test_response($responses[$loser], 500, 'activation_failed');
        $errors = array_values(array_filter(refresh_test_trace($workers[$loser]), static fn(array $entry): bool => $entry['phase'] === 'error'));
        refresh_test_assert(count($errors) > 0 && in_array($errors[0]['database_error_code'], [1062, 1205, 1213], true), '500 must be an observed uniqueness/lock conflict, not an unrelated failure');
    } else {
        refresh_test_response($responses[$loser], 409, 'device_already_registered');
    }
    refresh_test_assert(!array_key_exists('token', $responses[$loser]['body']), 'Race loser never returns a token');
    $stmt = $db->prepare('SELECT license_id FROM license_devices WHERE device_key_id = ?');
    $stmt->execute([$inputs[0]['device_key_id']]);
    refresh_test_equal($winner + 1, (int) $stmt->fetchColumn(), 'Unique key bound only to winner');
    refresh_test_equal(4, (int) $db->query('SELECT COUNT(*) FROM license_devices')->fetchColumn(), 'One new binding');
    refresh_test_effects(0, 1, 1);
    refresh_test_response(activation_test_request($inputs[$loser]), 409, 'device_already_registered');
    refresh_test_effects(0, 1, 1);
});

activation_test_case('rotating a code after the locator cannot authorize its old hash', function () use ($db): void {
    $worker = activation_test_start(activation_test_input(), ['pause_after' => 'activation_locator']);
    refresh_test_wait($worker, 'after', 'activation_locator');
    $stmt = $db->prepare('UPDATE licenses SET activation_code_hash = ? WHERE id = 1');
    $stmt->execute([hash('sha256', 'public-activation-test|rotated-code', true)]);
    touch($worker['release']);
    activation_test_aborted($worker, 404, 'invalid_activation_code');
});

foreach (['products', 'customers'] as $table) {
    activation_test_case('locked metadata is rechecked after license wait: ' . $table, function () use ($db, $table): void {
        $db->beginTransaction();
        $db->query('SELECT id FROM licenses WHERE id = 1 FOR UPDATE')->fetchColumn();
        $worker = activation_test_start(activation_test_input());
        refresh_test_wait($worker, 'before', 'license');
        refresh_test_wait_for_lock($worker);
        $db->exec("UPDATE " . $table . " SET status = 'inactive' WHERE id = 1");
        $db->commit();
        activation_test_aborted($worker, 404, 'invalid_activation_code');
    });
}

foreach ([false, true] as $fillsSlot) {
    activation_test_case('admin-style device change while activation waits ' . ($fillsSlot ? 'fills' : 'frees') . ' the last slot', function () use ($db, $fillsSlot): void {
        if ($fillsSlot) { $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2"); }
        $db->beginTransaction();
        $db->query('SELECT id FROM licenses WHERE id = 1 FOR UPDATE')->fetchColumn();
        $worker = activation_test_start(activation_test_input(4));
        refresh_test_wait($worker, 'before', 'license');
        refresh_test_wait_for_lock($worker);
        // Deliberate PDO model of the admin's license-first device mutation, NOT its HTTP path.
        $db->query('SELECT id FROM license_devices WHERE id = 2 FOR UPDATE')->fetchColumn();
        $db->exec("UPDATE license_devices SET status = '" . ($fillsSlot ? 'active' : 'revoked') . "' WHERE id = 2");
        $db->commit();
        $response = refresh_test_finish($worker);
        if ($fillsSlot) {
            refresh_test_response($response, 403, 'device_limit_reached');
            activation_test_unchanged();
        } else {
            refresh_test_claims($response);
            refresh_test_effects(0, 1, 1);
        }
        refresh_test_equal(2, activation_test_active_count(), 'Cap uses committed device state, not a pre-lock snapshot');
    });
}

foreach ([true, false] as $activationFirst) {
    activation_test_case('activation and refresh serialize on the same device: ' . ($activationFirst ? 'activation' : 'refresh') . ' first', function () use ($db, $activationFirst): void {
        $activationInput = activation_test_input();
        $refreshInput = refresh_test_input();
        $first = $activationFirst
            ? activation_test_start($activationInput, ['pause_after' => 'event'])
            : refresh_test_start($refreshInput, ['pause_after' => 'event']);
        refresh_test_wait($first, 'after', 'event');
        $second = $activationFirst ? refresh_test_start($refreshInput) : activation_test_start($activationInput);
        refresh_test_wait($second, 'before', 'license');
        refresh_test_wait_for_lock($second);
        touch($first['release']);
        refresh_test_claims(refresh_test_finish($first));
        refresh_test_claims(refresh_test_finish($second));
        refresh_test_effects(1, 2, 1);
        $events = $db->query('SELECT event_type FROM license_events ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
        refresh_test_equal($activationFirst ? ['activation.reused', 'license.refreshed'] : ['license.refreshed', 'activation.reused'], $events, 'Observed commit ordering');
    });
}

activation_test_case('code expiring during a real device lock wait is rejected after the wait', function () use ($db): void {
    $db->exec('UPDATE licenses SET activation_code_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 SECOND) WHERE id = 1');
    $expiry = (int) $db->query('SELECT UNIX_TIMESTAMP(activation_code_expires_at) FROM licenses WHERE id = 1')->fetchColumn();
    $db->beginTransaction();
    $db->query('SELECT id FROM license_devices WHERE id = 1 FOR UPDATE')->fetchColumn();
    $worker = activation_test_start(activation_test_input());
    refresh_test_wait($worker, 'before', 'device');
    refresh_test_wait_for_lock($worker);
    $deadline = microtime(true) + 8;
    while ((int) $db->query('SELECT UNIX_TIMESTAMP()')->fetchColumn() <= $expiry) {
        refresh_test_assert(microtime(true) < $deadline, 'Real code expiry deadline');
        usleep(20000);
    }
    $db->commit();
    activation_test_aborted($worker, 404, 'invalid_activation_code');
});

activation_test_case('code expiry after event SQL rolls back the new device and event', function () use ($db): void {
    $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2");
    $db->exec('UPDATE licenses SET activation_code_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 120 SECOND) WHERE id = 1');
    activation_test_aborted(activation_test_start(activation_test_input(4), ['db_shift_after' => ['event' => 200]]), 404, 'invalid_activation_code');
});

activation_test_case('DB-expired license cannot commit a PHP-unexpired token after event SQL', function () use ($db): void {
    $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2");
    $db->exec('UPDATE licenses SET expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 120 SECOND) WHERE id = 1');
    activation_test_aborted(activation_test_start(activation_test_input(4), ['db_shift_after' => ['event' => 200]]), 400, 'license_expired');
});

activation_test_case('event failure rolls back a new binding and the same request can retry', function () use ($db): void {
    $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2");
    $input = activation_test_input(4);
    activation_test_aborted(activation_test_start($input, ['fail_event' => true]), 500, 'activation_failed');
    refresh_test_claims(activation_test_request($input));
    refresh_test_equal(4, (int) $db->query('SELECT COUNT(*) FROM license_devices')->fetchColumn(), 'Retry makes exactly one binding');
    refresh_test_effects(0, 1, 1);
});

activation_test_case('actual lock timeout rolls back and a later retry succeeds', function () use ($db): void {
    $db->beginTransaction();
    $db->query('SELECT id FROM licenses WHERE id = 1 FOR UPDATE')->fetchColumn();
    $worker = activation_test_start(activation_test_input(), ['lock_timeout' => 2]);
    refresh_test_wait($worker, 'before', 'license');
    refresh_test_wait_for_lock($worker);
    // Do not query device counts from the lock-holding connection until it commits.
    $response = refresh_test_finish($worker);
    refresh_test_response($response, 500, 'activation_failed');
    $errors = array_values(array_filter(refresh_test_trace($worker), static fn(array $entry): bool => $entry['phase'] === 'error'));
    refresh_test_assert(count($errors) > 0 && $errors[0]['database_error_code'] === 1205, 'Actual InnoDB lock-wait timeout');
    $db->commit();
    activation_test_unchanged();
    refresh_test_claims(activation_test_request(activation_test_input()));
    refresh_test_effects(0, 1, 1);
});

activation_test_case('non-UTC session is normalized before code/license TIMESTAMP reads', function () use ($db): void {
    $db->exec('UPDATE licenses SET expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY) WHERE id = 1');
    $expiry = (int) $db->query('SELECT UNIX_TIMESTAMP(expires_at) FROM licenses WHERE id = 1')->fetchColumn();
    $claims = refresh_test_claims(activation_test_request(activation_test_input(), ['initial_time_zone' => '+05:45']));
    refresh_test_equal($expiry, $claims['exp'], 'UTC license expiry cap');
    refresh_test_effects(0, 1, 1);
});

foreach ([1, 2] as $call) {
    activation_test_case('DB clock failure ' . $call . ' fails closed without leaving a binding', function () use ($db, $call): void {
        $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2");
        activation_test_aborted(activation_test_start(activation_test_input(4), ['fail_clock' => $call]), 500, 'activation_failed');
    });
}
