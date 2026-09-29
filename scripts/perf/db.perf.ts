// Database timings against the live project, as test user A in test family A.
//
//   npx vitest run --config scripts/perf/vitest.config.ts
//
// Env: PERF_RUNS (default 5, after one warm-up), PERF_SIZES (typical,heavy),
// PERF_ONLY (comma list of measurements), PERF_OUT (result JSON),
// PERF_EXTRA_LATENCY_MS (added before every request).
//
// Seeds its own rows, measures through the app's real code (the cached store,
// the kitchen actions, the session's startup steps), and deletes everything it
// created, rows and photos, even when a measurement fails.

import { hits, nameClient, setExtraLatency, settle, until } from './net';
import { connect } from 'node:tls';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterAll, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cacheOf, withCache } from '../../src/data/cache';
import { createSupabaseStore } from '../../src/data/supabase/supabaseStore';
import { signInTester } from '../../src/data/supabase/supabaseTestSession';
import type { Collection, DataStore } from '../../src/data/types';
import type { Base, BoardColumn, ListItem, NewRow, Recipe } from '../../src/domain/types';
import { openFamily } from '../../src/auth/openFamily';
import { placeTask } from '../../src/features/board/actions';
import { addRecipeToList, moveToPantry, removeRecipeFromList } from '../../src/features/larder/actions';
import { keyForText, pantryIndex } from '../../src/domain/kitchen/fit';
import { planAddRecipe } from '../../src/domain/kitchen/list';
import { COLUMNS, GROUPS, SIZES, TINY_JPEG, TWELVE, listRows, pantryRows, recipeRows, taskRows } from './fixtures';
import { show, summarise } from './stats';
import type { Spread } from './stats';

const env = import.meta.env;
const config = {
  url: env.SUPABASE_TEST_URL ?? '',
  key: env.SUPABASE_TEST_ANON_KEY ?? '',
  email: env.SUPABASE_TEST_A_EMAIL ?? '',
  password: env.SUPABASE_TEST_A_PASSWORD ?? '',
};
const configured = Object.values(config).every((value) => value !== '');

const RUNS = Number(process.env.PERF_RUNS ?? 5);
const SIZE_NAMES = (process.env.PERF_SIZES ?? 'typical,heavy').split(',') as (keyof typeof SIZES)[];
const ONLY = process.env.PERF_ONLY === undefined ? null : new Set(process.env.PERF_ONLY.split(','));
const OUT = process.env.PERF_OUT ?? 'perf-db.json';
const EXTRA = Number(process.env.PERF_EXTRA_LATENCY_MS ?? 0);
const wanted = (name: string): boolean => ONLY === null || ONLY.has(name);

type Table = 'board_columns' | 'tasks' | 'recipes' | 'pantry_items' | 'list_items' | 'list_groups' | 'diet_profiles';
const TABLES: Table[] = ['list_items', 'tasks', 'recipes', 'pantry_items', 'list_groups', 'diet_profiles', 'board_columns'];
const COLLECTIONS = ['members', 'columns', 'tasks', 'recipes', 'pantry', 'dietProfiles', 'listItems', 'listGroups'] as const;
const KITCHEN = ['recipes', 'pantry', 'dietProfiles', 'listItems', 'listGroups'] as const;

interface Signed {
  client: SupabaseClient;
  userId: string;
  familyId: string;
  accessToken: string;
  refreshToken: string;
}

const startedAt = new Date().toISOString();
const seeded = Object.fromEntries(TABLES.map((table) => [table, new Set<string>()])) as Record<Table, Set<string>>;
const photoIds: string[] = [];
let seed: Signed | null = null;
const results: Record<string, unknown> = { startedAt, runs: RUNS, extraLatencyMs: EXTRA, sizes: {} };

