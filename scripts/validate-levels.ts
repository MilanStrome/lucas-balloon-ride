// Build gate: every Adventure level must pass schema validation, or the build fails.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateWorld } from '../src/game/levels/schema';

const dir = join(import.meta.dirname, '..', 'src', 'game', 'levels');
let count = 0;
try {
  for (let w = 1; w <= 6; w++) {
    const data: unknown = JSON.parse(readFileSync(join(dir, `world-${w}.json`), 'utf8'));
    count += validateWorld(data, w).levels.length;
  }
} catch (e) {
  console.error(`Level validation failed: ${(e as Error).message}`);
  process.exit(1);
}
console.log(`validate-levels: ${count} levels OK`);
