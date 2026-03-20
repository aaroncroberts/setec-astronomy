import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Use the standard Node environment for unit tests.
    // Integration tests that need Workers APIs use the cloudflare pool via
    // separate config (vitest.integration.config.ts).
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