async function signIn(name: string): Promise<Signed> {
  const session = await signInTester('family-a', config.url, config.key, config.email, config.password);
  const { data } = await session.client.auth.getSession();
  if (data.session === null) throw new Error(`${name}: no session after sign-in`);
  nameClient(data.session.access_token, name);
  return { ...session, accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
}

/** A new client on an existing session, as a fresh page load would have from storage. */
async function freshClient(from: Signed): Promise<SupabaseClient> {
  const client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.setSession({ access_token: from.accessToken, refresh_token: from.refreshToken });
  if (error !== null) throw new Error(`setSession: ${error.message}`);
  return client;
}

/** snake_case top-level keys, undefined dropped: what supabaseStore.toRow() sends. */
function toRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) out[key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)] = value;
  }
  return out;
}

async function insert<T>(table: Table, rows: readonly T[]): Promise<Array<Record<string, unknown>>> {
  if (seed === null) throw new Error('not signed in');
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((row) => ({ ...toRow(row as Record<string, unknown>), family_id: seed!.familyId }));
    // Rows differ in which optional keys they carry; a missing one takes the column default, not NULL.
    const { data, error } = await seed.client.from(table).insert(chunk, { defaultToNull: false }).select();
    if (error !== null) throw new Error(`${table} insert: ${error.message}`);
    for (const row of data ?? []) {
      seeded[table].add(row.id as string);
      out.push(row as Record<string, unknown>);
    }
  }
  return out;
}

async function remove(table: Table, ids: Iterable<string>): Promise<void> {
  if (seed === null) return;
  const list = [...ids];
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await seed.client.from(table).delete().in('id', list.slice(i, i + 100)).eq('family_id', seed.familyId);
    if (error !== null) throw new Error(`${table} delete: ${error.message}`);
  }
  for (const id of list) seeded[table].delete(id);
}

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of [...TABLES, 'members'] as const) {
    const { count, error } = await seed!.client.from(table).select('id', { count: 'exact', head: true }).eq('family_id', seed!.familyId);
    if (error !== null) throw new Error(`${table} count: ${error.message}`);
    out[table] = count ?? 0;
  }
  return out;
}

function camel<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null) out[key.replace(/_([a-z])/g, (_m, char: string) => char.toUpperCase())] = value;
  }
  return out as T;
}

const loaded = (collection: Collection<Base>): boolean => cacheOf(collection).getSnapshot().loaded;
const rowsOf = <T extends Base>(collection: Collection<T>): T[] => cacheOf(collection).getSnapshot().rows;

/** Every collection open, as it is once the app has mounted, with its channels joined. */
async function openApp(store: DataStore, client: SupabaseClient): Promise<() => Promise<void>> {
  const stops = COLLECTIONS.map((name) => cacheOf(store[name] as Collection<Base>).subscribe(() => {}));
  await until(() => COLLECTIONS.every((name) => loaded(store[name] as Collection<Base>)), 30_000, 'first reads');
  await until(() => client.getChannels().length >= COLLECTIONS.length && client.getChannels().every((channel) => channel.state === 'joined'), 30_000, 'realtime channels');
  return async () => {
    for (const stop of stops) stop();
    await client.removeAllChannels();
  };
}

interface Sample extends Record<string, number> {}

function windowStats(first: number, client: string): Sample {
  const window = hits.slice(first).filter((hit) => hit.client === client);
  const reads = window.filter((hit) => hit.kind === 'read');
  return {
    requests: window.length,
    reads: reads.length,
    writes: window.filter((hit) => hit.kind === 'write').length,
    readKB: reads.reduce((total, hit) => total + hit.bytes, 0) / 1024,
  };
}

