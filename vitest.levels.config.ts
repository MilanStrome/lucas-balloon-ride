import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/levels/**/*.test.ts'],
    environment: 'node',
    testTimeout: 600_000,
    pool: 'threads',
  },
});
