// QR puzzle-box unlocks: code validation, lookup, pending unlocks, applying to a profile.
import type { Profile, SaveData } from '../storage/schema';
import table from './unlocks.json';

export interface UnlockEntry {
  type: 'skin' | 'character';
  id: string;
  label: string;
}

/** No ambiguous characters (0/O, 1/l/I). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{8,12}$`);

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isWellFormedCode(code: string): boolean {
  return CODE_RE.test(code);
}

export type UnlockTable = Record<string, UnlockEntry>;

export const UNLOCKS: UnlockTable = table as UnlockTable;

export function lookupCode(raw: string, t: UnlockTable = UNLOCKS): UnlockEntry | null {
  const code = normalizeCode(raw);
  if (!isWellFormedCode(code)) return null;
  return t[code] ?? null;
}

export function ownsUnlock(p: Profile, e: UnlockEntry): boolean {
  return e.type === 'skin' ? p.ownedSkins.includes(e.id) : p.ownedCharacters.includes(e.id);
}

/** Give the item to the profile. Returns 'owned' if it was already theirs. */
export function applyUnlock(p: Profile, e: UnlockEntry): 'applied' | 'owned' {
  if (ownsUnlock(p, e)) return 'owned';
  if (e.type === 'skin') p.ownedSkins.push(e.id);
  else p.ownedCharacters.push(e.id);
  return 'applied';
}

export type QrOutcome = { kind: 'pending'; code: string } | { kind: 'invalid' } | { kind: 'none' };

/** Read `?unlock=` from a URL search string; valid codes become pending (they survive first run). */
export function readUnlockParam(
  search: string,
  save: SaveData,
  t: UnlockTable = UNLOCKS,
): QrOutcome {
  const raw = new URLSearchParams(search).get('unlock');
  if (raw === null) return { kind: 'none' };
  const entry = lookupCode(raw, t);
  if (!entry) return { kind: 'invalid' };
  const code = normalizeCode(raw);
  if (!save.pendingUnlocks.includes(code)) save.pendingUnlocks.push(code);
  return { kind: 'pending', code };
}

export interface AppliedUnlock {
  entry: UnlockEntry;
  result: 'applied' | 'owned';
}

/** Apply all pending unlocks to the active profile (needs a profile). Clears the queue. */
export function applyPending(
  save: SaveData,
  p: Profile,
  t: UnlockTable = UNLOCKS,
): AppliedUnlock[] {
  const out: AppliedUnlock[] = [];
  for (const code of save.pendingUnlocks) {
    const e = t[code];
    if (!e) continue;
    out.push({ entry: e, result: applyUnlock(p, e) });
  }
  save.pendingUnlocks = [];
  return out;
}

/** URL with the unlock param removed (for history.replaceState). */
export function stripUnlockParam(href: string): string {
  const u = new URL(href);
  u.searchParams.delete('unlock');
  return u.pathname + (u.search ? u.search : '') + u.hash;
}