/** One warm-up, then RUNS measured runs; prepare and restore stay outside the timed window. */
async function measure<C>(
  name: string,
  client: string,
  prepare: () => Promise<C>,
  act: (context: C) => Promise<unknown>,
  restore: (context: C) => Promise<void>,
): Promise<Record<string, Spread>> {
  const samples: Sample[] = [];
  for (let run = 0; run <= RUNS; run += 1) {
    const context = await prepare();
    await settle();
    const first = hits.length;
    const t0 = performance.now();
    await act(context);
    const done = performance.now() - t0;
    const last = await settle();
    if (run > 0) samples.push({ done, settled: Math.max(done, last - t0), ...windowStats(first, client) });
    await restore(context);
    await settle();
  }
  const summary = summarise(samples);
  console.log(`  ${name.padEnd(22)} done ${show(summary.done!)}, settled ${show(summary.settled!)}, ` +
    `${summary.requests!.median} requests (${summary.reads!.median} reads, ${summary.writes!.median} writes), read ${show(summary.readKB!, 'KB', 1)}`);
  return summary;
}

async function tlsSetup(): Promise<number> {
  const host = new URL(config.url).hostname;
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const socket = connect({ host, port: 443, servername: host }, () => {
      const elapsed = performance.now() - t0;
      socket.end();
      resolve(elapsed);
    });
    socket.on('error', reject);
  });
}

