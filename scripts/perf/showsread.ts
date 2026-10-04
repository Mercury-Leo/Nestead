// How long the Shows page's first read takes against the live project: the
// wait that warming the page from its link (src/app/warm.ts) can hide. Read
// only: it signs in as test user A, reads A's membership and A's shows through
// the app's own store, and writes nothing. Without a family it stops rather
// than create one (unlike signInTester()).
//
//   npx vite-node scripts/perf/showsread.ts -- --env <path to .env.test> [--runs 10] [--gap 300]
//
// Node reuses one connection, as a browser does while the app is open; it
// sends no CORS preflight, which a browser may add before its first read.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseStore } from '../../src/data/supabase/supabaseStore';
import { show, spread } from './stats';

const args = process.argv.slice(2);
const option = (name: string, fallback?: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const envFile = option('env');
if (envFile === undefined) throw new Error('usage: npx vite-node scripts/perf/showsread.ts -- --env <path to .env.test> [--runs 10] [--gap 300]');
const RUNS = Number(option('runs', '10'));
const GAP_MS = Number(option('gap', '300'));

/** KEY=value lines; the values are never printed. */
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
);
const need = (name: string): string => {
  const value = env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set in ${envFile}`);
  return value;
};

const client = createClient(need('SUPABASE_TEST_URL'), need('SUPABASE_TEST_ANON_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const time = async <T>(run: () => Promise<T>): Promise<[T, number]> => {
  const start = performance.now();
  const value = await run();
  return [value, performance.now() - start];
};

const [signedIn, signInMs] = await time(() => client.auth.signInWithPassword({ email: need('SUPABASE_TEST_A_EMAIL'), password: need('SUPABASE_TEST_A_PASSWORD') }));
if (signedIn.error !== null) throw new Error(`sign in: ${signedIn.error.message}`);
const userId = signedIn.data.user.id;

const [membership, memberMs] = await time(async () => client.from('members').select('family_id').eq('id', userId).maybeSingle());
if (membership.error !== null) throw new Error(`membership: ${membership.error.message}`);
const familyId = (membership.data?.family_id ?? null) as string | null;
if (familyId === null) throw new Error('test user A has no family; this script creates nothing, so it stops here');

const store = createSupabaseStore(familyId, client);
const [firstRows, firstMs] = await time(() => store.shows.list());
const reads: number[] = [];
let rows = firstRows;
for (let run = 0; run < RUNS; run += 1) {
  await new Promise((done) => setTimeout(done, GAP_MS));
  const [read, ms] = await time(() => store.shows.list());
  rows = read;
  reads.push(ms);
}

console.log(`sign in: ${signInMs.toFixed(0)} ms; membership read: ${memberMs.toFixed(0)} ms`);
console.log(`shows rows: ${rows.length} (${JSON.stringify(rows).length} bytes as JSON)`);
console.log(`first shows read after sign-in: ${firstMs.toFixed(0)} ms`);
console.log(`shows read, ${RUNS} more, ${GAP_MS} ms apart: ${show(spread(reads))}`);
