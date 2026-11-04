import { describe, expect, it, vi } from 'vitest';
import { STORAGE } from '../../src/config';
import { migrate, migrate1to2, migrate2to3 } from '../../src/storage/migrations';
import { SCHEMA_VERSION, defaultSave, newProfile } from '../../src/storage/schema';
import {
  MemoryBackend,
  SaveStore,
  browserBackend,
  createPrefsBackend,
  parseSave,
  sanitize,
  type StorageBackend,
  type Timers,
} from '../../src/storage/Storage';

function fakeTimers() {
  const pending: { fn: () => void; at: number }[] = [];
  let now = 0;
  const timers: Timers = {
    set: (fn, ms) => {
      const h = { fn, at: now + ms };
      pending.push(h);
      return h;
    },
    clear: (h) => {
      const i = pending.indexOf(h as (typeof pending)[number]);
      if (i >= 0) pending.splice(i, 1);
    },
  };
  return {
    timers,
    now: () => now,
    advance(ms: number) {
      now += ms;
      for (const p of [...pending].sort((a, b) => a.at - b.at)) {
        if (p.at <= now) {
          pending.splice(pending.indexOf(p), 1);
          p.fn();
        }
      }
    },
  };
}

const V1 = {
  schemaVersion: 1,
  profiles: [{ id: 'a', avatar: 'cat', stars: { '1-1': 3 }, coins: 12 }],
  settings: { sensitivity: 1.4 },
  calibration: { noiseFloorDb: -50, maxBlowDb: -15 },
};

describe('migrations', () => {
  it('1 → 2 moves calibration under a device id and adds pending unlocks', () => {
    const v2 = migrate1to2(V1);
    expect(v2['schemaVersion']).toBe(2);
    expect(v2['calibration']).toBeUndefined();
    expect((v2['calibrationByDevice'] as Record<string, unknown>)['default']).toMatchObject({
      noiseFloorDb: -50,
    });
    expect(v2['pendingUnlocks']).toEqual([]);
    expect(migrate1to2({ schemaVersion: 1, profiles: [] })['calibrationByDevice']).toEqual({});
  });

  it('2 → 3 adds profile fields, daily, and per-profile calibration', () => {
    const v3 = migrate2to3(migrate1to2(V1));
    expect(v3['schemaVersion']).toBe(3);
    const p = (v3['profiles'] as Record<string, unknown>[])[0]!;
    expect(p['ownedSkins']).toEqual(['sunny']);
    expect(p['coins']).toBe(12);
    expect(
      (v3['calibrationByDevice'] as Record<string, { shared: unknown }>)['default']?.shared,
    ).toBeTruthy();
    expect(v3['daily']).toEqual({});
    expect(
      migrate2to3({ schemaVersion: 2, calibrationByDevice: { x: 5 }, profiles: [1, null] })[
        'profiles'
      ],
    ).toEqual([]);
  });

  it('full chain, current version passthrough, and rejects unknown/newer versions', () => {
    const cur = migrate(V1);
    expect(cur['schemaVersion']).toBe(SCHEMA_VERSION);
    expect(
      migrate({ ...defaultSave() } as unknown as Record<string, unknown>)['schemaVersion'],
    ).toBe(SCHEMA_VERSION);
    expect(() => migrate({ schemaVersion: 99 })).toThrow();
    expect(() => migrate({ schemaVersion: 0 })).toThrow();
    expect(migrate({ profiles: [] })['schemaVersion']).toBe(SCHEMA_VERSION);
  });

  it('parseSave of a v1 save yields a valid current save', () => {
    const s = parseSave(JSON.stringify(V1));
    expect(s.profiles[0]?.stars['1-1']).toBe(3);
    expect(s.settings.sensitivity).toBe(1.4);
    expect(s.calibrationByDevice['default']?.shared?.maxBlowDb).toBe(-15);
  });
});

