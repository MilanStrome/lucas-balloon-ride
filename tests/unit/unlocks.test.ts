import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  UNLOCKS,
  applyPending,
  applyUnlock,
  isWellFormedCode,
  lookupCode,
  normalizeCode,
  ownsUnlock,
  readUnlockParam,
  stripUnlockParam,
} from '../../src/game/Unlocks';
import { SKINS } from '../../src/game/skins';
import { defaultSave, newProfile } from '../../src/storage/schema';

describe('QR unlock codes', () => {
  it('every shipped code is well formed, unambiguous, and points at a real item', () => {
    for (const [code, e] of Object.entries(UNLOCKS)) {
      expect(isWellFormedCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OIL]/);
      if (e.type === 'skin') expect(SKINS.some((s) => s.id === e.id)).toBe(true);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('validates format and normalizes case/whitespace', () => {
    expect(isWellFormedCode('ABC')).toBe(false);
    expect(isWellFormedCode('ABCDEFGHJKMNP')).toBe(false);
    expect(isWellFormedCode('ABCDEFG0')).toBe(false);
    expect(normalizeCode('  pzbx7k3mqa ')).toBe('PZBX7K3MQA');
    expect(lookupCode(' pzbx7k3mqa')?.id).toBe('puzzle');
    expect(lookupCode('ZZZZZZZZ')).toBeNull();
    expect(lookupCode('<script>')).toBeNull();
  });

  it('a QR link before any profile exists becomes pending, then applies after profile creation', () => {
    const save = defaultSave();
    expect(readUnlockParam('?unlock=PZBX7K3MQA', save)).toEqual({
      kind: 'pending',
      code: 'PZBX7K3MQA',
    });
    readUnlockParam('?unlock=PZBX7K3MQA', save);
    expect(save.pendingUnlocks).toEqual(['PZBX7K3MQA']);
    expect(save.profiles).toHaveLength(0);
    const p = newProfile('p', 'bear', '', 0);
    save.profiles.push(p);
    const applied = applyPending(save, p);
    expect(applied).toEqual([{ entry: UNLOCKS['PZBX7K3MQA'], result: 'applied' }]);
    expect(p.ownedSkins).toContain('puzzle');
    expect(save.pendingUnlocks).toEqual([]);
  });

  it('invalid and already-owned codes', () => {
    const save = defaultSave();
    expect(readUnlockParam('?unlock=NOPE', save)).toEqual({ kind: 'invalid' });
    expect(readUnlockParam('?x=1', save)).toEqual({ kind: 'none' });
    const p = newProfile('p', 'bear', '', 0);
    const e = UNLOCKS['FRND6H2YVC']!;
    expect(ownsUnlock(p, e)).toBe(false);
    expect(applyUnlock(p, e)).toBe('applied');
    expect(applyUnlock(p, e)).toBe('owned');
    save.pendingUnlocks = ['FRND6H2YVC', 'UNKNOWNCODE'];
    expect(applyPending(save, p)).toEqual([{ entry: e, result: 'owned' }]);
  });

  it('strips the unlock param but keeps others', () => {
    expect(stripUnlockParam('https://x.dev/app/?unlock=ABC&debug=1#h')).toBe('/app/?debug=1#h');
    expect(stripUnlockParam('https://x.dev/?unlock=ABC')).toBe('/');
  });
});
