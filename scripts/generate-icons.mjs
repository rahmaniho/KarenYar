/**
 * تولید آیکون‌های PWA حساب‌یار کارن سافت — بدون هیچ وابستگی خارجی (فقط node:zlib)
 * اجرا: npm run icons
 * خروجی: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAVY = [11, 27, 58];
const NEON = [57, 255, 136];

// ——— CRC32 برای چانک‌های PNG ———
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // فیلتر None
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // عمق رنگ
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ——— هندسه‌ی لوگو: مربع سرمه‌ای + مربع سبز نئونی + حرف K سرمه‌ای ———
function inRoundedRect(x, y, cx, cy, w, h, r) {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  if (dx > r || dy > r) return false;
  if (dx <= 0 || dy <= 0) return true;
  return dx * dx + dy * dy <= r * r;
}
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** رنگ نقطه (x,y) در بوم size×size — variant: 'any' | 'maskable' | 'apple' */
function sample(x, y, size, variant) {
  const fullBleed = variant !== 'any';
  const bgRadius = fullBleed ? 0 : size * 0.2;
  if (!inRoundedRect(x, y, size / 2, size / 2, size, size, bgRadius)) return [0, 0, 0, 0];

  const emblem = size * (variant === 'maskable' ? 0.52 : 0.6);
  const ex = size / 2;
  const ey = size / 2;
  if (inRoundedRect(x, y, ex, ey, emblem, emblem, emblem * 0.24)) {
    // حرف K: ساقه عمودی + دو بازوی قطری
    const s = emblem / 100;
    const kx = ex - 22 * s;
    const ky = ey;
    const stroke = 6.4 * s;
    const onStem = distToSegment(x, y, kx, ky - 26 * s, kx, ky + 26 * s) <= stroke;
    const onUpper = distToSegment(x, y, kx + 2 * s, ky - 2 * s, kx + 24 * s, ky - 25 * s) <= stroke;
    // خط‌پوشانی ظریف برای اتصال بازوها
    const onLower = distToSegment(x, y, kx + 3 * s, ky + 1 * s, kx + 25 * s, ky + 26 * s) <= stroke;
    if (onStem || onUpper || onLower) return [...NAVY, 255];
    return [...NEON, 255];
  }
  return [...NAVY, 255];
}

function render(size, variant) {
  const SS = 2; // سوپرسمپلینگ ۲×۲ برای لبه‌های نرم
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [pr, pg, pb, pa] = sample(
            x + (sx + 0.5) / SS,
            y + (sy + 0.5) / SS,
            size,
            variant,
          );
          r += pr * pa;
          g += pg * pa;
          b += pb * pa;
          a += pa;
        }
      }
      const n = SS * SS;
      const idx = (y * size + x) * 4;
      const alpha = a / n;
      out[idx] = alpha > 0 ? Math.round(r / a) : 0;
      out[idx + 1] = alpha > 0 ? Math.round(g / a) : 0;
      out[idx + 2] = alpha > 0 ? Math.round(b / a) : 0;
      out[idx + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, size, out);
}

const outDir = dirname(fileURLToPath(import.meta.url)) + '/../public/icons';
mkdirSync(outDir, { recursive: true });
const targets = [
  ['icon-192.png', 192, 'any'],
  ['icon-512.png', 512, 'any'],
  ['icon-maskable-512.png', 512, 'maskable'],
  ['apple-touch-icon.png', 180, 'apple'],
];
for (const [name, size, variant] of targets) {
  writeFileSync(`${outDir}/${name}`, render(size, variant));
  console.log('✓', name);
}
