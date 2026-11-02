<?php
declare(strict_types=1);

// CLI-only disposable native cases. Never upload fixtures or synthetic codes.
if (PHP_SAPI !== 'cli' || getenv('KAREN_LICENSE_DB_TESTS') !== '1') { exit(1); }

function activation_diagnostic_report(array $worker, ?string $path = null): array
{
    global $activationEndpoint;
    $path ??= $worker['trace'] . '.activation-report.json';
    refresh_test_assert(is_file($path), 'Private attempt report was written at worker shutdown');
    $raw = (string) file_get_contents($path);
    refresh_test_assert(strlen($raw) < 4096, 'Report has bounded metadata only');
    $report = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    refresh_test_equal([
        'version', 'started_at_utc', 'phase', 'outcome', 'http_status', 'error_code',
        'input_code_bytes', 'input_has_non_ascii', 'computed_hash_bytes', 'device_key_id',
        'locator_license_id', 'license_public_id', 'committed', 'database_error_code',
        'finished_at_utc', 'source_sha256', 'php_version', 'php_sapi', 'db_schema',
        'db_utc_now', 'db_time_zone', 'transaction_open_at_report',
    ], array_keys($report), 'Strict metadata-only allowlist: no code/hash/token/key/header/label fields');
    refresh_test_equal(hash_file('sha256', $activationEndpoint), $report['source_sha256'], 'Fingerprint is the actual executed endpoint copy');
    clearstatcache(true, $path);
    refresh_test_equal(0600, fileperms($path) & 0777, 'Report is owner-readable/writable only');
    refresh_test_equal([], glob($path . '.tmp-*'), 'No temporary report files remain');
    return $report;
}

activation_test_case('private diagnostics preserve a successful activation and exact public response', function () use ($db): void {
    global $database;
    $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2");
    $input = activation_test_input(4, 1, ['device_label' => 'SYNTHETIC-LABEL-NEVER-LOG']);
    $worker = activation_test_start($input);
    $response = refresh_test_finish($worker);
    refresh_test_claims($response);
    $report = activation_diagnostic_report($worker);
    refresh_test_equal('committed', $report['phase'], 'Success phase');
    refresh_test_equal('succeeded', $report['outcome'], 'Success outcome');
    refresh_test_equal(200, $report['http_status'], 'Success status');
    refresh_test_equal(null, $report['error_code'], 'No business error');
    refresh_test_equal(true, $report['committed'], 'Commit was reached');
    refresh_test_equal(false, $report['transaction_open_at_report'], 'Report follows commit');
    refresh_test_equal($database, $report['db_schema'], 'Probe observes actual PDO schema');
    refresh_test_equal('+00:00', $report['db_time_zone'], 'Probe observes actual UTC PDO session');
    refresh_test_assert(is_string($report['db_utc_now']) && $report['db_utc_now'] !== '', 'PDO clock metadata was read');
    refresh_test_equal('test-license-A', $report['license_public_id'], 'Actual matched license, not a client-supplied guess');
    refresh_test_equal(1, $report['locator_license_id'], 'Actual locator ID');
    refresh_test_equal($input['device_key_id'], $report['device_key_id'], 'Only public validated device UUID is recorded');
    $raw = (string) file_get_contents($worker['trace'] . '.activation-report.json');
    foreach ([$input['activation_code'], $input['device_public_key_b64'], $input['device_label'], $response['body']['token'], hash('sha256', 'public-activation-test|' . $input['activation_code'])] as $forbidden) {
        refresh_test_assert(!str_contains($raw, $forbidden), 'Private report contains no sensitive request/response material');
    }
    refresh_test_effects(0, 1, 1);
});

activation_test_case('private diagnostics distinguish an unmatched code without recording its bytes', function (): void {
    $input = activation_test_input(1, 1, ['activation_code' => "PUBLIC-UNKNOWN-\u{200E}-NEVER-LOG"]);
    $worker = activation_test_start($input);
    $response = refresh_test_finish($worker);
    refresh_test_response($response, 404, 'invalid_activation_code');
    refresh_test_equal(['ok' => false, 'error' => 'invalid_activation_code'], $response['body'], 'Public rejection is unchanged');
    $report = activation_diagnostic_report($worker);
    refresh_test_equal('license_lookup', $report['phase'], 'Lookup miss distinguished privately');
    refresh_test_equal('rejected', $report['outcome'], 'Rejected outcome');
    refresh_test_equal(404, $report['http_status'], 'Rejected status');
    refresh_test_equal(strlen($input['activation_code']), $report['input_code_bytes'], 'Only input byte count');
    refresh_test_equal(true, $report['input_has_non_ascii'], 'Only a non-ASCII presence flag');
    refresh_test_equal(32, $report['computed_hash_bytes'], 'Only computed digest size');
    refresh_test_equal(null, $report['locator_license_id'], 'No invented license association');
    refresh_test_equal(false, $report['committed'], 'No commit');
    refresh_test_equal(false, $report['transaction_open_at_report'], 'No transaction started');
    refresh_test_assert(!str_contains((string) file_get_contents($worker['trace'] . '.activation-report.json'), 'PUBLIC-UNKNOWN'), 'No raw code logged');
    activation_test_unchanged();
});

