<?php
declare(strict_types=1);

// Disposable localhost MySQL/MariaDB only. Never deploy this fixture to cPanel.
if (PHP_SAPI !== 'cli' || getenv('KAREN_LICENSE_DB_TESTS') !== '1') { exit(1); }

function refresh_handoff_finish(array $worker, int $status = 200, ?string $error = null): array
{
    $response = refresh_test_finish($worker);
    refresh_test_response($response, $status, $error);
    refresh_test_assert(!in_array('nonce_delete', array_column(refresh_test_trace($worker), 'kind'), true), 'Web request must not execute a prepared or direct nonce DELETE');
    return $response;
}

function refresh_handoff_start_cleanup(): array
{
    global $scratch, $children;
    $base = $scratch . '/handoff-cleaner-' . bin2hex(random_bytes(6));
    $worker = ['base' => $base, 'trace' => $base . '.trace', 'release' => $base . '.release'];
    $process = proc_open([PHP_BINARY, $scratch . '/cleanup-refresh-nonces.php', '--run'], [
        0 => ['pipe', 'r'], 1 => ['file', $base . '.out', 'w'], 2 => ['file', $base . '.err', 'w'],
    ], $pipes, null, array_replace(getenv(), ['KAREN_CLEANUP_TEST_TRACE' => $worker['trace']]));
    refresh_test_assert(is_resource($process), 'Start actual private cleanup CLI in test directory');
    fclose($pipes[0]);
    $worker['process'] = $process;
    $children[$base] = $worker;
    return $worker;
}

refresh_test_case('web refresh leaves a large expired backlog, grace markers and live markers untouched', function (): void {
    for ($i = 0; $i < 150; $i++) { nonce_test_insert('handoff-backlog-' . $i, time() - 1800, 2); }
    $grace = nonce_test_insert('handoff-grace', time() - 30, 2);
    $live = nonce_test_insert('handoff-live', time() + 600, 2);
    $worker = refresh_test_start(refresh_test_input());
    refresh_test_claims(refresh_handoff_finish($worker));
    refresh_test_effects(153, 1, 1);
    refresh_test_equal(1, nonce_test_count($grace), 'Web preserves recently expired marker');
    refresh_test_equal(1, nonce_test_count($live), 'Web preserves live marker');
});

refresh_test_case('a locked expired nonce does not block an unrelated web refresh', function () use ($db): void {
    $old = nonce_test_insert('handoff-locked-expired', time() - 1800, 2);
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('SELECT nonce_hash FROM device_refresh_nonces WHERE nonce_hash = ? FOR UPDATE');
        $stmt->execute([$old]);
        refresh_test_assert($stmt->fetch() !== false, 'Expired nonce is actually locked');
        $worker = refresh_test_start(refresh_test_input());
        // Finish while the old row is still X-locked: no timing-only assertion.
        refresh_test_claims(refresh_handoff_finish($worker));
        refresh_test_assert($db->inTransaction(), 'Expired-row owner still holds its transaction');
        $db->commit();
        refresh_test_effects(2, 1, 1);
    } finally { if ($db->inTransaction()) { $db->rollBack(); } }
});

refresh_test_case('an existing expired marker still rejects the same signed nonce instead of being purged by web', function () use ($db, $devices): void {
    $input = refresh_test_input();
    $hash = hash('sha256', $devices[1]['key_id'] . '|' . $input['nonce'], true);
    $stmt = $db->prepare('INSERT INTO device_refresh_nonces (nonce_hash, device_id, expires_at) VALUES (?, 1, ?)');
    $stmt->execute([$hash, gmdate('Y-m-d H:i:s', time() - 30)]);
    $worker = refresh_test_start($input);
    refresh_handoff_finish($worker, 409, 'replay_detected');
    refresh_test_effects(1, 0, 0);
    refresh_test_equal(0, karen_nonce_cleanup($db, true)['deleted'], 'Independent cleanup also preserves the grace-period marker');
    refresh_test_equal(1, nonce_test_count($hash), 'Rejected replay leaves the marker intact');
});

refresh_test_case('independent cleanup commits old rows while a successful web transaction is still open', function () use ($db): void {
    nonce_test_insert('handoff-during-web', time() - 1800, 2);
    $input = refresh_test_input();
    $worker = refresh_test_start($input, ['pause_after' => 'event']);
    refresh_test_wait($worker, 'after', 'event');
    try {
        refresh_test_assert(!in_array('commit', array_column(refresh_test_trace($worker), 'kind'), true), 'Web has not committed yet');
        refresh_test_equal(1, karen_nonce_cleanup($db, true)['deleted'], 'Independent cleanup deletes old committed marker without business locks');
    } finally { touch($worker['release']); }
    refresh_test_claims(refresh_handoff_finish($worker));
    refresh_test_effects(1, 1, 1);
    $replay = refresh_test_start($input);
    refresh_handoff_finish($replay, 409, 'replay_detected');
    refresh_test_effects(1, 1, 1);
});

refresh_test_case('a real cleanup CLI waiting on an old row does not hold up web authorization', function () use ($db): void {
    $old = nonce_test_insert('handoff-cli-wait', time() - 1800, 2);
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('SELECT nonce_hash FROM device_refresh_nonces WHERE nonce_hash = ? FOR UPDATE');
        $stmt->execute([$old]);
        refresh_test_assert($stmt->fetch() !== false, 'Old nonce holder owns an X lock');
        $web = refresh_test_start(refresh_test_input(), ['pause_after' => 'device']);
        refresh_test_wait($web, 'after', 'device');
        $cleaner = refresh_handoff_start_cleanup();
        refresh_test_wait($cleaner, 'after', 'connect');
        refresh_test_wait_for_lock($cleaner);
        // The ready web worker resumes while the actual cleanup DELETE is blocked.
        // The old row stays locked until after web success, then cleanup may finish.
        touch($web['release']);
        refresh_test_claims(refresh_handoff_finish($web));
        refresh_test_assert($db->inTransaction(), 'Old nonce is still locked after web success');
        $db->commit();
        $result = refresh_test_finish($cleaner);
        refresh_test_equal(true, $result['ok'], 'Actual private CLI succeeds after releasing the old row');
        refresh_test_equal('run', $result['mode'], 'Actual private CLI run, not preflight');
        refresh_test_equal(1, $result['deleted'], 'Actual private CLI deletes only old committed row');
        refresh_test_effects(1, 1, 1);
    } finally { if ($db->inTransaction()) { $db->rollBack(); } }
});

refresh_test_case('web rollback cannot undo already committed independent cleanup', function () use ($db): void {
    nonce_test_insert('handoff-before-web-rollback', time() - 1800, 2);
    $worker = refresh_test_start(refresh_test_input(), ['pause_after' => 'nonce', 'fail_event' => true]);
    refresh_test_wait($worker, 'after', 'nonce');
    try {
        refresh_test_equal(1, karen_nonce_cleanup($db, true)['deleted'], 'Old marker is independently committed away');
    } finally { touch($worker['release']); }
    $response = refresh_handoff_finish($worker, 500, 'refresh_failed');
    refresh_test_assert(!array_key_exists('token', $response['body']), 'Failed web transaction returns no token');
    refresh_test_assert(in_array('rollback', array_column(refresh_test_trace($worker), 'kind'), true), 'Web transaction rolled back');
    refresh_test_effects(0, 0, 0);
});
