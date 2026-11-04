// Authors the 30 Adventure levels (world-1.json … world-6.json) with the course generator.
// Each level is kept only if the solvability bot finds a fair, hit-free, ≥95%-star run.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPEEDS } from '../src/config';
import { generateCourse, worldMechanics } from '../src/game/CourseGenerator';
import { hashString } from '../src/engine/Rng';
import { validateWorld, type Course } from '../src/game/levels/schema';
import { solveWithRetries } from '../tests/levels/solveWithRetries';

const OUT = join(import.meta.dirname, '..', 'src', 'game', 'levels');

export function levelOptions(world: number, level: number, attempt: number) {
  const id = `${world}-${level}`;
  return {
    id,
    seed: hashString(`level-${id}-${attempt}`),
    world,
    speed: SPEEDS.adventure[world - 1] ?? 180,
    lengthSec: 46 + 4 * (level - 1) + 2 * (world - 1),
    mechanics: worldMechanics(world, level),
    difficulty: Math.min(0.75, 0.05 + 0.08 * (world - 1) + 0.07 * (level - 1)),
    gravityScale: world === 6 ? 0.45 : 1,
    startY: 520,
    pad: true,
  };
}

for (let w = 1; w <= 6; w++) {
  const levels: Course[] = [];
  for (let l = 1; l <= 5; l++) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const g = generateCourse(levelOptions(w, l, attempt));
      const r = solveWithRetries(g.course);
      if (r.ok) {
        levels.push(g.course);
        console.log(
          `level ${w}-${l}: attempt ${attempt}, ${g.course.hazards.length} hazards, ${r.stars}/${r.totalStars} stars`,
        );
        break;
      }
      console.log(`level ${w}-${l}: attempt ${attempt} rejected (${r.reason})`);
    }
  }
  const file = { world: w, levels };
  validateWorld(file, w);
  writeFileSync(join(OUT, `world-${w}.json`), JSON.stringify(file) + '\n');
}
console.log('gen:levels done');
