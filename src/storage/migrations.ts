// One migration per schema version. Each takes the previous shape and returns the next.
import { SCHEMA_VERSION, defaultSettings } from './schema';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * v1 (prototype): { schemaVersion: 1, profiles: [{ id, avatar, stars, coins }], settings }
 * v2: adds calibrationByDevice (keyed by device id) and pendingUnlocks.
 */
export function migrate1to2(d: Obj): Obj {
  const oldCal = isObj(d['calibration']) ? d['calibration'] : null;
  const calibrationByDevice: Obj = {};
  if (
    oldCal &&
    typeof oldCal['noiseFloorDb'] === 'number' &&
    typeof oldCal['maxBlowDb'] === 'number'
  ) {
    calibrationByDevice['default'] = {
      noiseFloorDb: oldCal['noiseFloorDb'],
      maxBlowDb: oldCal['maxBlowDb'],
      at: 0,
    };
  }
  const rest = { ...d };
  delete rest['calibration'];
  return { ...rest, schemaVersion: 2, calibrationByDevice, pendingUnlocks: [] };
}

/**
 * v3: per-device calibration becomes { shared, byProfile }, profiles gain skins/characters/
 * minis, and the daily-challenge state is added (per profile).
 */
export function migrate2to3(d: Obj): Obj {
  const cal = isObj(d['calibrationByDevice']) ? d['calibrationByDevice'] : {};
  const next: Obj = {};
  for (const [dev, v] of Object.entries(cal)) {
    if (isObj(v) && typeof v['noiseFloorDb'] === 'number') next[dev] = { shared: v, byProfile: {} };
  }
  const profiles = Array.isArray(d['profiles']) ? d['profiles'] : [];
  return {
    ...d,
    schemaVersion: 3,
    calibrationByDevice: next,
    profiles: profiles.filter(isObj).map((p) => ({
      skin: 'sunny',
      character: 'lucas',
      ownedSkins: ['sunny'],
      ownedCharacters: ['lucas'],
      completed: {},
      bestEndless: 0,
      minis: { candles: 0, sailboat: 0, bubbles: 0 },
      name: '',
      createdAt: 0,
      ...p,
    })),
    activeProfileId: null,
    daily: {},
    settings: { ...defaultSettings(), ...(isObj(d['settings']) ? d['settings'] : {}) },
  };
}

export const MIGRATIONS: Record<number, (d: Obj) => Obj> = {
  1: migrate1to2,
  2: migrate2to3,
};

/** Run migrations until the data reaches the current schema. Throws on unknown versions. */
export function migrate(d: Obj): Obj {
  let cur = d;
  let v = typeof cur['schemaVersion'] === 'number' ? cur['schemaVersion'] : 1;
  if (v > SCHEMA_VERSION) throw new Error(`save from a newer version (${v})`);
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`no migration from ${v}`);
    cur = m(cur);
    v = cur['schemaVersion'] as number;
  }
  return cur;
}