activation_test_case('private diagnostics distinguish empty input without opening PDO', function (): void {
    $worker = activation_test_start(activation_test_input(1, 1, ['activation_code' => '  ']));
    refresh_test_response(refresh_test_finish($worker), 400, 'invalid_activation_code');
    $report = activation_diagnostic_report($worker);
    refresh_test_equal('validate_code', $report['phase'], 'Input validation stage');
    refresh_test_equal(0, $report['input_code_bytes'], 'Trimmed empty input');
    refresh_test_equal(null, $report['computed_hash_bytes'], 'No hash call');
    refresh_test_equal(null, $report['db_schema'], 'Reporting never creates a PDO connection');
    refresh_test_assert(!in_array('connect', array_column(refresh_test_trace($worker), 'kind'), true), 'No connection for reporting');
    activation_test_unchanged();
});

activation_test_case('private diagnostics do not log malformed device ID contents', function (): void {
    $worker = activation_test_start(activation_test_input(1, 1, ['device_key_id' => 'SYNTHETIC-INVALID-ID-NEVER-LOG']));
    refresh_test_response(refresh_test_finish($worker), 400, 'invalid_device_key_id');
    $report = activation_diagnostic_report($worker);
    refresh_test_equal('validate_device_id', $report['phase'], 'Device ID validation stage');
    refresh_test_equal(null, $report['device_key_id'], 'Unvalidated raw device ID is not recorded');
    refresh_test_assert(!str_contains((string) file_get_contents($worker['trace'] . '.activation-report.json'), 'SYNTHETIC-INVALID'), 'No raw malformed ID');
    activation_test_unchanged();
});

activation_test_case('private diagnostics distinguish a locked license recheck rejection', function () use ($db): void {
    $db->exec("UPDATE licenses SET status = 'revoked' WHERE id = 1");
    $worker = activation_test_start(activation_test_input());
    refresh_test_response(refresh_test_finish($worker), 404, 'invalid_activation_code');
    $report = activation_diagnostic_report($worker);
    refresh_test_equal('license_recheck', $report['phase'], 'License recheck distinguished');
    refresh_test_equal(1, $report['locator_license_id'], 'Locator succeeded before rejection');
    refresh_test_equal(null, $report['license_public_id'], 'No authorized row was returned');
    refresh_test_equal(false, $report['transaction_open_at_report'], 'Report follows rollback');
    activation_test_unchanged();
});

activation_test_case('private diagnostics distinguish metadata rejection from code lookup', function () use ($db): void {
    $db->exec("UPDATE customers SET status = 'suspended' WHERE id = 1");
    $worker = activation_test_start(activation_test_input());
    refresh_test_response(refresh_test_finish($worker), 404, 'invalid_activation_code');
    $report = activation_diagnostic_report($worker);
    refresh_test_equal('account_recheck', $report['phase'], 'Parent metadata rejection');
    refresh_test_equal('test-license-A', $report['license_public_id'], 'Matched row is known');
    refresh_test_equal(false, $report['transaction_open_at_report'], 'Rollback before probe');
    activation_test_unchanged();
});

activation_test_case('private diagnostics follow precommit code-expiry rollback', function () use ($db): void {
    $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2");
    $db->exec('UPDATE licenses SET activation_code_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 120 SECOND) WHERE id = 1');
    $worker = activation_test_start(activation_test_input(4), ['db_shift_after' => ['event' => 200]]);
    refresh_test_response(refresh_test_finish($worker), 404, 'invalid_activation_code');
    $report = activation_diagnostic_report($worker);
    refresh_test_equal('precommit_expiry', $report['phase'], 'Late expiry is not reported as a lookup miss');
    refresh_test_equal(false, $report['committed'], 'No commit after expiry');
    refresh_test_equal(false, $report['transaction_open_at_report'], 'Rollback precedes report');
    activation_test_unchanged();
});

activation_test_case('private diagnostics survive event exceptions without logging exception text', function () use ($db): void {
    $db->exec("UPDATE license_devices SET status = 'revoked' WHERE id = 2");
    $worker = activation_test_start(activation_test_input(4), ['fail_event' => true]);
    refresh_test_response(refresh_test_finish($worker), 500, 'activation_failed');
    $report = activation_diagnostic_report($worker);
    refresh_test_equal('event_insert', $report['phase'], 'Actual failure stage');
    refresh_test_equal('failed', $report['outcome'], 'Exception outcome');
    refresh_test_equal(500, $report['http_status'], 'Original 500 contract');
    refresh_test_equal(false, $report['committed'], 'No partial commit');
    refresh_test_equal(false, $report['transaction_open_at_report'], 'Rollback precedes report');
    refresh_test_assert(!str_contains((string) file_get_contents($worker['base'] . '.err'), 'test_injected_event_failure'), 'No raw exception message in PHP log');
    activation_test_unchanged();
});

