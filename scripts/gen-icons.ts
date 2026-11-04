// Rasterizes the app icon (balloon on sky) to PNG with a tiny built-in encoder. No dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const OUT = join(import.meta.dirname, '..', 'public', 'icons');

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size: number, px: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** Icon in unit coords; `pad` shrinks the art for the maskable safe zone. */
function icon(size: number, pad: number) {
  return (px: number, py: number): [number, number, number] => {
    // 2×2 supersampling
    let r = 0;
    let g = 0;
    let b = 0;
    for (const [ox, oy] of [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ] as const) {
      const u = ((px + ox) / size - 0.5) / (1 - 2 * pad) + 0.5;
      const v = ((py + oy) / size - 0.5) / (1 - 2 * pad) + 0.5;
      let c = hex('#6cc7ff');
      if (v > 0.5) c = hex('#a9e4ff');
      const ex = (u - 0.5) / 0.3;
      const ey = (v - 0.4) / 0.32;
      if (ex * ex + ey * ey <= 1) {
        const stripe = Math.floor((u - 0.2) / 0.12);
        c = hex(stripe % 2 === 0 ? '#ff6b6b' : '#ffd23f');
      }
      if (u > 0.41 && u < 0.59 && v > 0.78 && v < 0.9) c = hex('#b5773a');
      if (
        (Math.abs(u - 0.44 - (v - 0.7) * 0.2) < 0.008 ||
          Math.abs(u - 0.56 + (v - 0.7) * 0.2) < 0.008) &&
        v > 0.68 &&
        v < 0.79
      )
        c = hex('#6b4a2b');
      r += c[0];
      g += c[1];
      b += c[2];
    }
    return [r / 4, g / 4, b / 4];
  };
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon-192.png'), png(192, icon(192, 0.02)));
writeFileSync(join(OUT, 'icon-512.png'), png(512, icon(512, 0.02)));
writeFileSync(join(OUT, 'maskable-512.png'), png(512, icon(512, 0.12)));
writeFileSync(join(OUT, 'apple-touch-icon.png'), png(180, icon(180, 0.06)));
console.log('icons written to', OUT);
