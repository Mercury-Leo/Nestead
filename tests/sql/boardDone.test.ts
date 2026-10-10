// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/*
 * task_completions and the 20261010120000 migration, on an in-process Postgres.
 * Never against the real project, whose .env.test users live in production.
 */

const shim = readFileSync(new URL('./supabaseShim.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../../supabase/migrations/20261010120000_board_done_tasks.sql', import.meta.url),
  'utf8',
);

const FAMILY_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const FAMILY_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';

/** Two families with one member each. */
async function seed(db: PGlite): Promise<void> {
  await db.query(`insert into families (id, name, join_code) values ($1, 'A', 'AAAAAAAA'), ($2, 'B', 'BBBBBBBB')`, [FAMILY_A, FAMILY_B]);
  await db.query('insert into auth.users (id) values ($1), ($2)', [USER_A, USER_B]);
  await db.query(
    `insert into members (id, family_id, name, color) values ($1, $2, 'A', '#000000'), ($3, $4, 'B', '#000000')`,
    [USER_A, FAMILY_A, USER_B, FAMILY_B],
  );
}

async function one<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0] as T;
}

describe('task_completions', () => {
  let db: PGlite;

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
    await db.exec('reset role; truncate task_completions, tasks, board_columns, members, families cascade; delete from auth.users;');
    await seed(db);
  });

  it("lets a member read and write their own family's history, and no one else's", async () => {
    await as(USER_A, `insert into task_completions (family_id, task_id, title) values ($1, gen_random_uuid(), 'Bins')`, [FAMILY_A]);

    expect(await as(USER_A, 'select title from task_completions')).toEqual([{ title: 'Bins' }]);
    expect(await as(USER_B, 'select title from task_completions')).toEqual([]);
    await expect(
      as(USER_B, `insert into task_completions (family_id, task_id, title) values ($1, gen_random_uuid(), 'X')`, [FAMILY_A]),
    ).rejects.toThrow();
  });

  it('keeps a task\'s history, task_id and all, when the task is deleted', async () => {
    const column = await one<{ id: string }>(db, `insert into board_columns (family_id, name, position) values ($1, 'To do', 1000) returning id`, [FAMILY_A]);
    const task = await one<{ id: string }>(
      db,
      `insert into tasks (family_id, title, column_id, position, done) values ($1, 'Bins', $2, 1000, true) returning id`,
      [FAMILY_A, column.id],
    );
    await db.query(`insert into task_completions (family_id, task_id, title, column_id) values ($1, $2, 'Bins', $3)`, [FAMILY_A, task.id, column.id]);

    await db.query('delete from tasks where id = $1', [task.id]);

    expect((await db.query('select task_id from task_completions')).rows).toEqual([{ task_id: task.id }]);
  });
});

describe('migration 20261010120000_board_done_tasks', () => {
  let db: PGlite;
  let columnId: string;

  interface Row {
    title: string;
    done_at: Date | null;
    completion_id: string | null;
    due: string | null;
  }
  const tasks = async (): Promise<Row[]> =>
    (
      await db.query<Row>(
        `select title, done_at, completion_id, to_char(due_date, 'YYYY-MM-DD') as due from tasks order by title`,
      )
    ).rows;

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { pgcrypto } });
    await db.exec(shim);
    await db.exec(schema);
    // The schema before this change: no history table, no done_at or completion_id.
    await db.exec('drop table task_completions; alter table tasks drop column done_at, drop column completion_id;');
    await seed(db);
    columnId = (await one<{ id: string }>(db, `insert into board_columns (family_id, name, position) values ($1, 'Done', 3000) returning id`, [FAMILY_A])).id;

    const insert = `insert into tasks (family_id, title, column_id, position, done, icon, description, assignee_id,
        recur_every_days, recur_every_months, recur_from, due_date, created_at, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`;
    // Open: untouched.
    await db.query(insert, [FAMILY_A, 'Open', columnId, 1000, false, null, null, null, null, null, null, '2026-10-20', '2026-10-01T08:00:00Z']);
    // A done one-off.
    await db.query(insert, [FAMILY_A, 'Parcel', columnId, 2000, true, '📦', 'Blue box', USER_A, null, null, null, null, '2026-10-02T09:00:00Z']);
    // A done weekly chore: the old rule already moved its due date on to the 13th.
    await db.query(insert, [FAMILY_A, 'Bins', columnId, 3000, true, '🗑️', null, null, 7, null, '2026-09-01', '2026-10-13', '2026-10-06T18:00:00Z']);
    // A done monthly chore on the 31st, clamped to the 30th in November.
    await db.query(insert, [FAMILY_A, 'Rent', columnId, 4000, true, null, null, null, null, 1, '2026-01-31', '2026-11-30', '2026-10-31T10:00:00Z']);

    await db.exec(migration);
  }, 60_000);

  it('sets done_at to when each done task was last changed, before the migration', async () => {
    const byTitle = new Map((await tasks()).map((row) => [row.title, row.done_at?.toISOString() ?? null]));
    expect(byTitle.get('Open')).toBeNull();
    expect(byTitle.get('Parcel')).toBe('2026-10-02T09:00:00.000Z');
    expect(byTitle.get('Bins')).toBe('2026-10-06T18:00:00.000Z');
    expect(byTitle.get('Rent')).toBe('2026-10-31T10:00:00.000Z');
  });

  it('backfills one history entry per done task, copied from it, with no member', async () => {
    const entries = (
      await db.query<{ title: string; icon: string | null; description: string | null; column_id: string; assignee_id: string | null; member_id: string | null; created_at: Date }>(
        'select title, icon, description, column_id, assignee_id, member_id, created_at from task_completions order by title',
      )
    ).rows;

    expect(entries.map((row) => row.title)).toEqual(['Bins', 'Parcel', 'Rent']);
    const parcel = entries.find((row) => row.title === 'Parcel')!;
    expect(parcel).toMatchObject({ icon: '📦', description: 'Blue box', column_id: columnId, assignee_id: USER_A, member_id: null });
    expect(parcel.created_at.toISOString()).toBe('2026-10-02T09:00:00.000Z');
  });

  it('points each done task at its entry, and leaves open ones without', async () => {
    const linked = (
      await db.query<{ title: string; same: boolean | null }>(
        `select t.title, t.completion_id = c.id as same
         from tasks t left join task_completions c on c.task_id = t.id order by t.title`,
      )
    ).rows;
    expect(linked).toEqual([
      { title: 'Bins', same: true },
      { title: 'Open', same: null },
      { title: 'Parcel', same: true },
      { title: 'Rent', same: true },
    ]);
  });

  it('moves a done repeat back one day, so its return date stays the date it shows now', async () => {
    const due = new Map((await tasks()).map((row) => [row.title, row.due]));
    expect(due.get('Bins')).toBe('2026-10-12');
    expect(due.get('Rent')).toBe('2026-11-29');
    expect(due.get('Parcel')).toBeNull();
    expect(due.get('Open')).toBe('2026-10-20');
  });
});