describe('sanitize', () => {
  it('repairs bad values and clamps ranges', () => {
    const s = sanitize({
      profiles: [
        {
          id: 'x',
          coins: -5,
          stars: { a: 9, b: 'x' },
          skin: 'ocean',
          ownedSkins: [],
          completed: { a: true, b: 1 },
          minis: 'bad',
        },
        { nope: 1 },
        'str',
      ],
      activeProfileId: 'missing',
      settings: {
        sensitivity: 9,
        musicVolume: 'loud',
        quality: 'ultra',
        controlStyle: 'hop',
        reduceMotion: 'on',
        deviceId: 'mic1',
      },
      calibrationByDevice: {
        d: {
          shared: { noiseFloorDb: 'x' },
          byProfile: { x: { noiseFloorDb: -40, maxBlowDb: -10 } },
        },
        e: 4,
      },
      pendingUnlocks: ['A', 3],
      daily: {
        x: { streak: 2.7, lastCompleted: '2026-01-01', rewarded: ['2026-01-01', 5] },
        y: null,
      },
    });
    const p = s.profiles[0]!;
    expect(s.profiles).toHaveLength(1);
    expect(p.coins).toBe(0);
    expect(p.stars).toEqual({ a: 3 });
    expect(p.completed).toEqual({ a: true });
    expect(p.ownedSkins).toContain('ocean');
    expect(p.minis).toEqual({ candles: 0, sailboat: 0, bubbles: 0 });
    expect(s.activeProfileId).toBeNull();
    expect(s.settings.sensitivity).toBe(2);
    expect(s.settings.musicVolume).toBe(0.4);
    expect(s.settings.quality).toBe('auto');
    expect(s.settings.controlStyle).toBe('hop');
    expect(s.settings.deviceId).toBe('mic1');
    expect(s.calibrationByDevice['d']?.shared).toBeNull();
    expect(s.calibrationByDevice['d']?.byProfile['x']?.maxBlowDb).toBe(-10);
    expect(s.calibrationByDevice['e']).toBeUndefined();
    expect(s.pendingUnlocks).toEqual(['A']);
    expect(s.daily['x']?.streak).toBe(2);
    expect(s.daily['y']).toBeUndefined();
  });

  it('keeps at most 4 profiles', () => {
    const profiles = Array.from({ length: 6 }, (_, i) => newProfile(`p${i}`, 'bear', '', 0));
    expect(sanitize({ profiles }).profiles).toHaveLength(STORAGE.maxProfiles);
  });
});