activation_test_case('unavailable private report sink never changes API failure or business rows', function (): void {
    global $scratch;
    $path = $scratch . '/nonexistent-directory/report.json';
    $worker = activation_test_start(activation_test_input(1, 1, ['activation_code' => 'public-unmatched']), ['activation_report_file' => $path]);
    refresh_test_response(refresh_test_finish($worker), 404, 'invalid_activation_code');
    refresh_test_assert(!file_exists($path), 'No report directory is created automatically');
    refresh_test_assert(!str_contains((string) file_get_contents($worker['base'] . '.err'), 'public-unmatched'), 'Sink failure does not log request contents');
    activation_test_unchanged();
});

activation_test_case('private report replaces bounded history and tightens existing permissions', function (): void {
    global $scratch;
    $path = $scratch . '/shared-activation-report.json';
    file_put_contents($path, str_repeat('OLD-SYNTHETIC-HISTORY', 300));
    chmod($path, 0666);
    $worker = activation_test_start(activation_test_input(1, 1, ['activation_code' => 'public-unmatched']), ['activation_report_file' => $path]);
    refresh_test_response(refresh_test_finish($worker), 404, 'invalid_activation_code');
    activation_diagnostic_report($worker, $path);
    refresh_test_assert(!str_contains((string) file_get_contents($path), 'OLD-SYNTHETIC-HISTORY'), 'History is replaced, never appended');
    activation_test_unchanged();
});

activation_test_case('private report atomically replaces a destination symlink without touching its target', function (): void {
    global $scratch;
    $target = $scratch . '/synthetic-symlink-target.txt';
    $path = $scratch . '/symlink-activation-report.json';
    file_put_contents($target, 'PUBLIC-SYNTHETIC-SENTINEL');
    refresh_test_assert(symlink($target, $path), 'Synthetic destination symlink created');
    $worker = activation_test_start(activation_test_input(1, 1, ['activation_code' => 'public-unmatched']), ['activation_report_file' => $path]);
    refresh_test_response(refresh_test_finish($worker), 404, 'invalid_activation_code');
    activation_diagnostic_report($worker, $path);
    refresh_test_assert(!is_link($path), 'Destination itself was replaced');
    refresh_test_equal('PUBLIC-SYNTHETIC-SENTINEL', file_get_contents($target), 'Symlink target was never followed or altered');
    activation_test_unchanged();
});

activation_test_case('GET method guard never creates a private attempt report', function (): void {
    $worker = activation_test_start(activation_test_input(), ['method' => 'GET']);
    refresh_test_response(refresh_test_finish($worker), 405, 'method_not_allowed');
    refresh_test_assert(!file_exists($worker['trace'] . '.activation-report.json'), 'Non-POST never changes attempt metadata');
    activation_test_unchanged();
});

activation_test_case('private attempt reporting is disabled outside staging', function (): void {
    $worker = activation_test_start(activation_test_input(1, 1, ['activation_code' => 'public-unmatched']), ['production_environment' => true]);
    refresh_test_response(refresh_test_finish($worker), 404, 'invalid_activation_code');
    refresh_test_assert(!file_exists($worker['trace'] . '.activation-report.json'), 'Non-staging never writes report');
    activation_test_unchanged();
});

activation_test_case('private diagnostics preserve a PDO object preopened globally by bootstrap', function (): void {
    $worker = activation_test_start(activation_test_input(1, 1, ['activation_code' => 'public-unmatched']), ['preopened_global_pdo' => true]);
    refresh_test_response(refresh_test_finish($worker), 404, 'invalid_activation_code');
    $report = activation_diagnostic_report($worker);
    refresh_test_equal('license_lookup', $report['phase'], 'Preexisting global PDO was not overwritten by reporting setup');
    refresh_test_assert(is_string($report['db_schema']), 'Preopened connection is still usable');
    activation_test_unchanged();
});

activation_test_case('private report IO failure remains soft with a throwing PHP error handler', function (): void {
    global $scratch;
    $worker = activation_test_start(activation_test_input(1, 1, ['activation_code' => 'public-unmatched']), [
        'activation_report_file' => $scratch . '/another-nonexistent-directory/report.json',
        'throw_on_report_io_warning' => true,
    ]);
    refresh_test_response(refresh_test_finish($worker), 404, 'invalid_activation_code');
    activation_test_unchanged();
});
