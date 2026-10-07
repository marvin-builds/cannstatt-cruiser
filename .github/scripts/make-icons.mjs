#!/usr/bin/env node
/**
 * Generates the PWA icons in public/icons/ as crisp pixel art: a skateboard
 * under a star in front of sky, vineyard hills and a sandstone street.
 * Pure Node (zlib for PNG), no dependencies. Re-run after changing the art:
 *
 *   node .github/scripts/make-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'icons');

const PALETTE = {
  k: '#1b1f2e', // outline
  y: '#ffd23f', // star
  o: '#e89a2e', // star shade
  W: '#fff6d8', // star highlight
  r: '#e84855', // deck
  R: '#a8323c', // deck underside
  m: '#b8bcc8', // trucks
  w: '#f6d6a8', // wheels
};

/** 20x20 foreground art; '.' shows the background. */
const ART = [
  '.........k..........',
  '........kWk.........',
  '........kyk.........',
  '.......kyyok........',
  '.kkkkkkyyyyokkkkkk..',
  '..kyWyyyyyyyyyook...',
  '...kyyyyyyyyyook....',
  '....kyyyyyyyook.....',
  '....kyyyykyyyok.....',
  '...kyyokk.kkyyok....',
  '...kook.....kook....',
  '...kk.........kk....',
  'kk................kk',
  'krk..............krk',
  '.krkkkkkkkkkkkkkkrk.',
  '..krrrrrrrrrrrrrrk..',
  '...kRRRRRRRRRRRRk...',
  '....kmkkkkkkkkmk....',
  '...kwwk......kwwk...',
  '....kk........kk....',
];

const SKY = '#8ec5ea';
const SKY_LOW = '#b9dcef';
const HILL = '#6f9e4f';
const HILL_DARK = '#557f3c';
const STREET = '#d9b77e';
const STREET_DARK = '#c49a5e';

/** Background colour of art-grid cell (gx, gy); the grid extends past the art. */
function background(gx, gy) {
  const hillTop = 15 + (Math.abs(((gx % 8) + 8) % 8 - 4) >> 1);
  if (gy >= 19) return gy === 19 ? STREET_DARK : STREET;
  if (gy >= hillTop) return (gx + gy) % 3 === 0 ? HILL_DARK : HILL;
  return gy >= 11 ? SKY_LOW : SKY;
}

function hex(color) {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/** Renders the icon: art scaled by integer `scale`, centred, background filling the square. */
function render(size, scale) {
  const artPx = ART.length * scale;
  const offset = Math.floor((size - artPx) / 2);
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const gx = Math.floor((px - offset) / scale);
      const gy = Math.floor((py - offset) / scale);
      const ch = ART[gy]?.[gx];
      const color = ch && ch !== '.' ? PALETTE[ch] : background(gx, gy);
      if (!color) throw new Error(`Unknown palette key "${ch}"`);
      hex(color).forEach((v, i) => (pixels[(py * size + px) * 4 + i] = v));
    }
  }
  return encodePng(size, size, pixels);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
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
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(Buffer.from([0]), rgba.subarray(y * width * 4, (y + 1) * width * 4));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Maskable icons keep the art inside the central 80 % safe circle, so their
 * art scale is smaller (half-diagonal of the art < 0.4 * size).
 */
const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 8 },
  { file: 'icon-512.png', size: 512, scale: 22 },
  { file: 'apple-touch-icon.png', size: 180, scale: 8 },
  { file: 'icon-maskable-192.png', size: 192, scale: 5 },
  { file: 'icon-maskable-512.png', size: 512, scale: 14 },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, scale } of ICONS) {
  writeFileSync(join(OUT_DIR, file), render(size, scale));
  console.log(`wrote public/icons/${file} (${size}x${size}, art x${scale})`);
}
