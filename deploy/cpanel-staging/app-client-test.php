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

if (($_GET['confirm'] ?? '') !== 'STAGING_APP_CLIENT_TEST') {
    karen_fail(404, 'not_found');
}

$nonce = base64_encode(random_bytes(18));
header("Content-Security-Policy: default-src 'none'; script-src 'nonce-" . $nonce . "'; style-src 'nonce-" . $nonce . "'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>تست کلاینت لایسنس — staging</title>
  <style nonce="<?php echo $nonce; ?>">
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    main { max-width: 760px; margin: auto; }
    h1 { font-size: 20px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 14px; padding: 16px; margin: 14px 0; }
    .warn { color: #fbbf24; line-height: 1.9; }
    .ok { color: #34d399; }
    .bad { color: #f87171; }
    label { display: block; margin: 12px 0 6px; }
    input { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #475569; background: #0b1220; color: #e2e8f0; font: inherit; }
    button { margin: 6px 0 6px 6px; border: 0; border-radius: 10px; padding: 12px 14px; background: #4f46e5; color: white; cursor: pointer; font: inherit; }
    button.secondary { background: #334155; }
    button.danger { background: #7f1d1d; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    pre { direction: ltr; text-align: left; white-space: pre-wrap; word-break: break-word; background: #0b1220; border: 1px solid #334155; border-radius: 10px; padding: 12px; min-height: 80px; }
    .muted { color: #94a3b8; font-size: 13px; line-height: 1.8; }
  </style>
</head>
<body>
<main>
  <h1>تست کلاینت مرورگری لایسنس — staging</h1>
  <p class="warn">این صفحه موقت است. کد فعال‌سازی را فقط در کادر زیر وارد کن؛ در چت یا اسکرین‌شات نفرست. کلید خصوصی دستگاه از مرورگر خارج نمی‌شود.</p>

  <div class="card">
    <p id="state">در حال بارگذاری…</p>
    <button id="gen" type="button">۱) ساخت کلید دستگاه</button>
    <label for="code">کد فعال‌سازی</label>
    <input id="code" type="password" autocomplete="off" placeholder="KS-STAGE-…">
    <button id="activate" type="button">۲) فعال‌سازی</button>
    <button id="refresh" type="button" class="secondary">۳) تمدید توکن</button>
    <button id="verify" type="button" class="secondary">۴) بررسی آنلاین</button>
    <button id="clear" type="button" class="danger">پاک‌کردن اطلاعات این مرورگر</button>
    <p class="muted">پاک‌کردن اطلاعات مرورگر، دستگاه را در سرور لغو نمی‌کند. برای لغو دستگاه از پنل ادمین استفاده کن.</p>
  </div>

  <div class="card">
    <h2>گزارش</h2>
    <pre id="log">JS_LOADING</pre>
  </div>
</main>

<script nonce="<?php echo $nonce; ?>">
'use strict';
const API = '/v1';
const PRODUCT = 'hesabyar';
const DB_NAME = 'karen-staging-app-client';
const STORE = 'kv';
const $ = (id) => document.getElementById(id);
const logEl = $('log');
const stateEl = $('state');
let device = null;
let session = null;
let busy = false;

function log(line, cls) {
  const time = new Date().toISOString().slice(11, 19);
  logEl.textContent += '\n' + time + ' ' + line;
  logEl.className = cls || '';
}
function fail(message) { log('ERROR: ' + message, 'bad'); }
function bytesToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64ToBytes(b64) {
  let s = String(b64).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function uuidv4() {
  if (crypto.randomUUID) return crypto.randomUUID().toLowerCase();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = hex(b);
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexeddb_open_failed'));
  });
}
async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('indexeddb_get_failed'));
  });
}
async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('indexeddb_set_failed'));
  });
}
async function idbDel(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('indexeddb_del_failed'));
  });
}
async function post(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok || !data || data.ok !== true) {
    const code = data && data.error ? data.error : 'http_' + res.status;
    throw new Error(code);
  }
  return data;
}
async function verifyToken(token, kid, issuerPublicKeyB64, deviceKeyId) {
  const parts = String(token).split('.');
  if (parts.length !== 4 || parts[0] !== 'HY2') throw new Error('invalid_token_format');
  const header = JSON.parse(new TextDecoder().decode(b64ToBytes(parts[1])));
  const claims = JSON.parse(new TextDecoder().decode(b64ToBytes(parts[2])));
  const signature = b64ToBytes(parts[3]);
  if (header.alg !== 'EdDSA' || header.typ !== 'hesabyar-license') throw new Error('invalid_token_header');
  if (header.kid !== kid) throw new Error('kid_mismatch');
  if (header.env !== 'staging' || claims.env !== 'staging') throw new Error('invalid_environment');
  const publicKey = await crypto.subtle.importKey('raw', b64ToBytes(issuerPublicKeyB64), { name: 'Ed25519' }, false, ['verify']);
  const message = new TextEncoder().encode(parts[1] + '.' + parts[2]);
  const valid = await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, signature, message);
  if (!valid) throw new Error('invalid_token_signature');
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== 'karen-license-staging') throw new Error('invalid_issuer');
  if (claims.aud !== 'hesabyar-app') throw new Error('invalid_audience');
  if (claims.product !== PRODUCT) throw new Error('product_mismatch');
  if (claims.device_key_id !== deviceKeyId) throw new Error('device_mismatch');
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw new Error('token_expired');
  if (typeof claims.nbf !== 'number' || claims.nbf > now + 60) throw new Error('token_not_yet_valid');
  return claims;
}
function render() {
  const buttons = ['gen', 'activate', 'refresh', 'verify', 'clear'];
  buttons.forEach((id) => { $(id).disabled = busy; });
  if (!device) {
    stateEl.textContent = 'دستگاه ساخته نشده است.';
    return;
  }
  let text = 'دستگاه: ' + device.id;
  if (session && session.license) {
    text += ' | پلن: ' + session.license.plan;
    text += ' | انقضای توکن: ' + session.license.token_expires_at;
  } else {
    text += ' | فعال نشده';
  }
  stateEl.textContent = text;
}
async function run(name, fn) {
  if (busy) return;
  busy = true;
  render();
  log('START ' + name);
  try {
    await fn();
  } catch (e) {
    fail(e && e.message ? e.message : String(e));
  } finally {
    busy = false;
    render();
  }
}
async function generateDevice() {
  if (!crypto.subtle) throw new Error('webcrypto_missing');
  if (device && !confirm('کلید دستگاه فعلی جایگزین شود؟ دستگاه قبلی در سرور باقی می‌ماند.')) return;
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  device = { id: uuidv4(), privateKey: pair.privateKey, publicKeyB64: bytesToB64(raw) };
  session = null;
  await idbSet('device', device);
  await idbDel('session');
  log('DEVICE_CREATED ' + device.id, 'ok');
}
async function activate() {
  if (!device) throw new Error('device_missing');
  const code = $('code').value.trim();
  if (!code) throw new Error('activation_code_missing');
  const data = await post('/activations.php', {
    activation_code: code,
    device_key_id: device.id,
    device_public_key_b64: device.publicKeyB64,
    device_label: 'staging-web-client',
    product_code: PRODUCT,
  });
  $('code').value = '';
  const claims = await verifyToken(data.token, data.kid, data.issuer_public_key_b64, device.id);
  session = { token: data.token, kid: data.kid, issuerPublicKeyB64: data.issuer_public_key_b64, license: data.license, claims };
  await idbSet('session', session);
  log('ACTIVATION_OK plan=' + claims.plan + ' device_id=' + claims.device_id, 'ok');
}
async function refresh() {
  if (!device) throw new Error('device_missing');
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const message = ['karen-license-refresh-v1', PRODUCT, device.id, String(timestamp), nonce].join('\n');
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, device.privateKey, new TextEncoder().encode(message));
  const data = await post('/refresh.php', {
    device_key_id: device.id,
    product_code: PRODUCT,
    timestamp,
    nonce,
    signature_b64: bytesToB64(signature),
  });
  const claims = await verifyToken(data.token, data.kid, data.issuer_public_key_b64, device.id);
  session = { token: data.token, kid: data.kid, issuerPublicKeyB64: data.issuer_public_key_b64, license: data.license, claims };
  await idbSet('session', session);
  log('REFRESH_OK exp=' + claims.exp, 'ok');
}
async function verifyOnline() {
  if (!session) throw new Error('session_missing');
  const data = await post('/verify.php', { token: session.token, product_code: PRODUCT });
  if (data.valid !== true) throw new Error('verify_not_valid');
  log('VERIFY_OK plan=' + data.license.plan + ' checked_at=' + data.checked_at, 'ok');
}
async function clearLocal() {
  if (!confirm('اطلاعات این مرورگر پاک شود؟ دستگاه در سرور لغو نمی‌شود.')) return;
  await idbDel('device');
  await idbDel('session');
  device = null;
  session = null;
  $('code').value = '';
  log('LOCAL_CLEARED', 'ok');
}
window.addEventListener('error', (e) => fail('JS_ERROR: ' + e.message));
$('gen').addEventListener('click', () => run('generate', generateDevice));
$('activate').addEventListener('click', () => run('activate', activate));
$('refresh').addEventListener('click', () => run('refresh', refresh));
$('verify').addEventListener('click', () => run('verify', verifyOnline));
$('clear').addEventListener('click', () => run('clear', clearLocal));
(async () => {
  try {
    logEl.textContent = 'JS_OK';
    device = await idbGet('device');
    session = await idbGet('session');
    render();
    log('READY');
  } catch (e) {
    fail(e && e.message ? e.message : String(e));
  }
})();
</script>
</body>
</html>
