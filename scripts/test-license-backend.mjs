#!/usr/bin/env node
/**
 * License backend contract checks.
 *
 * Default: PHP syntax + real PHP key-material decoding + sodium Ed25519 checks.
 * --encoding-only: decoding/wiring checks without requiring the sodium extension.
 * PHP_BINARY may point to a PHP CLI executable or an executable CLI wrapper.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const staging = join(root, 'deploy/cpanel-staging');
const helper = join(staging, 'v1/license-encoding.php');
const phpBinary = process.env.PHP_BINARY || 'php';
const encodingOnly = process.argv.includes('--encoding-only');
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

function runPhp(args) {
  const result = spawnSync(phpBinary, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000,
  });
  if (result.error) {
    throw new Error(
      `Cannot execute PHP (${phpBinary}). Install PHP 8.2+ with sodium, or set PHP_BINARY. ${result.error.message}`,
    );
  }
  assert.equal(result.status, 0, `PHP failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function phpJson(code) {
  const output = runPhp(['-r', code]);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`PHP did not return JSON: ${output.slice(0, 1000)}`);
  }
}

function phpFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return phpFiles(path);
    return entry.name.endsWith('.php') ? [path] : [];
  });
}

function checkWiring() {
  const expectations = [
    ['activations.php', 'karen_license_decode_key_material($devicePublicKeyB64, 32)'],
    ['refresh.php', 'karen_license_decode_key_material($signatureB64, 64)'],
  ];
  for (const [file, call] of expectations) {
    const source = readFileSync(join(staging, 'v1', file), 'utf8');
    assert.ok(source.includes("require_once __DIR__ . '/license-encoding.php';"), file);
    assert.ok(source.includes(call), `${file} must use the shared decoder: ${call}`);
    assert.ok(!source.includes('base64_decode($devicePublicKeyB64'), file);
    assert.ok(!source.includes('base64_decode($signatureB64'), file);
  }
  return expectations.length;
}

function encodingCases() {
  const cases = [];
  const add = (name, bytes, expectedBytes, encoded, valid) => {
    cases.push({
      name,
      bytes: expectedBytes,
      encoded,
      valid,
      hex: valid ? Buffer.from(bytes).toString('hex') : null,
    });
  };
  for (const size of [32, 64]) {
    const allBytes = Uint8Array.from({ length: size }, (_, i) => (i * 37 + size) % 256);
    add(`url-${size}`, allBytes, size, b64url(allBytes), true);
    add(`standard-${size}`, allBytes, size, b64(allBytes), true);
    add(`standard-unpadded-${size}`, allBytes, size, b64(allBytes).replace(/=+$/, ''), true);
    add(
      `wrong-length-${size}-short`,
      allBytes.subarray(0, size - 1),
      size,
      b64url(allBytes.subarray(0, size - 1)),
      false,
    );
    add(
      `wrong-length-${size}-long`,
      new Uint8Array(size + 1),
      size,
      b64url(new Uint8Array(size + 1)),
      false,
    );
    const nonCanonical = b64url(allBytes);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const lastIndex = nonCanonical.length - 1;
    const changed = alphabet[alphabet.indexOf(nonCanonical[lastIndex]) | 1];
    add(`noncanonical-${size}`, allBytes, size, nonCanonical.slice(0, -1) + changed, false);
  }
  for (const [name, encoded] of [
    ['empty', ''],
    ['space', 'YWJj IA=='],
    ['newline', 'YWJj\nIA=='],
    ['invalid-character', 'YWJj!A=='],
    ['bad-padding', 'YWJjIA==='],
    ['impossible-length', 'A'],
    ['url-encoded', '%2B%2F'],
  ]) {
    cases.push({ name, bytes: 32, encoded, valid: false, hex: null });
  }
  cases.push({ name: 'invalid-expected-size', bytes: 0, encoded: 'AA', valid: false, hex: null });
  return cases;
}

function checkEncoding() {
  const cases = encodingCases();
  const code = `
$cases = json_decode(base64_decode('${b64(Buffer.from(JSON.stringify(cases)))}'), true, 512, JSON_THROW_ON_ERROR);
require base64_decode('${b64(Buffer.from(helper))}');
$out = [];
foreach ($cases as $case) {
    $raw = karen_license_decode_key_material($case['encoded'], $case['bytes']);
    $out[] = ['name' => $case['name'], 'ok' => $raw !== null, 'hex' => $raw === null ? null : bin2hex($raw)];
}
echo json_encode($out, JSON_THROW_ON_ERROR);
`;
  const results = phpJson(code);
  assert.equal(results.length, cases.length);
  for (let i = 0; i < cases.length; i += 1) {
    assert.equal(results[i].name, cases[i].name);
    assert.equal(results[i].ok, cases[i].valid, cases[i].name);
    assert.equal(results[i].hex, cases[i].hex, cases[i].name);
  }
  return cases.length;
}

async function checkSodium() {
  const available = runPhp([
    '-r',
    "echo function_exists('sodium_crypto_sign_verify_detached') ? '1' : '0';",
  ]);
  assert.equal(
    available,
    '1',
    'PHP sodium extension is required for the full backend contract test.',
  );
  const cases = [];
  let urlSafePublicKeys = 0;
  let urlSafeSignatures = 0;
  for (let i = 0; i < 32; i += 1) {
    const pair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const publicKey = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
    const message = new TextEncoder().encode(
      `karen-license-refresh-v1\nhesabyar\n11111111-1111-4111-8111-${String(i).padStart(12, '0')}\n1762000000\nnonce-${i}`,
    );
    const signature = new Uint8Array(
      await webcrypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, message),
    );
    const tampered = Uint8Array.from(signature);
    tampered[0] ^= 1;
    const publicB64 = b64url(publicKey);
    const signatureB64 = b64url(signature);
    if (/[-_]/.test(publicB64)) urlSafePublicKeys += 1;
    if (/[-_]/.test(signatureB64)) urlSafeSignatures += 1;
    cases.push({
      name: `real-ed25519-${i}`,
      public: publicB64,
      signature: signatureB64,
      legacyPublic: b64(publicKey),
      legacySignature: b64(signature),
      tampered: b64url(tampered),
      message: b64url(message),
    });
  }
  assert.ok(urlSafePublicKeys > 0 && urlSafeSignatures > 0, 'test corpus must exercise base64url');
  const code = `
$cases = json_decode(base64_decode('${b64(Buffer.from(JSON.stringify(cases)))}'), true, 512, JSON_THROW_ON_ERROR);
require base64_decode('${b64(Buffer.from(helper))}');
$decode = static function (string $value, int $size): string {
    $raw = karen_license_decode_key_material($value, $size);
    if ($raw === null) { throw new RuntimeException('decode_failed'); }
    return $raw;
};
$decodeMessage = static function (string $value): string {
    if ($value === '' || strlen($value) > 4096 || !preg_match('/^[A-Za-z0-9_-]+$/D', $value)) {
        throw new RuntimeException('invalid_test_message');
    }
    $normalized = strtr($value, '-_', '+/');
    $normalized .= str_repeat('=', (4 - strlen($normalized) % 4) % 4);
    $raw = base64_decode($normalized, true);
    if ($raw === false) { throw new RuntimeException('message_decode_failed'); }
    return $raw;
};
$out = [];
foreach ($cases as $case) {
    $public = $decode($case['public'], 32);
    $message = $decodeMessage($case['message']);
    $signature = $decode($case['signature'], 64);
    $out[] = [
      'name' => $case['name'],
      'valid' => sodium_crypto_sign_verify_detached($signature, $message, $public),
      'legacy' => sodium_crypto_sign_verify_detached($decode($case['legacySignature'], 64), $message, $decode($case['legacyPublic'], 32)),
      'tampered' => sodium_crypto_sign_verify_detached($decode($case['tampered'], 64), $message, $public),
    ];
}
echo json_encode($out, JSON_THROW_ON_ERROR);
`;
  const results = phpJson(code);
  assert.equal(results.length, cases.length);
  for (const result of results) {
    assert.equal(result.valid, true, result.name);
    assert.equal(result.legacy, true, result.name);
    assert.equal(result.tampered, false, result.name);
  }
  return cases.length * 3;
}

const wired = checkWiring();
const encodingCount = checkEncoding();
let sodiumCount = 0;
let syntaxCount = 0;
if (!encodingOnly) {
  const files = phpFiles(staging);
  for (const file of files) runPhp(['-l', resolve(file)]);
  syntaxCount = files.length;
  sodiumCount = await checkSodium();
}
console.log(
  JSON.stringify({
    ok: true,
    wiredEndpoints: wired,
    encodingCases: encodingCount,
    sodiumAssertions: sodiumCount,
    phpSyntaxFiles: syntaxCount,
  }),
);
