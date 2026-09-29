import { defineConfig } from 'vitest/config';

// The database measurements. `npm test` never runs them: it only picks up
// *.test.* files, and these are *.perf.ts.
//
//   npx vitest run --config scripts/perf/vitest.config.ts
//
// SUPABASE_TEST_* come from .env.test, which Vite loads in test mode.
export default defineConfig({
  envPrefix: ['VITE_', 'SUPABASE_TEST_'],
  test: {
    include: ['scripts/perf/**/*.perf.ts'],
    environment: 'node',
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
  },
});
