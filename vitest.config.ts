import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: [
        'src/audio/BreathDetector.ts',
        'src/audio/features.ts',
        'src/audio/HumDetector.ts',
        'src/audio/Calibration.ts',
        'src/engine/Physics.ts',
        'src/engine/Collision.ts',
        'src/engine/Camera.ts',
        'src/engine/Rng.ts',
        'src/engine/Pool.ts',
        'src/engine/Loop.ts',
        'src/storage/**',
        'src/game/Progress.ts',
        'src/game/Unlocks.ts',
      ],
      thresholds: { lines: 90 },
      reporter: ['text-summary'],
    },
  },
});