async function measureSize(sizeName: keyof typeof SIZES, app: Signed, peer: Signed, startupFrom: Signed): Promise<void> {
  // Attached before measuring, so a failure part-way still leaves what was measured.
  const out: Record<string, unknown> = { counts: await counts() };
  (results.sizes as Record<string, unknown>)[sizeName] = out;
  console.log(`\n[${sizeName}] rows in family A: ${JSON.stringify(out.counts)}`);

  const raw = createSupabaseStore(app.familyId, app.client);

  if (wanted('ping')) {
    const samples: Sample[] = [];
    for (let run = 0; run <= RUNS; run += 1) {
      const t0 = performance.now();
      const { error } = await app.client.from('families').select('id').limit(1);
      if (error !== null) throw new Error(error.message);
      const request = performance.now() - t0;
      const tls = await tlsSetup();
      if (run > 0) samples.push({ request, tls });
    }
    out.ping = summarise(samples);
    const ping = out.ping as Record<string, Spread>;
    console.log(`  round trip ${show(ping.request!)}, new TLS connection ${show(ping.tls!)}`);
  }

  if (wanted('list')) {
    const list: Record<string, Record<string, Spread>> = {};
    for (const name of COLLECTIONS) {
      const samples: Sample[] = [];
      for (let run = 0; run <= RUNS; run += 1) {
        const first = hits.length;
        const t0 = performance.now();
        const rows = await raw[name].list();
        const ms = performance.now() - t0;
        const kb = hits.slice(first).reduce((total, hit) => total + hit.bytes, 0) / 1024;
        if (run > 0) samples.push({ ms, kb, rows: rows.length });
      }
      list[name] = summarise(samples);
      const last = hits[hits.length - 1]!;
      const wire = last.wireBytes === null ? 'no length' : `${(last.wireBytes / 1024).toFixed(1)} KB on the wire`;
      console.log(`  list ${name.padEnd(13)} ${show(list[name]!.ms!)}, ${list[name]!.rows!.median} rows, ${show(list[name]!.kb!, 'KB', 1)} (${last.encoding || 'uncompressed'}, ${wire})`);
    }
    out.list = list;
  }

  if (wanted('writes')) {
    const column = rowsOfRaw(await raw.columns.list())[0]!;
    const samples: Sample[] = [];
    for (let run = 0; run <= RUNS; run += 1) {
      let t0 = performance.now();
      const task = await raw.tasks.create({ title: 'Perf: round trip', columnId: column.id, position: 999_999, done: false });
      const create = performance.now() - t0;
      t0 = performance.now();
      await raw.tasks.update(task.id, { title: 'Perf: round trip, renamed' });
      const update = performance.now() - t0;
      t0 = performance.now();
      await raw.tasks.remove(task.id);
      const removeMs = performance.now() - t0;
      if (run > 0) samples.push({ create, update, remove: removeMs });
    }
    out.writes = summarise(samples);
    const writes = out.writes as Record<string, Spread>;
    console.log(`  task create ${show(writes.create!)}, update ${show(writes.update!)}, remove ${show(writes.remove!)}`);
  }

  // Startup is SupabaseSession's resolve(): openFamily(), then its setup. A
  // device that has opened the app before knows the family; a new one does not.
  for (const [name, guess] of [['startup', startupFrom.familyId], ['startupNewDevice', null]] as const) {
    if (!wanted(name)) continue;
    const samples: Sample[] = [];
    for (let run = 0; run <= RUNS; run += 1) {
      const client = await freshClient(startupFrom);
      await settle(1000);
      const first = hits.length;
      const t0 = performance.now();
      const opened = await openFamily(client, startupFrom.userId, guess);
      if (opened === null) throw new Error('startup: no family');
      const { store } = opened;
      const stops = COLLECTIONS.map((collection) => cacheOf(store[collection] as Collection<Base>).subscribe(() => {}));
      await opened.setup;
      const ready = performance.now() - t0;
      await until(() => loaded(store.members) && loaded(store.columns) && loaded(store.tasks), 30_000, 'board rows');
      const board = performance.now() - t0;
      await until(() => KITCHEN.every((collection) => loaded(store[collection] as Collection<Base>)), 30_000, 'kitchen rows');
      const kitchen = performance.now() - t0;
      await settle(1000);
      if (run > 0) samples.push({ ready, board: Math.max(board, ready), kitchen: Math.max(kitchen, ready), ...windowStats(first, 'startup') });
      for (const stop of stops) stop();
      await client.removeAllChannels();
    }
    out[name] = summarise(samples);
    const startup = out[name] as Record<string, Spread>;
    console.log(`  ${name}: loading screen gone ${show(startup.ready!)}, board rows ${show(startup.board!)}, kitchen rows ${show(startup.kitchen!)}, ` +
      `${startup.requests!.median} requests, read ${show(startup.readKB!, 'KB', 1)}`);
  }

  const actionNames = ['addTask', 'moveTask', 'checkItem', 'addRecipe', 'removeRecipe', 'moveToPantry', 'photos'];
  if (actionNames.some(wanted) || wanted('sync') || wanted('syncDelete')) {
    const store = withCache(createSupabaseStore(app.familyId, app.client));
    const close = await openApp(store, app.client);
    const actions: Record<string, unknown> = {};
    out.actions = actions;
    // Deletes go through the app's own store: another client's delete never
    // reaches this one's cache (see syncDelete), which would leave it stale.
    const removeVia = async <T extends Base>(collection: Collection<T>, table: Table, ids: readonly string[]): Promise<void> => {
      await Promise.all(ids.map((id) => collection.remove(id)));
      for (const id of ids) seeded[table].delete(id);
    };
    try {
      const columns = (): BoardColumn[] => [...rowsOf(store.columns)].filter((column) => seeded.board_columns.has(column.id)).sort((a, b) => a.position - b.position);
      const endOf = (columnId: string): number => Math.max(0, ...rowsOf(store.tasks).filter((task) => task.columnId === columnId).map((task) => task.position)) + 1000;

      if (wanted('addTask')) {
        actions.addTask = await measure('add a task', 'app',
          async () => ({ id: '' }),
          async (context) => {
            const created = await store.tasks.create({ title: 'Perf: new chore', columnId: columns()[0]!.id, position: endOf(columns()[0]!.id), done: false });
            context.id = created.id;
          },
          async (context) => removeVia(store.tasks, 'tasks', [context.id]));
      }

      if (wanted('moveTask')) {
        actions.moveTask = await measure('move a task', 'app',
          async () => {
            const [from, to] = columns();
            const task = rowsOf(store.tasks).find((row) => row.columnId === from!.id && seeded.tasks.has(row.id))!;
            return { task, to: to! };
          },
          async ({ task, to }) => placeTask(store, task, to, endOf(to.id)),
          async ({ task }) => {
            const { error } = await seed!.client.from('tasks').update({ column_id: task.columnId, position: task.position, done: task.done }).eq('id', task.id);
            if (error !== null) throw new Error(error.message);
          });
      }

      if (wanted('checkItem')) {
        actions.checkItem = await measure('check off an item', 'app',
          async () => rowsOf(store.listItems).find((item) => !item.checked && seeded.list_items.has(item.id))!,
          async (item) => store.listItems.update(item.id, { checked: true }),
          async (item) => {
            const { error } = await seed!.client.from('list_items').update({ checked: false }).eq('id', item.id);
            if (error !== null) throw new Error(error.message);
          });
      }

      if (wanted('addRecipe')) {
        const twelve = rowsOf(store.recipes).find((recipe) => recipe.title === TWELVE.title)!;
        const plan = planAddRecipe(rowsOf(store.listItems), twelve, twelve.servings, pantryIndex(rowsOf(store.pantry)));
        console.log(`  (recipe plan: ${plan.create.length} creates, ${plan.update.length} updates, ${plan.remove.length} removes)`);
        actions.addRecipe = await measure('add recipe to list', 'app',
          async () => ({ ids: [] as string[] }),
          async (context) => {
            context.ids = await addRecipeToList(store, rowsOf(store.listItems), twelve, twelve.servings, pantryIndex(rowsOf(store.pantry)));
          },
          async (context) => removeVia(store.listItems, 'list_items', context.ids));
      }

      if (wanted('removeRecipe')) {
        const twelve = rowsOf(store.recipes).find((recipe) => recipe.title === TWELVE.title)!;
        actions.removeRecipe = await measure('take recipe off list', 'app',
          async () => {
            const ids = await addRecipeToList(store, rowsOf(store.listItems), twelve, twelve.servings, pantryIndex(rowsOf(store.pantry)));
            await settle();
            return ids;
          },
          async () => removeRecipeFromList(store, rowsOf(store.listItems), twelve.id),
          async () => {});
      }

      if (wanted('moveToPantry')) {
        actions.moveToPantry = await measure('move 15 to pantry', 'app',
          async () => {
            const have = new Set(rowsOf(store.pantry).filter((row) => row.kind === 'have').map((row) => keyForText(row.name, row.canonicalId)));
            const items = rowsOf(store.listItems)
              .filter((item) => seeded.list_items.has(item.id) && !have.has(keyForText(item.name, item.canonicalId)))
              .slice(0, 15);
            return { items, pantryBefore: new Set(rowsOf(store.pantry).map((row) => row.id)) };
          },
          async ({ items }) => moveToPantry(store, items, rowsOf(store.pantry)),
          async ({ items, pantryBefore }) => {
            const added = rowsOf(store.pantry).filter((row) => !pantryBefore.has(row.id)).map((row) => row.id);
            await removeVia(store.pantry, 'pantry_items', added);
            for (const item of items) seeded.list_items.delete(item.id);
            const back = await insert('list_items', items.map(({ id: _id, familyId: _f, createdAt: _c, updatedAt: _u, ...row }) => row as NewRow<ListItem>));
            const ids = new Set(back.map((row) => row.id as string));
            await until(() => rowsOf(store.listItems).filter((row) => ids.has(row.id)).length === ids.size, 30_000, 're-added list items');
          });
      }

      if (wanted('photos') && photoIds.length > 0) {
        let urls: Array<string | null> = [];
        actions.photos = await measure(`${photoIds.length} photo URLs`, 'app',
          async () => createSupabaseStore(app.familyId, app.client).photos,
          async (photos) => {
            urls = await Promise.all(photoIds.map((id) => photos.url(id)));
          },
          async () => {});
        // Every card got a URL, each for its own photo, and one of them serves the file.
        const empty = urls.filter((url) => url === null).length;
        const mismatched = urls.filter((url, index) => url !== null && !url.includes(encodeURI(photoIds[index]!))).length;
        const served = urls[0] === null || urls[0] === undefined ? 0 : (await fetch(urls[0])).status;
        console.log(`  (photo URLs: ${empty} empty, ${mismatched} for the wrong photo, first one served with HTTP ${served})`);
        if (empty > 0 || mismatched > 0 || served !== 200) throw new Error('photo URLs are wrong');
      }

      if (wanted('sync')) {
        const peerStore = withCache(createSupabaseStore(peer.familyId, peer.client));
        const closePeer = await openApp(peerStore, peer.client);
        try {
          const samples: Sample[] = [];
          const task = rowsOf(store.tasks).find((row) => seeded.tasks.has(row.id))!;
          for (let run = 0; run <= RUNS; run += 1) {
            await settle();
            const title = `${task.title} ~${run}`;
            const first = hits.length;
            const t0 = performance.now();
            const write = store.tasks.update(task.id, { title });
            await until(() => rowsOf(peerStore.tasks).some((row) => row.id === task.id && row.title === title), 30_000, 'the change on the other device');
            const delay = performance.now() - t0;
            await write;
            await settle();
            const peerStats = windowStats(first, 'peer');
            const appStats = windowStats(first, 'app');
            if (run > 0) samples.push({ delay, peerReads: peerStats.reads, peerReadKB: peerStats.readKB, appReads: appStats.reads, appReadKB: appStats.readKB });
          }
          await store.tasks.update(task.id, { title: task.title });
          actions.sync = summarise(samples);
          const sync = actions.sync as Record<string, Spread>;
          console.log(`  other device sees a change ${show(sync.delay!)}; it re-reads ${sync.peerReads!.median}× (${show(sync.peerReadKB!, 'KB', 1)}), ` +
            `the writer re-reads ${sync.appReads!.median}× (${show(sync.appReadKB!, 'KB', 1)})`);
        } finally {
          await closePeer();
        }
      }

      if (wanted('syncDelete')) {
        // Does a deletion on one device reach the other? Three tries, ten seconds each.
        const peerStore = withCache(createSupabaseStore(peer.familyId, peer.client));
        const closePeer = await openApp(peerStore, peer.client);
        const delays: Array<number | null> = [];
        try {
          const column = columns()[0]!;
          for (let run = 0; run < 3; run += 1) {
            const task = await store.tasks.create({ title: `Perf: delete me ${run}`, columnId: column.id, position: endOf(column.id), done: false });
            seeded.tasks.add(task.id);
            await until(() => rowsOf(peerStore.tasks).some((row) => row.id === task.id), 30_000, 'the new task on the other device');
            await settle();
            const t0 = performance.now();
            await removeVia(store.tasks, 'tasks', [task.id]);
            try {
              await until(() => !rowsOf(peerStore.tasks).some((row) => row.id === task.id), 10_000, 'the deletion on the other device');
              delays.push(performance.now() - t0);
            } catch {
              delays.push(null);
            }
          }
        } finally {
          await closePeer();
        }
        actions.syncDelete = delays;
        console.log(`  other device sees a deletion: ${delays.map((delay) => (delay === null ? 'never (10 s)' : `${delay.toFixed(0)} ms`)).join(', ')}`);
      }
    } finally {
      await close();
    }
  }
}

