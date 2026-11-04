// Versioned save storage with migrations, corruption recovery and an in-memory fallback.
import { STORAGE } from '../config';
import { migrate } from './migrations';
import {
  SCHEMA_VERSION,
  defaultDaily,
  defaultSave,
  defaultSettings,
  type CalibrationRecord,
  type DailyState,
  type DeviceCalibration,
  type Profile,
  type SaveData,
  type Settings,
} from './schema';

/** Minimal synchronous key-value backend (localStorage, memory, or a Capacitor cache). */
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryBackend implements StorageBackend {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Capacitor Preferences-like async API. */
export interface AsyncPrefs {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
}

/** Wraps an async preferences store in a sync backend: preloads keys, writes through. */
export async function createPrefsBackend(
  prefs: AsyncPrefs,
  keys: string[],
): Promise<StorageBackend> {
  const mem = new MemoryBackend();
  for (const key of keys) {
    const { value } = await prefs.get({ key });
    if (value !== null) mem.setItem(key, value);
  }
  return {
    getItem: (k) => mem.getItem(k),
    setItem: (k, v) => {
      mem.setItem(k, v);
      void prefs.set({ key: k, value: v }).catch(() => undefined);
    },
    removeItem: (k) => {
      mem.removeItem(k);
      void prefs.remove({ key: k }).catch(() => undefined);
    },
  };
}

/** localStorage if usable, else null (private mode / disabled). */
export function browserBackend(ls: Storage | undefined): StorageBackend | null {
  try {
    if (!ls) return null;
    const probe = '__lbr_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
function oneOf<T extends string>(v: unknown, opts: readonly T[], d: T): T {
  return typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d;
}

function sanitizeSettings(v: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(v)) return d;
  return {
    sensitivity: num(v['sensitivity'], d.sensitivity, 0.5, 2),
    controlStyle: oneOf(v['controlStyle'], ['hold', 'hop'] as const, d.controlStyle),
    deviceId: typeof v['deviceId'] === 'string' ? v['deviceId'] : null,
    musicVolume: num(v['musicVolume'], d.musicVolume, 0, 1),
    sfxVolume: num(v['sfxVolume'], d.sfxVolume, 0, 1),
    vibration: bool(v['vibration'], d.vibration),
    quality: oneOf(v['quality'], ['auto', 'high', 'low'] as const, d.quality),
    language: str(v['language'], d.language),
    easyMode: bool(v['easyMode'], d.easyMode),
    humMode: bool(v['humMode'], d.humMode),
    tapMode: bool(v['tapMode'], d.tapMode),
    restBreaks: bool(v['restBreaks'], d.restBreaks),
    colorblind: bool(v['colorblind'], d.colorblind),
    reduceMotion: oneOf(v['reduceMotion'], ['auto', 'on', 'off'] as const, d.reduceMotion),
    calmMusic: bool(v['calmMusic'], d.calmMusic),
  };
}

function sanitizeCal(v: unknown): CalibrationRecord | null {
  if (!isObj(v)) return null;
  const f = v['noiseFloorDb'];
  const m = v['maxBlowDb'];
  if (typeof f !== 'number' || typeof m !== 'number' || !Number.isFinite(f) || !Number.isFinite(m))
    return null;
  return { noiseFloorDb: f, maxBlowDb: m, at: num(v['at'], 0) };
}

function sanitizeRecord<T>(v: unknown, f: (x: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    const s = f(x);
    if (s !== null) out[k] = s;
  }
  return out;
}

function sanitizeProfile(v: unknown): Profile | null {
  if (!isObj(v) || typeof v['id'] !== 'string') return null;
  const minis = isObj(v['minis']) ? v['minis'] : {};
  const skin = str(v['skin'], 'sunny');
  const character = str(v['character'], 'lucas');
  const ownedSkins = strArr(v['ownedSkins']);
  const ownedCharacters = strArr(v['ownedCharacters']);
  if (!ownedSkins.includes(skin)) ownedSkins.push(skin);
  if (!ownedCharacters.includes(character)) ownedCharacters.push(character);
  return {
    id: v['id'],
    name: str(v['name'], '').slice(0, 24),
    avatar: str(v['avatar'], 'bear'),
    skin,
    character,
    coins: Math.floor(num(v['coins'], 0, 0, 1e9)),
    stars: sanitizeRecord(v['stars'], (x) =>
      typeof x === 'number' ? Math.max(0, Math.min(3, Math.floor(x))) : null,
    ),
    completed: sanitizeRecord(v['completed'], (x) => (x === true ? true : null)),
    ownedSkins,
    ownedCharacters,
    bestEndless: num(v['bestEndless'], 0, 0),
    minis: {
      candles: num(minis['candles'], 0, 0),
      sailboat: num(minis['sailboat'], 0, 0),
      bubbles: num(minis['bubbles'], 0, 0),
    },
    createdAt: num(v['createdAt'], 0),
  };
}

function sanitizeDaily(v: unknown): DailyState | null {
  if (!isObj(v)) return null;
  return {
    ...defaultDaily(),
    streak: Math.floor(num(v['streak'], 0, 0)),
    lastCompleted: typeof v['lastCompleted'] === 'string' ? v['lastCompleted'] : null,
    rewarded: strArr(v['rewarded']).slice(-14),
  };
}

function sanitizeDevice(v: unknown): DeviceCalibration | null {
  if (!isObj(v)) return null;
  return {
    shared: sanitizeCal(v['shared']),
    byProfile: sanitizeRecord(v['byProfile'], sanitizeCal),
  };
}

/** Validates/repairs a migrated object into SaveData. Never throws for object input. */
export function sanitize(v: Record<string, unknown>): SaveData {
  const profiles = (Array.isArray(v['profiles']) ? v['profiles'] : [])
    .map(sanitizeProfile)
    .filter((p): p is Profile => p !== null)
    .slice(0, STORAGE.maxProfiles);
  const active = typeof v['activeProfileId'] === 'string' ? v['activeProfileId'] : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    profiles,
    activeProfileId: profiles.some((p) => p.id === active) ? active : null,
    settings: sanitizeSettings(v['settings']),
    calibrationByDevice: sanitizeRecord(v['calibrationByDevice'], sanitizeDevice),
    pendingUnlocks: strArr(v['pendingUnlocks']).slice(0, 20),
    daily: sanitizeRecord(v['daily'], sanitizeDaily),
  };
}

/** Parse + migrate + sanitize a raw string. Throws if the string is not a usable save. */
export function parseSave(raw: string): SaveData {
  const parsed: unknown = JSON.parse(raw);
  if (!isObj(parsed)) throw new Error('save is not an object');
  return sanitize(migrate(parsed));
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class SaveStore {
  data: SaveData;
  /** True when writes fail and the game runs fully in memory. */
  memoryOnly = false;
  /** Set once when we fall back to memory, so the UI can show a one-time notice. */
  noticePending = false;
  recoveredFromCorruption = false;
  private backend: StorageBackend;
  private timer: unknown = null;
  private lastWrite = -Infinity;
  private dirty = false;

  constructor(
    backend: StorageBackend | null,
    private readonly now: () => number = () => Date.now(),
    private readonly timers: Timers = realTimers,
  ) {
    if (!backend) {
      this.backend = new MemoryBackend();
      this.memoryOnly = true;
      this.noticePending = true;
    } else {
      this.backend = backend;
    }
    this.data = this.load();
  }

  /** Read and repair the save; on corruption back up the raw string and start fresh. */
  load(): SaveData {
    let raw: string | null;
    try {
      raw = this.backend.getItem(STORAGE.key);
    } catch {
      this.switchToMemory();
      return defaultSave();
    }
    if (raw === null) return defaultSave();
    try {
      return parseSave(raw);
    } catch {
      this.recoveredFromCorruption = true;
      try {
        this.backend.setItem(`${STORAGE.key}.corrupt.${this.now()}`, raw);
      } catch {
        // Backing up is best effort.
      }
      return defaultSave();
    }
  }

  /** Reload from storage (another tab wrote). */
  reload(): void {
    this.data = this.load();
    this.dirty = false;
  }

  /** Mutate the save, then schedule a debounced write (at most 1 per second). */
  update(mutator: (d: SaveData) => void): void {
    mutator(this.data);
    this.dirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== null) return;
    const wait = Math.max(0, STORAGE.debounceMs - (this.now() - this.lastWrite));
    this.timer = this.timers.set(() => {
      this.timer = null;
      this.flush();
    }, wait);
  }

  /** Write immediately (pause, visibility hidden). */
  flush(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.lastWrite = this.now();
    try {
      this.backend.setItem(STORAGE.key, JSON.stringify(this.data));
    } catch {
      this.switchToMemory();
    }
  }

  private switchToMemory(): void {
    if (this.memoryOnly) return;
    const mem = new MemoryBackend();
    this.backend = mem;
    this.memoryOnly = true;
    this.noticePending = true;
  }

  get pendingWrite(): boolean {
    return this.dirty;
  }

  // ---- convenience accessors ----

  get activeProfile(): Profile | null {
    return this.data.profiles.find((p) => p.id === this.data.activeProfileId) ?? null;
  }

  dailyFor(profileId: string): DailyState {
    let d = this.data.daily[profileId];
    if (!d) {
      d = defaultDaily();
      this.data.daily[profileId] = d;
    }
    return d;
  }

  getCalibration(deviceId: string, profileId: string | null): CalibrationRecord | null {
    const dev = this.data.calibrationByDevice[deviceId];
    if (!dev) return null;
    return (profileId ? dev.byProfile[profileId] : undefined) ?? dev.shared;
  }

  setCalibration(
    deviceId: string,
    profileId: string | null,
    cal: Omit<CalibrationRecord, 'at'>,
  ): void {
    this.update((d) => {
      const rec: CalibrationRecord = { ...cal, at: this.now() };
      const dev = d.calibrationByDevice[deviceId] ?? { shared: null, byProfile: {} };
      dev.shared = rec;
      if (profileId) dev.byProfile[profileId] = rec;
      d.calibrationByDevice[deviceId] = dev;
    });
  }
}
