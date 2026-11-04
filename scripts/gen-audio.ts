// Generates deterministic WAV fixtures for the fake-microphone e2e tests.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as S from '../tests/helpers/signals';

const SR = 48000;
const OUT = join(import.meta.dirname, '..', 'tests', 'fixtures', 'audio');

function wav(x: Float32Array, sr: number): Buffer {
  const data = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) {
    const v = Math.max(-1, Math.min(1, x[i] ?? 0));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// Low room noise under everything, as a real mic always has some.
const bed = (sec: number) => S.roomNoise(SR, sec, -62, 99);

const fixtures: Record<string, Float32Array> = {
  silence: S.silence(SR, 6, -90),
  'room-noise': S.roomNoise(SR, 6, -55),
  'soft-blow': S.mix(bed(6), S.blow(SR, 6, -32)),
  'hard-blow': S.mix(bed(6), S.blow(SR, 6, -15)),
  'intermittent-blows': S.concat(
    S.mix(bed(2), S.blow(SR, 2, -18)),
    bed(1.5),
    S.mix(bed(2), S.blow(SR, 2, -18, 13)),
    bed(1.5),
  ),
  // 2 s of room noise then a long hard blow: matches the quiet -> blow calibration phases.
  calibration: S.concat(bed(2.0), S.mix(bed(5), S.blow(SR, 5, -16, 21))),
  'speech-like': S.mix(bed(8), S.speech(SR, 8, -22)),
  'singing-tone': S.mix(bed(6), S.singing(SR, 6, -20)),
  claps: S.mix(bed(6), S.claps(SR, 6, -16)),
  'music-loop': S.mix(bed(8), S.music(SR, 8, -22)),
  'music-blow': S.mix(S.music(SR, 6, -36), S.blow(SR, 6, -17)),
};

mkdirSync(OUT, { recursive: true });
for (const [name, x] of Object.entries(fixtures)) {
  writeFileSync(join(OUT, `${name}.wav`), wav(x, SR));
}
console.log(`gen:audio wrote ${Object.keys(fixtures).length} fixtures to ${OUT}`);
