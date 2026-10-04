// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/*
 * The shows table in supabase/schema.sql, on an in-process Postgres: its
 * policy, its one row per title, its checks, its trigger and realtime. Never
 * against the real project, whose .env.test users live in production.
 */

const shim = readFileSync(new URL('./supabaseShim.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');

let db: PGlite;
const FAMILY_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const FAMILY_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';

const INSERT = `insert into shows (family_id, imdb_id, kind, title, fetched_at) values ($1, $2, 'movie', 'Inception', now()) returning *`;

/** Runs `sql` as a signed-in member, with RLS applied, as PostgREST does. */
async function as<T>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec('set role authenticated');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(shim);
  await db.exec(schema);
}, 60_000);

beforeEach(async () => {
  await db.exec('reset role; truncate shows, members, families cascade; delete from auth.users;');
  await db.query(`insert into families (id, name, join_code) values ($1, 'A', 'AAAAAAAA'), ($2, 'B', 'BBBBBBBB')`, [FAMILY_A, FAMILY_B]);
  await db.query('insert into auth.users (id) values ($1), ($2)', [USER_A, USER_B]);
  await db.query(`insert into members (id, family_id, name, color) values ($1, $2, 'A', '#000000'), ($3, $4, 'B', '#000000')`, [USER_A, FAMILY_A, USER_B, FAMILY_B]);
});

describe('shows', () => {
  it("lets a member read and write their own family's shows, and no one else's", async () => {
    await as(USER_A, INSERT, [FAMILY_A, 'tt1375666']);
    await as(USER_B, INSERT, [FAMILY_B, 'tt0903747']);
    await expect(as(USER_A, INSERT, [FAMILY_B, 'tt0111161'])).rejects.toThrow(/row-level security/);

    const mine = await as<{ imdb_id: string }>(USER_A, 'select imdb_id from shows');
    expect(mine.map((row) => row.imdb_id)).toEqual(['tt1375666']);
    const changed = await as(USER_A, `update shows set status = 'watched' where imdb_id = 'tt0903747' returning id`);
    expect(changed).toEqual([]);
    const removed = await as(USER_A, `delete from shows where imdb_id = 'tt0903747' returning id`);
    expect(removed).toEqual([]);
  });

  it('keeps one row per title per family', async () => {
    await as(USER_A, INSERT, [FAMILY_A, 'tt1375666']);
    await expect(as(USER_A, INSERT, [FAMILY_A, 'tt1375666'])).rejects.toThrow(/shows_one_per_title/);
    // Another family may have the same title.
    await expect(as(USER_B, INSERT, [FAMILY_B, 'tt1375666'])).resolves.toHaveLength(1);
  });

  it('starts at to-watch and refuses values the app never writes', async () => {
    const [row] = await as<{ status: string; watched_at: string | null }>(USER_A, INSERT, [FAMILY_A, 'tt1375666']);
    expect(row?.status).toBe('to-watch');
    expect(row?.watched_at).toBeNull();

    const bad = [
      `insert into shows (family_id, imdb_id, kind, title, fetched_at) values ($1, 'nm0000138', 'movie', 'X', now())`,
      `insert into shows (family_id, imdb_id, kind, title, fetched_at) values ($1, 'tt0000001', 'episode', 'X', now())`,
      `insert into shows (family_id, imdb_id, kind, title, fetched_at, status) values ($1, 'tt0000002', 'movie', 'X', now(), 'seen')`,
      `insert into shows (family_id, imdb_id, kind, title, fetched_at, poster_url) values ($1, 'tt0000003', 'movie', 'X', now(), 'http://example.com/p.jpg')`,
      `insert into shows (family_id, imdb_id, kind, title, fetched_at, imdb_rating) values ($1, 'tt0000004', 'movie', 'X', now(), 11)`,
      `insert into shows (family_id, imdb_id, kind, title) values ($1, 'tt0000005', 'movie', 'X')`,
    ];
    for (const sql of bad) await expect(as(USER_A, sql, [FAMILY_A]), sql).rejects.toThrow();

    // The four statuses the app writes.
    for (const status of ['watching', 'watched', 'dropped', 'to-watch']) {
      await expect(as(USER_A, `update shows set status = $1 where imdb_id = 'tt1375666' returning status`, [status])).resolves.toEqual([{ status }]);
    }
  });

  it('moves updated_at on every update and leaves created_at', async () => {
    const [row] = await as<{ id: string; created_at: Date; updated_at: Date }>(USER_A, INSERT, [FAMILY_A, 'tt1375666']);
    expect(row?.updated_at.getTime()).toBe(row?.created_at.getTime());
    const [after] = await as<{ created_at: Date; updated_at: Date }>(USER_A, `update shows set status = 'watching' where id = $1 returning *`, [row?.id]);
    expect(after?.created_at.getTime()).toBe(row?.created_at.getTime());
    expect(after?.updated_at.getTime()).toBeGreaterThan(row?.updated_at.getTime() ?? Infinity);
  });

  it('is in the realtime publication', async () => {
    const { rows } = await db.query(`select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shows'`);
    expect(rows).toHaveLength(1);
  });
});
