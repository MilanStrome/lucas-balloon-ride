// PURE: seeded PRNG (mulberry32) and date seeds.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Local calendar date as YYYY-MM-DD from explicit parts (no clock access). */
export function dateKey(year: number, month1: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month1.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

/** Local date key of a Date object. The caller supplies the Date (time is passed in). */
export function dateKeyOf(d: Date): string {
  return dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function dateSeed(key: string): number {
  return hashString(`lbr-daily-${key}`);
}

/** Day difference between two YYYY-MM-DD keys (b - a), DST-safe via UTC. */
export function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const ta = Date.UTC(pa[0] ?? 0, (pa[1] ?? 1) - 1, pa[2] ?? 1);
  const tb = Date.UTC(pb[0] ?? 0, (pb[1] ?? 1) - 1, pb[2] ?? 1);
  return Math.round((tb - ta) / 86_400_000);
}

export function randRange(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

export function randInt(rng: Rng, lo: number, hiInclusive: number): number {
  return lo + Math.floor(rng() * (hiInclusive - lo + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const v = items[Math.floor(rng() * items.length)];
  if (v === undefined) throw new Error('pick from empty list');
  return v;
}
