// Loads and validates the Adventure world files. An invalid level throws at load.
import w1 from './world-1.json';
import w2 from './world-2.json';
import w3 from './world-3.json';
import w4 from './world-4.json';
import w5 from './world-5.json';
import w6 from './world-6.json';
import { validateWorld, type Course, type WorldFile } from './schema';

let cache: WorldFile[] | null = null;

export function loadAllWorlds(): WorldFile[] {
  cache ??= [w1, w2, w3, w4, w5, w6].map((w, i) => validateWorld(w, i + 1));
  return cache;
}

export function getLevel(id: string): Course | null {
  for (const w of loadAllWorlds()) for (const l of w.levels) if (l.id === id) return l;
  return null;
}

export function levelIds(): string[] {
  return loadAllWorlds().flatMap((w) => w.levels.map((l) => l.id));
}

/** The level after `id` (next in world, or first of next world), or null at the end. */
export function nextLevelId(id: string): string | null {
  const ids = levelIds();
  const i = ids.indexOf(id);
  return i >= 0 && i + 1 < ids.length ? (ids[i + 1] ?? null) : null;
}
