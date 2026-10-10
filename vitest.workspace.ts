import { configDefaults, defineWorkspace } from 'vitest/config';

/**
 * Two projects, so the live Supabase suites never run alongside each other.
 *
 * The live suites (they skip without .env.test) all work in the same two real
 * test families. Run in parallel they trip over each other: the join-code suite
 * rotates family-a's code while the account suite compares two reads of it, and
 * the contract suite empties both families before every case while the realtime
 * suite is writing into one. So they share one fork and run one file at a time.
 * Everything else stays parallel.
 */
const LIVE = [
  'src/data/supabase/supabaseStore.test.ts',
  'src/data/supabase/supabaseRealtime.test.ts',
  'src/data/supabase/supabaseAccount.test.ts',
  'src/data/supabase/joinCode.test.ts',
  'src/data/supabase/familyAi.test.ts',
];

export default defineWorkspace([
  {
    extends: './vite.config.ts',
    test: {
      name: 'unit',
      exclude: [...configDefaults.exclude, ...LIVE],
    },
  },
  {
    extends: './vite.config.ts',
    test: {
      name: 'live',
      include: LIVE,
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
    },
  },
]);