describe('SaveStore', () => {
  it('starts fresh, debounces writes to ≤1/s, and flushes immediately', () => {
    const be = new MemoryBackend();
    const ft = fakeTimers();
    const st = new SaveStore(be, ft.now, ft.timers);
    expect(st.data.profiles).toEqual([]);
    st.update((d) => d.profiles.push(newProfile('a', 'cat', '', 0)));
    st.update((d) => (d.activeProfileId = 'a'));
    expect(be.getItem(STORAGE.key)).toBeNull();
    expect(st.pendingWrite).toBe(true);
    ft.advance(1000);
    expect(JSON.parse(be.getItem(STORAGE.key)!).activeProfileId).toBe('a');
    st.update((d) => (d.settings.easyMode = true));
    ft.advance(500);
    expect(JSON.parse(be.getItem(STORAGE.key)!).settings.easyMode).toBe(false);
    st.flush();
    expect(JSON.parse(be.getItem(STORAGE.key)!).settings.easyMode).toBe(true);
    st.flush();
    expect(st.activeProfile?.id).toBe('a');
  });

  it('recovers from a corrupt save by backing it up and starting fresh', () => {
    const be = new MemoryBackend();
    be.setItem(STORAGE.key, '{not json');
    const st = new SaveStore(be, () => 1234);
    expect(st.data.profiles).toEqual([]);
    expect(st.recoveredFromCorruption).toBe(true);
    expect(be.getItem(`${STORAGE.key}.corrupt.1234`)).toBe('{not json');
    be.setItem(STORAGE.key, '[1,2]');
    expect(new SaveStore(be, () => 5).recoveredFromCorruption).toBe(true);
    be.setItem(STORAGE.key, JSON.stringify({ schemaVersion: 42 }));
    expect(new SaveStore(be, () => 6).data.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('survives a backup that cannot be written', () => {
    const be: StorageBackend = {
      getItem: () => '{broken',
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    const st = new SaveStore(be, () => 1);
    expect(st.recoveredFromCorruption).toBe(true);
  });

  it('falls back to memory on quota failure with a one-time notice', () => {
    const map = new Map<string, string>();
    const be: StorageBackend = {
      getItem: (k) => map.get(k) ?? null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    const st = new SaveStore(be, () => 0, { set: () => 1, clear: () => undefined });
    st.update((d) => (d.settings.colorblind = true));
    st.flush();
    expect(st.memoryOnly).toBe(true);
    expect(st.noticePending).toBe(true);
    st.update((d) => (d.settings.easyMode = true));
    st.flush();
    expect(st.data.settings.easyMode).toBe(true);
  });

  it('runs fully in memory when storage is unavailable (private mode)', () => {
    const st = new SaveStore(null);
    expect(st.memoryOnly).toBe(true);
    st.update((d) => d.profiles.push(newProfile('m', 'fox', '', 0)));
    st.flush();
    expect(st.data.profiles).toHaveLength(1);
    const throwing: StorageBackend = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const st2 = new SaveStore(throwing);
    expect(st2.memoryOnly).toBe(true);
    expect(st2.data.profiles).toEqual([]);
  });

  it('reload picks up another tab’s write (last writer wins)', () => {
    const be = new MemoryBackend();
    const a = new SaveStore(be);
    const b = new SaveStore(be);
    a.update((d) => d.profiles.push(newProfile('a', 'cat', '', 0)));
    a.flush();
    b.reload();
    expect(b.data.profiles[0]?.id).toBe('a');
    b.update((d) => (d.profiles[0]!.coins = 50));
    b.flush();
    a.reload();
    expect(a.data.profiles[0]?.coins).toBe(50);
  });

  it('calibration per device and per profile', () => {
    const st = new SaveStore(new MemoryBackend(), () => 99);
    expect(st.getCalibration('mic', null)).toBeNull();
    st.setCalibration('mic', null, { noiseFloorDb: -50, maxBlowDb: -20 });
    st.setCalibration('mic', 'kid', { noiseFloorDb: -45, maxBlowDb: -10 });
    expect(st.getCalibration('mic', 'kid')?.noiseFloorDb).toBe(-45);
    expect(st.getCalibration('mic', 'other')?.noiseFloorDb).toBe(-45);
    expect(st.getCalibration('mic', 'kid')?.at).toBe(99);
    expect(st.getCalibration('other-mic', 'kid')).toBeNull();
    expect(st.dailyFor('kid').streak).toBe(0);
    expect(st.dailyFor('kid')).toBe(st.dailyFor('kid'));
  });
});

describe('backends', () => {
  it('browserBackend probes and rejects unusable storage', () => {
    expect(browserBackend(undefined)).toBeNull();
    const broken = {
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    expect(browserBackend(broken)).toBeNull();
    const ok = new MemoryBackend() as unknown as Storage;
    expect(browserBackend(ok)).toBe(ok);
  });

  it('Capacitor Preferences adapter preloads and writes through', async () => {
    const store = new Map<string, string>([[STORAGE.key, '{"schemaVersion":3}']]);
    const prefs = {
      get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
      set: vi.fn(
        async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
      ),
      remove: vi.fn(async ({ key }: { key: string }) => void store.delete(key)),
    };
    const be = await createPrefsBackend(prefs, [STORAGE.key, 'missing']);
    expect(be.getItem(STORAGE.key)).toBe('{"schemaVersion":3}');
    expect(be.getItem('missing')).toBeNull();
    be.setItem('k', 'v');
    be.removeItem(STORAGE.key);
    await Promise.resolve();
    expect(prefs.set).toHaveBeenCalledWith({ key: 'k', value: 'v' });
    expect(prefs.remove).toHaveBeenCalled();
    expect(be.getItem(STORAGE.key)).toBeNull();
    const failing = {
      ...prefs,
      set: vi.fn(async () => Promise.reject(new Error('io'))),
      remove: vi.fn(async () => Promise.reject(new Error('io'))),
    };
    const be2 = await createPrefsBackend(failing, []);
    be2.setItem('a', 'b');
    be2.removeItem('a');
    await Promise.resolve();
    expect(be2.getItem('a')).toBeNull();
  });
});