function rowsOfRaw<T extends { position: number }>(rows: T[]): T[] {
  return rows.filter((row) => seeded.board_columns.has((row as unknown as Base).id)).sort((a, b) => a.position - b.position);
}

async function grow(size: keyof typeof SIZES, memberId: string): Promise<void> {
  const target = SIZES[size];
  const have = (table: Table): number => seeded[table].size;

  if (have('board_columns') === 0) await insert('board_columns', COLUMNS);
  if (have('list_groups') === 0) await insert('list_groups', GROUPS);
  const { data: profiles } = await seed!.client.from('diet_profiles').select('id').eq('family_id', seed!.familyId);
  if ((profiles ?? []).length === 0) await insert('diet_profiles', [{ presets: {}, custom: [], conflictMode: 'hide' }]);

  const columns = (await seed!.client.from('board_columns').select().in('id', [...seeded.board_columns])).data!
    .map((row) => camel<BoardColumn>(row)).sort((a, b) => a.position - b.position);
  await insert('tasks', taskRows(have('tasks'), target.tasks, columns, memberId));

  if (have('recipes') === 0) await insert('recipes', [{ ...TWELVE, createdBy: memberId }]);
  await insert('recipes', recipeRows(have('recipes') - 1, target.recipes, memberId));

  // Photos go on recipes that have none yet, through the app's own upload.
  const store = createSupabaseStore(seed!.familyId, seed!.client);
  const recipes = (await seed!.client.from('recipes').select().in('id', [...seeded.recipes])).data!.map((row) => camel<Recipe>(row));
  const bare = recipes.filter((recipe) => recipe.photoId === undefined && recipe.title !== TWELVE.title);
  for (const recipe of bare.slice(0, Math.max(0, target.photos - photoIds.length))) {
    const id = await store.photos.put(new Blob([TINY_JPEG], { type: 'image/jpeg' }));
    photoIds.push(id);
    const { error } = await seed!.client.from('recipes').update({ photo_id: id }).eq('id', recipe.id);
    if (error !== null) throw new Error(error.message);
  }

  await insert('pantry_items', pantryRows(have('pantry_items'), target.pantry));
  const groups = [...seeded.list_groups];
  // One insert gives every row the same created_at, so titles break the tie.
  const ordered = recipes
    .filter((recipe) => recipe.title !== TWELVE.title)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title));
  await insert('list_items', listRows(have('list_items'), target.listItems, ordered, groups));
}

