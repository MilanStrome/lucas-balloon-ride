// Print-ready QR codes (PNG + SVG) for every entry in src/game/unlocks.json.
// Usage: npm run gen:qr -- [--host https://example.github.io/lucas-balloon-ride/]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { isWellFormedCode, type UnlockTable } from '../src/game/Unlocks';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const hostIdx = args.indexOf('--host');
const host =
  (hostIdx >= 0 ? args[hostIdx + 1] : process.env['LBR_HOST']) ??
  'https://rvappstudios.github.io/lucas-balloon-ride/';
const base = host.endsWith('/') ? host : `${host}/`;
const table = JSON.parse(
  readFileSync(join(root, 'src', 'game', 'unlocks.json'), 'utf8'),
) as UnlockTable;
const out = join(root, 'qr-codes');
mkdirSync(out, { recursive: true });

let n = 0;
for (const [code, entry] of Object.entries(table)) {
  if (!isWellFormedCode(code))
    throw new Error(`Bad code ${code}: use 8–12 of the unambiguous characters`);
  const url = `${base}?unlock=${code}`;
  const opts = { errorCorrectionLevel: 'H' as const, margin: 4 };
  await QRCode.toFile(join(out, `${code}-${entry.id}.png`), url, { ...opts, width: 1200 });
  writeFileSync(
    join(out, `${code}-${entry.id}.svg`),
    await QRCode.toString(url, { ...opts, type: 'svg' }),
  );
  console.log(`${code}  ${entry.type}:${entry.id}  ${url}`);
  n++;
}
console.log(`gen:qr wrote ${n * 2} files to ${out}`);