async function cleanUp(): Promise<void> {
  if (seed === null) return;
  // Everything this run created: tracked ids, then anything else made since it started.
  for (const table of TABLES) await remove(table, seeded[table]);
  for (const table of TABLES) {
    const { data } = await seed.client.from(table).select('id').eq('family_id', seed.familyId).gte('created_at', startedAt);
    const stray = (data ?? []).map((row) => row.id as string);
    if (stray.length > 0) {
      console.log(`  removing ${stray.length} stray ${table} rows made during the run`);
      await remove(table, stray);
    }
  }
  const bucket = seed.client.storage.from('recipe-photos');
  const { data: objects } = await bucket.list(seed.familyId, { limit: 1000 });
  const mine = (objects ?? []).filter((object) => object.created_at !== null && object.created_at >= startedAt).map((object) => `${seed!.familyId}/${object.name}`);
  const photos = [...new Set([...photoIds, ...mine])];
  if (photos.length > 0) {
    const { error } = await bucket.remove(photos);
    if (error !== null) console.warn(`photo clean-up: ${error.message}`);
  }
}

afterAll(async () => {
  try {
    await cleanUp();
    if (seed !== null) {
      const after = await counts();
      console.log(`\nafter clean-up, rows in family A: ${JSON.stringify(after)}`);
      results.after = after;
    }
  } finally {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(results, null, 2));
  }
}, 600_000);

it.skipIf(!configured)('database timings', async () => {
  setExtraLatency(0);
  seed = await signIn('seed');
  const app = await signIn('app');
  const peer = await signIn('peer');
  const startupFrom = await signIn('startup');
  results.before = await counts();
  console.log(`rows in family A before seeding: ${JSON.stringify(results.before)}`);

  for (const size of SIZE_NAMES) {
    await grow(size, app.userId);
    await settle(1000);
    setExtraLatency(EXTRA);
    await measureSize(size, app, peer, startupFrom);
    setExtraLatency(0);
  }
});
