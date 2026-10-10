# Board done tasks and history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Done column with a tick on each card, fold finished cards under their own column, clear them by hand or after a week, and add a History page that records every tick and can restore a task.

**Architecture:** `Task.done` becomes the card's own state, written by a tick (`completeTask()` in `src/features/board/actions.ts`), with `doneAt` and `completionId` beside it. Each tick also writes a row to a new `taskCompletions` collection (table `task_completions`), which only the new History page lists. `BoardColumn.isDone` is removed. Repeating chores keep the due date they covered and work out their return date from `doneAt`.

**Tech Stack:** React 18, TypeScript strict, Vite 5, Vitest 2 + jsdom, react-router 6, i18next, Supabase (Postgres + RLS + realtime), a localStorage demo backend, PGlite for SQL tests.

**Spec:** `docs/superpowers/specs/2026-10-10-board-done-tasks-design.md`. Read it before starting; this plan argues from it.

## Global Constraints

- Work in the worktree `../.worktrees/board-done-tasks` on branch `board/done-tasks` (Task 0). The shared checkout at `Nestead/` must never switch branch: other sessions use it.
- Stage explicit paths only (`git add <path> ...`), never `git add -A` or `git add .`.
- Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Screens read rows only through `useSession()` and `useCollection()`/`useCollectionState()` (`src/data/useCollection.ts`). Nothing outside `src/data/supabase/` names a table or imports `@supabase/supabase-js` (`src/data/boundary.test.ts` enforces this).
- A schema change is a file in `supabase/migrations/`, the same end state in `supabase/schema.sql`, and the type in `src/domain/types.ts`.
- In a patch, omitting a key leaves the field alone; `key: undefined` clears it.
- UI text comes from `t()`. Every new key goes into both `src/i18n/locales/en.json` and `src/i18n/locales/he.json`. Hebrew plurals use `_one`, `_two` and `_other`; English uses `_one` and `_other`.
- English kept in code on purpose needs an `i18n:` comment, or `src/i18n/literals.test.ts` fails.
- CSS: the board's styles are global classes in `src/features/board/board.css`. Any other new screen uses a CSS module. Colours come from tokens (`--sage`, `--card`, `--muted`, `--border`, `--accent`, `--danger`...), never hex values.
- Working copies are CRLF (`core.autocrlf=true`). The Edit tool handles this; a script that splices text must normalise `\r\n` first.
- Run one test file with `npx vitest run <path>`; types with `npx tsc --noEmit`. `npm test` without `.env.test` runs everything except the live Supabase suites. Never copy `.env.test` into the worktree: the live suites write to the production project and are run in Task 9 only.
- The two migrations are applied to production **by the user**, never by you (Task 9).
- Before the branch can merge into `main`, the READMEs of every folder touched must be updated on the branch (`../.claude/hooks/docs-on-merge.mjs` blocks the merge otherwise). Task 8 does this.

---

### Task 0: Worktree

**Files:** none in the repo.

- [ ] **Step 1: Check the shared checkout is clean enough to branch from**

```bash
git -C "C:/Users/Mercury/Claude Projects/Nestead/Nestead" status --short
git -C "C:/Users/Mercury/Claude Projects/Nestead/Nestead" log --oneline -1
```

Expected: `main` at or after `8eb3ced Board done tasks: design spec`. Other sessions' uncommitted files may show; they are not yours and stay where they are.

- [ ] **Step 2: Create the worktree in the parent folder**

```bash
git -C "C:/Users/Mercury/Claude Projects/Nestead/Nestead" worktree add -b board/done-tasks ../.worktrees/board-done-tasks main
```

Expected: `Preparing worktree (new branch 'board/done-tasks')`. The folder is `C:\Users\Mercury\Claude Projects\Nestead\.worktrees\board-done-tasks`.

- [ ] **Step 3: Link `node_modules` (PowerShell; Git Bash mangles `mklink /J`)**

```powershell
New-Item -ItemType Junction -Path "C:\Users\Mercury\Claude Projects\Nestead\.worktrees\board-done-tasks\node_modules" -Target "C:\Users\Mercury\Claude Projects\Nestead\Nestead\node_modules"
```

When the worktree is finished with, remove the junction with `cmd /c rmdir <worktree>\node_modules` **before** deleting the worktree. `rm -rf` through a junction deletes the real `node_modules`.

- [ ] **Step 4: Check the board's tests pass in the worktree**

From the worktree:

```bash
npx vitest run src/features/board
```

Expected: PASS (`dragDrop`, `filter`, `recurrence`).

All later paths are relative to the worktree root.

---

### Task 1: Data model and the additive migration

**Files:**
- Modify: `src/domain/types.ts` (the `Task` interface; a new `TaskCompletion` after it)
- Modify: `supabase/schema.sql` (`tasks` table; a new `task_completions` section after the board's `alter publication` statement)
- Create: `supabase/migrations/20261010120000_board_done_tasks.sql`
- Test: `tests/sql/boardDone.test.ts` (new)

**Interfaces:**
- Produces: `Task.doneAt?: string`, `Task.completionId?: string`, and

```ts
export interface TaskCompletion extends Base {
  taskId: string;
  title: string;
  icon?: string;
  description?: string;
  columnId?: string;
  assigneeId?: string;
  memberId?: string;
}
```

- Produces: table `task_completions` with RLS policy `task_completions_all`; columns `tasks.done_at`, `tasks.completion_id`.

- [ ] **Step 1: Write the failing SQL test**

Create `tests/sql/boardDone.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/sql/boardDone.test.ts`
Expected: FAIL, first on `truncate task_completions` ("relation does not exist") and on reading the missing migration file.

- [ ] **Step 3: Add the columns and table to `supabase/schema.sql`**

In `create table tasks (...)`, after the line `done        boolean     not null default false,` add:

```sql
  -- When it was ticked; null while open. Orders the Done fold, drives
  -- auto-clear and a repeat's return date (src/features/board/recurrence.ts).
  done_at       timestamptz,
  -- The task_completions row the tick made, so an untick removes that one. No
  -- foreign key: a pointer for undo, cleared by the untick that uses it.
  completion_id uuid,
```

After the statement

```sql
alter publication supabase_realtime add table
  members, board_columns, tasks;
```

add this section:

```sql
-- ---------------------------------------------------------------------------
-- Task history: one row per tick, kept after the task is cleared from the
-- board, listed by the History page (src/features/board/history/).
-- ---------------------------------------------------------------------------

create table task_completions (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid        not null references families (id) on delete cascade,
  -- No foreign key: clearing a task must keep its history, and every entry of
  -- one task must still share its id afterwards, so Restore can re-point them
  -- all (on delete set null would blank them and let a second Restore duplicate it).
  task_id     uuid        not null,
  -- Copies taken at the tick, so history reads right after a rename and a
  -- cleared task can be restored.
  title       text        not null,
  icon        text,
  description text,
  column_id   uuid        references board_columns (id) on delete set null,
  assignee_id uuid        references members (id) on delete set null,
  -- Who ticked it. Null for entries the 20261010120000 migration backfilled.
  member_id   uuid        references members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index task_completions_family_id_idx on task_completions (family_id);

create trigger task_completions_set_updated_at before update on task_completions
  for each row execute function set_updated_at();

alter table task_completions enable row level security;

create policy task_completions_all on task_completions
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

alter publication supabase_realtime add table task_completions;
```

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261010120000_board_done_tasks.sql`:

```sql
-- Board: done is a tick on the card, and every tick is kept as history.
--
-- Run this against a database that already has the original schema.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- Additive: the app before this change ignores the new columns and table, so
-- this goes on BEFORE the new code is deployed. Dropping board_columns.is_done
-- is a second migration, applied after the deploy
-- (20261010130000_drop_column_is_done.sql).
--
-- Apply it in one run: the table gets RLS and its policy in the same
-- transaction, so it is never readable without one.

begin;

alter table tasks
  add column done_at       timestamptz,
  add column completion_id uuid;

create table task_completions (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid        not null references families (id) on delete cascade,
  task_id     uuid        not null,
  title       text        not null,
  icon        text,
  description text,
  column_id   uuid        references board_columns (id) on delete set null,
  assignee_id uuid        references members (id) on delete set null,
  member_id   uuid        references members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index task_completions_family_id_idx on task_completions (family_id);

create trigger task_completions_set_updated_at before update on task_completions
  for each row execute function set_updated_at();

alter table task_completions enable row level security;

create policy task_completions_all on task_completions
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

alter publication supabase_realtime add table task_completions;

-- Tasks already done get a history entry, so auto-clear (one-offs done over a
-- week ago) never removes one that History cannot restore. This runs before
-- the update below, which moves updated_at.
insert into task_completions (family_id, task_id, title, icon, description, column_id, assignee_id, created_at, updated_at)
  select family_id, id, title, icon, description, column_id, assignee_id, updated_at, updated_at
  from tasks
  where done;

-- When each was done, as near as is known; the entry an untick removes; and,
-- for a repeat, the round it covered. The old rule had already moved a done
-- repeat's due date on to its next round. The new one returns it on the first
-- round after its due date, so one day back lands on the same date as now.
update tasks t
set done_at = t.updated_at,
    completion_id = c.id,
    due_date = case
      when t.due_date is not null and (t.recur_every_days is not null or t.recur_every_months is not null)
        then t.due_date - 1
      else t.due_date
    end
from task_completions c
where c.task_id = t.id and t.done;

commit;
```

- [ ] **Step 5: Add the fields to `src/domain/types.ts`**

In `interface Task`, replace

```ts
  /** Mirrors the column's isDone. Never written on its own. */
  done: boolean;
```

with

```ts
  /**
   * Ticked. Written by the tick, an untick, a repeat coming back and a restore
   * (src/features/board/actions.ts); never copied from the column.
   */
  done: boolean;
  /** When it was ticked; absent while open. Orders the Done fold and drives auto-clear. */
  doneAt?: string;
  /** The TaskCompletion this tick created, so an untick removes exactly that one. */
  completionId?: string;
```

After the `Task` interface add:

```ts
/**
 * One tick of a task, kept after the task is cleared from the board. Listed by
 * the History page (src/features/board/history/), never by the board.
 */
export interface TaskCompletion extends Base {
  /** The task it was for. It may since have been cleared or deleted. */
  taskId: string;
  /** Copies taken at the tick, so a cleared task can be restored from them. */
  title: string;
  icon?: string;
  description?: string;
  columnId?: string;
  assigneeId?: string;
  /** Who ticked it. Absent for entries the migration backfilled, or once that member is deleted. */
  memberId?: string;
}
```

Leave `BoardColumn.isDone` where it is; Task 5 removes it.

- [ ] **Step 6: Run the SQL test and the type check**

Run: `npx vitest run tests/sql/boardDone.test.ts tests/sql/shows.test.ts`
Expected: PASS, 6 tests in `boardDone`, and `shows` still passing on the new schema.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add tests/sql/boardDone.test.ts supabase/schema.sql supabase/migrations/20261010120000_board_done_tasks.sql src/domain/types.ts
git commit -m "Board done tasks: task history table, done_at and completion_id, and the backfilling migration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The `taskCompletions` collection in every backend

**Files:**
- Modify: `src/data/types.ts` (import `TaskCompletion`; `DataStore.taskCompletions`)
- Modify: `src/data/local/localStore.ts:30` (`CollectionName`) and `createLocalStore()`
- Modify: `src/data/supabase/supabaseStore.ts` (`TableName`, `TIMESTAMP_KEYS`, `createSupabaseStore()`)
- Modify: `src/data/cache.ts` (`withCache()`)
- Modify: `src/data/supabase/supabaseStore.test.ts` (`clear()` empties the new collection)
- Test: `src/data/collection.contract.ts` (three new cases; run by `localStore.test.ts`, `cache.test.ts` and, live, `supabaseStore.test.ts`)

**Interfaces:**
- Consumes: `TaskCompletion`, `Task.doneAt`, `Task.completionId` (Task 1).
- Produces: `DataStore.taskCompletions: Collection<TaskCompletion>`, cached by `withCache()`.

- [ ] **Step 1: Write the failing contract cases**

In `src/data/collection.contract.ts`, add these three cases after `'remove deletes the row'`:

```ts
    it('remove of a row that is already gone does not throw', async () => {
      // Two devices auto-clearing the same done task at once both remove it.
      const task = await store.tasks.create(newTask('Twice'));
      await store.tasks.remove(task.id);

      await expect(store.tasks.remove(task.id)).resolves.toBeUndefined();
    });

    it('tasks keep when they were ticked and the entry that made, and clear both', async () => {
      const task = await store.tasks.create(newTask('Mop'));
      const entry = await store.taskCompletions.create({ taskId: task.id, title: 'Mop', columnId });
      const doneAt = '2026-10-10T18:30:00.000Z';

      const done = await store.tasks.update(task.id, { done: true, doneAt, completionId: entry.id });
      expect(done.doneAt).toBe(doneAt);
      expect(done.completionId).toBe(entry.id);
      expect((await store.tasks.list())[0]).toEqual(done);

      const open = await store.tasks.update(task.id, { done: false, doneAt: undefined, completionId: undefined });
      expect(open.doneAt).toBeUndefined();
      expect(open.completionId).toBeUndefined();
      expect((await store.tasks.list())[0]?.doneAt).toBeUndefined();
    });

    it('task completions round-trip, Hebrew included, outlive their task and can be re-pointed', async () => {
      const task = await store.tasks.create({ ...newTask('לקנות חלב'), icon: '🥛', description: 'Two litres' });
      const entry = await store.taskCompletions.create({
        taskId: task.id,
        title: 'לקנות חלב',
        icon: '🥛',
        description: 'Two litres',
        columnId,
      });

      const [stored] = await store.taskCompletions.list();
      expect(stored).toEqual(entry);
      expect(stored?.memberId).toBeUndefined();

      await store.tasks.remove(task.id);
      const [kept] = await store.taskCompletions.list();
      expect(kept?.taskId).toBe(task.id);
      expect(kept?.title).toBe('לקנות חלב');

      const again = await store.tasks.create(newTask('לקנות חלב'));
      expect((await store.taskCompletions.update(entry.id, { taskId: again.id })).taskId).toBe(again.id);
    });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/data/local/localStore.test.ts`
Expected: FAIL. `tsc` would also reject `store.taskCompletions`; Vitest reports `Cannot read properties of undefined (reading 'create')`.

- [ ] **Step 3: Add the collection to the interface**

In `src/data/types.ts`, add `TaskCompletion` to the import from `'../domain/types'` (alphabetical, after `Task`), and in `interface DataStore` after `tasks: Collection<Task>;`:

```ts
  /**
   * One row per tick, kept after the task is cleared. Only the History page
   * lists it; the board creates and removes rows by id.
   */
  taskCompletions: Collection<TaskCompletion>;
```

- [ ] **Step 4: The local backend**

In `src/data/local/localStore.ts`, add `'taskCompletions'` to `CollectionName` after `'tasks'`, add `TaskCompletion` to its domain import, and in `createLocalStore()` after the `tasks` line:

```ts
    taskCompletions: createCollection<TaskCompletion>(familyId, 'taskCompletions'),
```

- [ ] **Step 5: The Supabase backend**

In `src/data/supabase/supabaseStore.ts`:
- add `| 'task_completions'` to `TableName` after `| 'tasks'`;
- change `TIMESTAMP_KEYS` to `new Set(['createdAt', 'updatedAt', 'fetchedAt', 'watchedAt', 'doneAt'])`;
- add `TaskCompletion` to the domain import, and in `createSupabaseStore()` after the `tasks` line:

```ts
    taskCompletions: createCollection<TaskCompletion>(client, familyId, 'task_completions'),
```

- [ ] **Step 6: The cache**

In `src/data/cache.ts` `withCache()`, after `tasks: new CachedCollection(store.tasks),`:

```ts
    taskCompletions: new CachedCollection(store.taskCompletions),
```

- [ ] **Step 7: Empty it in the live suite's reset**

In `src/data/supabase/supabaseStore.test.ts` `clear()`, add `store.taskCompletions` to the first loop's list, after `store.addresses`. It has no foreign key to tasks, so its place in the list does not matter.

- [ ] **Step 8: Run the contract on both local runners and the type check**

Run: `npx vitest run src/data/local/localStore.test.ts src/data/cache.test.ts`
Expected: PASS, including the three new cases in both suites.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/data/types.ts src/data/local/localStore.ts src/data/supabase/supabaseStore.ts src/data/cache.ts src/data/supabase/supabaseStore.test.ts src/data/collection.contract.ts
git commit -m "Data: a taskCompletions collection in every backend; tasks keep doneAt and completionId

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Return dates from when a repeat was done

**Files:**
- Modify: `src/features/board/recurrence.ts` (new `doneAtOf()`, `returnDate()`; `isDueAgain()` rewritten; `reviveColumn()` removed)
- Test: `src/features/board/recurrence.test.ts`

**Interfaces:**
- Consumes: `Task.doneAt` (Task 1).
- Produces:
  - `doneAtOf(task: Task): Date`: when it was ticked, falling back to `updatedAt` for a done task without `doneAt`;
  - `returnDate(task: Task): string | undefined`: the YYYY-MM-DD a done repeat comes back, else undefined;
  - `isDueAgain(task: Task, now: Date): boolean`: same name, new rule;
  - `reviveColumn` no longer exists.

- [ ] **Step 1: Write the failing tests**

In `src/features/board/recurrence.test.ts`:
- remove `reviveColumn` from the import and add `doneAtOf, returnDate`;
- delete the `column()` helper, the `BoardColumn` type import, and the whole `describe('reviveColumn', ...)` block;
- replace the whole `describe('isDueAgain', ...)` block with:

```ts
/** Local time, as an ISO timestamp: the tick happened on that local day. */
const at = (year: number, month: number, day: number, hour = 12): string => new Date(year, month - 1, day, hour).toISOString();

describe('doneAtOf', () => {
  it('is doneAt', () => {
    expect(doneAtOf(task({ done: true, doneAt: at(2026, 9, 20) })).toISOString()).toBe(at(2026, 9, 20));
  });

  it('falls back to updatedAt for a task ticked before doneAt existed', () => {
    expect(doneAtOf(task({ done: true, updatedAt: '2026-09-03T10:00:00.000Z' })).toISOString()).toBe('2026-09-03T10:00:00.000Z');
  });
});

describe('returnDate', () => {
  const weekly = { recurEveryDays: 7, recurFrom: '2026-09-01' };

  it('is the next round after the one it covered, done on time', () => {
    expect(returnDate(task({ ...weekly, done: true, dueDate: '2026-09-15', doneAt: at(2026, 9, 15) }))).toBe('2026-09-22');
  });

  it('skips only the covered round when done early', () => {
    expect(returnDate(task({ ...weekly, done: true, dueDate: '2026-09-15', doneAt: at(2026, 9, 13) }))).toBe('2026-09-22');
  });

  it('skips missed rounds when done late, so it does not come straight back overdue', () => {
    expect(returnDate(task({ ...weekly, done: true, dueDate: '2026-09-01', doneAt: at(2026, 9, 17) }))).toBe('2026-09-22');
  });

  it('keeps a monthly chore on the 31st through a short month', () => {
    const monthly = { recurEveryMonths: 1, recurFrom: '2026-01-31' };
    expect(returnDate(task({ ...monthly, done: true, dueDate: '2026-10-31', doneAt: at(2026, 10, 31) }))).toBe('2026-11-30');
    expect(returnDate(task({ ...monthly, done: true, dueDate: '2026-11-30', doneAt: at(2026, 11, 30) }))).toBe('2026-12-31');
  });

  it('counts from the day it was done when the repeat has no due date', () => {
    expect(returnDate(task({ recurEveryDays: 7, done: true, doneAt: at(2026, 9, 10) }))).toBe('2026-09-17');
  });

  it('returns a repeat the migration moved back a day on the date it showed before', () => {
    // Before the change: done on 23 Sep, due date already moved on to the 29th.
    // The migration made it the 28th.
    expect(returnDate(task({ ...weekly, done: true, dueDate: '2026-09-28', doneAt: at(2026, 9, 23) }))).toBe('2026-09-29');
    const monthly = { recurEveryMonths: 1, recurFrom: '2026-01-31' };
    expect(returnDate(task({ ...monthly, done: true, dueDate: '2026-11-29', doneAt: at(2026, 10, 31) }))).toBe('2026-11-30');
  });

  it('is undefined for an open task or a one-off', () => {
    expect(returnDate(task({ ...weekly, done: false, dueDate: '2026-09-15' }))).toBeUndefined();
    expect(returnDate(task({ done: true, dueDate: '2026-09-15', doneAt: at(2026, 9, 15) }))).toBeUndefined();
  });
});

describe('isDueAgain', () => {
  const weekly = { recurEveryDays: 7, recurFrom: '2026-09-01', dueDate: '2026-09-15' };

  it('is true on the return date', () => {
    expect(isDueAgain(task({ ...weekly, done: true, doneAt: at(2026, 9, 15) }), NOW)).toBe(true);
  });

  it('is true after the return date', () => {
    expect(isDueAgain(task({ ...weekly, done: true, doneAt: at(2026, 9, 15) }), new Date(2026, 8, 25))).toBe(true);
  });

  it('is false before the return date', () => {
    expect(isDueAgain(task({ ...weekly, done: true, doneAt: at(2026, 9, 15) }), new Date(2026, 8, 21, 23, 59))).toBe(false);
  });

  it('is false while the task is still outstanding', () => {
    expect(isDueAgain(task({ ...weekly, done: false }), NOW)).toBe(false);
  });

  it('is false for a one-off task, however old', () => {
    expect(isDueAgain(task({ done: true, dueDate: '2020-01-01', doneAt: at(2020, 1, 1) }), NOW)).toBe(false);
  });
});
```

(`NOW` in this file is 22 September 2026, local.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/board/recurrence.test.ts`
Expected: FAIL: `doneAtOf` and `returnDate` are not exported.

- [ ] **Step 3: Implement**

In `src/features/board/recurrence.ts`:

Replace the top comment's second paragraph ("A recurring task is one row... twice.") with:

```ts
 * A recurring task is one row that comes back round, not a new row each time.
 * Ticking it leaves its due date alone (the round it covered) and records
 * doneAt; its return date is worked out from the two, and when that date
 * arrives the same task is unticked with the new due date (reviveRecurring()
 * in actions.ts). Nothing is ever duplicated, so there is no way for two
 * clients to spawn the same chore twice.
```

Change the import to `import type { Task } from '../../domain/types';`.

Replace `isDueAgain()` and delete `reviveColumn()`; add after `nextOccurrence()`:

```ts
/**
 * When a done task was ticked. A task ticked before doneAt existed falls back
 * to its last change, which the migration also used.
 */
export function doneAtOf(task: Task): Date {
  return new Date(task.doneAt ?? task.updatedAt);
}

/**
 * The day a done repeating task comes back: the next date on its schedule
 * after both the round it covered and the day it was done. Undefined for an
 * open task or a one-off.
 */
export function returnDate(task: Task): string | undefined {
  if (!task.done) return undefined;
  return nextOccurrence(task, doneAtOf(task))?.dueDate;
}

/** Done, recurring, and its return date has come round. These are the tasks to bring back. */
export function isDueAgain(task: Task, now: Date): boolean {
  const date = returnDate(task);
  return date !== undefined && date <= toIsoDate(now);
}
```

Keep `nextOccurrence()` as it is; its doc comment still holds, with "today" now meaning the day it was done.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/board/recurrence.test.ts`
Expected: PASS.

`npx tsc --noEmit` now fails in `actions.ts` (it imports `reviveColumn`). Task 4 fixes that; commit anyway, since the branch is not merged until Task 9.

- [ ] **Step 5: Commit**

```bash
git add src/features/board/recurrence.ts src/features/board/recurrence.test.ts
git commit -m "Board: a done repeat keeps the round it covered and comes back on a date worked out from doneAt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tick, untick, clear, auto-clear, revive and restore

**Files:**
- Modify: `src/features/board/actions.ts`
- Test: `src/features/board/actions.test.ts` (new)

**Interfaces:**
- Consumes: `DataStore.taskCompletions` (Task 2); `doneAtOf()`, `isDueAgain()`, `nextOccurrence()`, `repeats()` (Task 3).
- Produces (all exported from `actions.ts`):

```ts
export const CLEAR_AFTER_DAYS = 7;
export async function completeTask(store: DataStore, task: Task, memberId: string, now?: Date): Promise<void>;
export async function reopenTask(store: DataStore, task: Task): Promise<void>;
export async function clearDone(store: DataStore, tasks: readonly Task[]): Promise<void>;
export async function autoClear(store: DataStore, tasks: readonly Task[], now?: Date): Promise<number>;
export async function reviveRecurring(store: DataStore, tasks: readonly Task[], now?: Date): Promise<number>;
export interface RestoreContext {
  tasks: readonly Task[];
  /** Sorted by position. */
  columns: readonly BoardColumn[];
  entries: readonly TaskCompletion[];
  memberId: string;
}
export async function restoreTask(store: DataStore, entry: TaskCompletion, context: RestoreContext): Promise<{ taskId: string; column: BoardColumn } | null>;
export async function placeTask(store: DataStore, task: Task, column: BoardColumn, position: number): Promise<void>;
```

`endPosition()`, `moveColumn()` and `Direction` stay as they are.

- [ ] **Step 1: Write the failing tests**

Create `src/features/board/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalStore } from '../../data/local/localStore';
import type { DataStore } from '../../data/types';
import type { BoardColumn, NewRow, Task } from '../../domain/types';
import {
  CLEAR_AFTER_DAYS,
  autoClear,
  clearDone,
  completeTask,
  placeTask,
  reopenTask,
  restoreTask,
  reviveRecurring,
} from './actions';

const NOW = new Date(2026, 9, 10, 12); // 10 October 2026, noon local.
const DAY = 24 * 60 * 60 * 1000;

let store: DataStore;
let house: BoardColumn;
let errands: BoardColumn;

const addTask = (row: Partial<NewRow<Task>> = {}): Promise<Task> =>
  store.tasks.create({ title: 'Bins', columnId: house.id, position: 1000, done: false, ...row });

const reread = async (id: string): Promise<Task | undefined> => (await store.tasks.list()).find((row) => row.id === id);

beforeEach(async () => {
  localStorage.clear();
  store = createLocalStore('f-test');
  house = await store.columns.create({ name: 'House', position: 1000, isDone: false });
  errands = await store.columns.create({ name: 'Errands', position: 2000, isDone: false });
});

describe('completeTask', () => {
  it('ticks the task and writes a history entry copied from it', async () => {
    const task = await addTask({ icon: '🗑️', description: 'Green bin too', assigneeId: 'm-sam' });

    await completeTask(store, task, 'm-dana', NOW);

    const [entry] = await store.taskCompletions.list();
    expect(entry).toMatchObject({
      taskId: task.id,
      title: 'Bins',
      icon: '🗑️',
      description: 'Green bin too',
      columnId: house.id,
      assigneeId: 'm-sam',
      memberId: 'm-dana',
    });
    expect(await reread(task.id)).toMatchObject({ done: true, doneAt: NOW.toISOString(), completionId: entry?.id });
  });

  it('leaves a repeat\'s due date on the round it covered', async () => {
    const task = await addTask({ recurEveryDays: 7, recurFrom: '2026-10-03', dueDate: '2026-10-10' });

    await completeTask(store, task, 'm-dana', NOW);

    expect((await reread(task.id))?.dueDate).toBe('2026-10-10');
  });
});

describe('reopenTask', () => {
  it('unticks the task and removes only the entry that tick made', async () => {
    const task = await addTask();
    await completeTask(store, task, 'm-dana', new Date(2026, 9, 1));
    await reopenTask(store, (await reread(task.id))!);
    await completeTask(store, (await reread(task.id))!, 'm-dana', NOW);
    const older = await store.taskCompletions.create({ taskId: task.id, title: 'Bins' });

    await reopenTask(store, (await reread(task.id))!);

    const after = await reread(task.id);
    expect(after?.done).toBe(false);
    expect(after?.doneAt).toBeUndefined();
    expect(after?.completionId).toBeUndefined();
    expect((await store.taskCompletions.list()).map((row) => row.id)).toEqual([older.id]);
  });
});

describe('clearDone', () => {
  it('deletes done one-offs, keeps repeats and open tasks, and keeps the history', async () => {
    const parcel = await addTask({ title: 'Parcel' });
    const bins = await addTask({ title: 'Bins', recurEveryDays: 7, dueDate: '2026-10-10' });
    const open = await addTask({ title: 'Mop' });
    await completeTask(store, parcel, 'm-dana', NOW);
    await completeTask(store, bins, 'm-dana', NOW);
    const tasks = await store.tasks.list();

    await clearDone(store, tasks);

    expect((await store.tasks.list()).map((row) => row.title).sort()).toEqual(['Bins', 'Mop']);
    expect((await store.taskCompletions.list()).map((row) => row.title).sort()).toEqual(['Bins', 'Parcel']);
    expect((await reread(open.id))?.done).toBe(false);
  });
});

describe('autoClear', () => {
  it(`deletes done one-offs ticked more than ${CLEAR_AFTER_DAYS} days ago, and no others`, async () => {
    const old = await addTask({ title: 'Old', done: true, doneAt: new Date(NOW.getTime() - CLEAR_AFTER_DAYS * DAY - 60_000).toISOString() });
    await addTask({ title: 'Recent', done: true, doneAt: new Date(NOW.getTime() - CLEAR_AFTER_DAYS * DAY + 60_000).toISOString() });
    await addTask({ title: 'Repeat', done: true, recurEveryDays: 30, dueDate: '2026-09-01', doneAt: '2026-09-01T12:00:00.000Z' });
    await addTask({ title: 'Open' });

    const cleared = await autoClear(store, await store.tasks.list(), NOW);

    expect(cleared).toBe(1);
    expect((await store.tasks.list()).map((row) => row.title).sort()).toEqual(['Open', 'Recent', 'Repeat']);
    expect(await reread(old.id)).toBeUndefined();
  });
});

describe('reviveRecurring', () => {
  it('unticks a done repeat in its own column, with its next due date, once its return date arrives', async () => {
    const task = await addTask({
      columnId: errands.id,
      recurEveryDays: 7,
      recurFrom: '2026-09-26',
      dueDate: '2026-10-03',
      done: true,
      doneAt: new Date(2026, 9, 3, 9).toISOString(),
      completionId: 'entry-1',
    });

    expect(await reviveRecurring(store, await store.tasks.list(), NOW)).toBe(1);

    expect(await reread(task.id)).toMatchObject({ done: false, columnId: errands.id, dueDate: '2026-10-10', recurFrom: '2026-09-26' });
    expect((await reread(task.id))?.doneAt).toBeUndefined();
    expect((await reread(task.id))?.completionId).toBeUndefined();
  });

  it('leaves a repeat whose return date has not arrived', async () => {
    await addTask({ recurEveryDays: 7, recurFrom: '2026-10-10', dueDate: '2026-10-10', done: true, doneAt: NOW.toISOString() });

    expect(await reviveRecurring(store, await store.tasks.list(), NOW)).toBe(0);
  });
});

describe('restoreTask', () => {
  it('unticks a task still on the board and keeps every entry', async () => {
    const task = await addTask();
    await completeTask(store, task, 'm-dana', NOW);
    const [entry] = await store.taskCompletions.list();

    const result = await restoreTask(store, entry!, {
      tasks: await store.tasks.list(),
      columns: [house, errands],
      entries: await store.taskCompletions.list(),
      memberId: 'm-sam',
    });

    expect(result).toEqual({ taskId: task.id, column: house });
    expect(await reread(task.id)).toMatchObject({ done: false });
    expect((await reread(task.id))?.completionId).toBeUndefined();
    expect(await store.taskCompletions.list()).toHaveLength(1);
  });

  it('does nothing for a task that is already open', async () => {
    const task = await addTask();
    const entry = await store.taskCompletions.create({ taskId: task.id, title: 'Bins', columnId: house.id });

    const result = await restoreTask(store, entry, { tasks: [task], columns: [house, errands], entries: [entry], memberId: 'm-sam' });

    expect(result).toEqual({ taskId: task.id, column: house });
    expect(await store.tasks.list()).toHaveLength(1);
  });

  it('re-creates a cleared task at the end of its column and points all its entries at it', async () => {
    await addTask({ title: 'Mop', position: 5000 });
    const gone = await store.taskCompletions.create({
      taskId: 'cleared-task', title: 'Parcel', icon: '📦', description: 'Blue box', columnId: house.id, assigneeId: 'm-sam', memberId: 'm-dana',
    });
    const earlier = await store.taskCompletions.create({ taskId: 'cleared-task', title: 'Parcel', columnId: house.id });
    const other = await store.taskCompletions.create({ taskId: 'another', title: 'Bins', columnId: house.id });

    const result = await restoreTask(store, gone, {
      tasks: await store.tasks.list(),
      columns: [house, errands],
      entries: await store.taskCompletions.list(),
      memberId: 'm-dana',
    });

    const created = (await store.tasks.list()).find((row) => row.title === 'Parcel');
    expect(created).toMatchObject({
      icon: '📦', description: 'Blue box', columnId: house.id, assigneeId: 'm-sam', done: false, createdBy: 'm-dana',
    });
    expect(created!.position).toBeGreaterThan(5000);
    expect(result).toEqual({ taskId: created!.id, column: house });
    const byId = new Map((await store.taskCompletions.list()).map((row) => [row.id, row.taskId]));
    expect(byId.get(gone.id)).toBe(created!.id);
    expect(byId.get(earlier.id)).toBe(created!.id);
    expect(byId.get(other.id)).toBe('another');
  });

  it('uses the first column when the task\'s column is gone, and refuses with no columns at all', async () => {
    const entry = await store.taskCompletions.create({ taskId: 'cleared-task', title: 'Parcel', columnId: 'deleted-column' });

    const result = await restoreTask(store, entry, { tasks: [], columns: [errands, house], entries: [entry], memberId: 'm-dana' });
    expect(result?.column.id).toBe(errands.id);

    expect(await restoreTask(store, entry, { tasks: [], columns: [], entries: [entry], memberId: 'm-dana' })).toBeNull();
  });
});

describe('placeTask', () => {
  it('moves a task and its position, leaving done alone', async () => {
    const task = await addTask({ done: true, doneAt: NOW.toISOString() });

    await placeTask(store, task, errands, 500);

    expect(await reread(task.id)).toMatchObject({ columnId: errands.id, position: 500, done: true });
  });
});
```

(The `isDone: false` on the two columns goes when Task 5 removes the field from the type.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/board/actions.test.ts`
Expected: FAIL: `completeTask`, `reopenTask` and the others are not exported, and `actions.ts` does not compile against Task 3's `recurrence.ts`.

- [ ] **Step 3: Implement**

In `src/features/board/actions.ts`, replace the imports and everything from `export async function placeTask` down to the end of `reviveRecurring()` with the code below. `endPosition()` stays above it, and `positionPastNeighbour()` and `moveColumn()` stay below.

```ts
import type { DataStore } from '../../data/types';
import { comparePosition, positionBetween } from '../../domain/position';
import type { BoardColumn, NewRow, Task, TaskCompletion } from '../../domain/types';
import { doneAtOf, isDueAgain, nextOccurrence, repeats } from './recurrence';
```

```ts
/** Done one-off tasks leave the board this long after they were ticked. */
export const CLEAR_AFTER_DAYS = 7;

/** Put a task at a position in a column, its own or another. Dragging a card comes through here. */
export async function placeTask(store: DataStore, task: Task, column: BoardColumn, position: number): Promise<void> {
  const patch: Partial<NewRow<Task>> = { position };
  if (task.columnId !== column.id) patch.columnId = column.id;
  await store.tasks.update(task.id, patch);
}

/**
 * The tick. Writes the history entry first, so the task can point at the one
 * an untick should remove. Two writes, no transaction: if the second fails the
 * entry stays without a task pointing at it, which History shows as done.
 */
export async function completeTask(store: DataStore, task: Task, memberId: string, now: Date = new Date()): Promise<void> {
  const entry = await store.taskCompletions.create({
    taskId: task.id,
    title: task.title,
    icon: task.icon,
    description: task.description,
    columnId: task.columnId,
    assigneeId: task.assigneeId,
    memberId,
  });
  await store.tasks.update(task.id, { done: true, doneAt: now.toISOString(), completionId: entry.id });
}

/** An untick: the tick was a mistake, so its history entry goes too. The due date is untouched. */
export async function reopenTask(store: DataStore, task: Task): Promise<void> {
  await store.tasks.update(task.id, { done: false, doneAt: undefined, completionId: undefined });
  if (task.completionId !== undefined) await store.taskCompletions.remove(task.completionId);
}

/** Done one-offs, which Clear and auto-clear may delete. Repeats come back on their own. */
function clearable(task: Task): boolean {
  return task.done && !repeats(task);
}

/** The Clear button: deletes these tasks' done one-offs. Their history stays. */
export async function clearDone(store: DataStore, tasks: readonly Task[]): Promise<void> {
  for (const task of tasks.filter(clearable)) await store.tasks.remove(task.id);
}

/**
 * Deletes done one-offs ticked more than CLEAR_AFTER_DAYS ago. Runs when the
 * board opens, like reviveRecurring(); two devices doing it at once both
 * remove the same rows, which is harmless.
 */
export async function autoClear(store: DataStore, tasks: readonly Task[], now: Date = new Date()): Promise<number> {
  const before = now.getTime() - CLEAR_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const stale = tasks.filter((task) => clearable(task) && doneAtOf(task).getTime() < before);
  for (const task of stale) await store.tasks.remove(task.id);
  return stale.length;
}

/**
 * Brings back repeating tasks whose return date has arrived: the same row,
 * unticked in its own column, due on the next round.
 *
 * There is no server, so this runs when somebody opens the app. A chore due on
 * Monday appears when the app is next opened, which for a chores board is fine.
 * Running it twice is harmless: the second pass finds nothing done to revive.
 */
export async function reviveRecurring(store: DataStore, tasks: readonly Task[], now: Date = new Date()): Promise<number> {
  const due = tasks.filter((task) => isDueAgain(task, now));
  for (const task of due) {
    const next = nextOccurrence(task, doneAtOf(task));
    await store.tasks.update(task.id, {
      done: false,
      doneAt: undefined,
      completionId: undefined,
      dueDate: next?.dueDate,
      recurFrom: next?.recurFrom,
    });
  }
  return due.length;
}

export interface RestoreContext {
  tasks: readonly Task[];
  /** Sorted by position: a task whose column is gone goes to the first. */
  columns: readonly BoardColumn[];
  entries: readonly TaskCompletion[];
  /** Who is restoring it, as the re-created task's createdBy. */
  memberId: string;
}

/**
 * History's Restore: "do it again". The entry stays either way.
 *
 * A task still on the board is unticked (or left alone if already open). A
 * cleared one is created again from the entry's copies, at the end of its
 * column, and every entry of the old task is pointed at the new one, so
 * History shows it as on the board and a second press cannot duplicate it.
 * Null when the family has no columns to put it in.
 */
export async function restoreTask(
  store: DataStore,
  entry: TaskCompletion,
  { tasks, columns, entries, memberId }: RestoreContext,
): Promise<{ taskId: string; column: BoardColumn } | null> {
  const existing = tasks.find((task) => task.id === entry.taskId);
  if (existing !== undefined) {
    const column = columns.find((row) => row.id === existing.columnId) ?? columns[0];
    if (column === undefined) return null;
    if (existing.done) {
      await store.tasks.update(existing.id, { done: false, doneAt: undefined, completionId: undefined });
    }
    return { taskId: existing.id, column };
  }

  const column = columns.find((row) => row.id === entry.columnId) ?? columns[0];
  if (column === undefined) return null;
  const inColumn = tasks.filter((task) => task.columnId === column.id).sort(comparePosition);
  const created = await store.tasks.create({
    title: entry.title,
    icon: entry.icon,
    description: entry.description,
    assigneeId: entry.assigneeId,
    columnId: column.id,
    position: endPosition(inColumn),
    done: false,
    createdBy: memberId,
  });
  for (const row of entries.filter((candidate) => candidate.taskId === entry.taskId)) {
    await store.taskCompletions.update(row.id, { taskId: created.id });
  }
  return { taskId: created.id, column };
}
```

`POSITION_STEP` is no longer used here (revived tasks stay in place), so the import above drops it.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/board/actions.test.ts src/features/board/recurrence.test.ts`
Expected: PASS.

`npx tsc --noEmit` still fails in `Board.tsx` (old `reviveRecurring` and `placeTask` signatures). Task 5 fixes that.

- [ ] **Step 5: Commit**

```bash
git add src/features/board/actions.ts src/features/board/actions.test.ts
git commit -m "Board: tick, untick, clear, auto-clear, revive in place and restore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Columns lose `isDone`; the board runs revive and auto-clear

**Files:**
- Modify: `src/domain/types.ts` (`BoardColumn`)
- Modify: `supabase/schema.sql` (`board_columns.is_done` goes)
- Create: `supabase/migrations/20261010130000_drop_column_is_done.sql`
- Modify: `src/features/board/defaultColumns.ts`
- Modify: `src/features/board/Board.tsx`
- Modify: `src/features/board/TaskComposer.tsx:46`
- Modify: `src/data/collection.contract.ts:68`, `src/data/supabase/supabaseRealtime.test.ts:51`, `scripts/perf/fixtures.ts:32-36` and `:59`
- Modify: `src/features/board/actions.test.ts` (drop `isDone` from the two columns)

**Interfaces:**
- Consumes: `reviveRecurring(store, tasks, now?)`, `autoClear(store, tasks, now?)`, `placeTask(store, task, column, position)` (Task 4).
- Produces: `BoardColumn` without `isDone`; `seedDefaultColumns()` creates one column, "To do".

- [ ] **Step 1: Remove the field and let the compiler list every use**

In `src/domain/types.ts`, delete from `BoardColumn`:

```ts
  /**
   * Tasks in this column count as complete. Kept in sync with Task.done by
   * placeTask(), which is the only thing that writes either field on a move.
   */
  isDone: boolean;
```

Run: `npx tsc --noEmit`
Expected: errors in exactly `defaultColumns.ts`, `Board.tsx` (`isDone` twice, `reviveRecurring` arguments), `TaskComposer.tsx`, `collection.contract.ts`, `supabaseRealtime.test.ts`, `actions.test.ts` and `scripts/perf/fixtures.ts` (if it is in the `tsc` project; otherwise fix it anyway). Fix each one in Steps 2–5.

- [ ] **Step 2: Seed one column**

Replace `src/features/board/defaultColumns.ts`'s list and keep the function:

```ts
/**
 * A family starts with somewhere to put things. Seeded only when there are no
 * columns at all: matching on name would re-create a column somebody renamed,
 * and a family that deliberately deleted the lot can have one back. Done is a
 * tick on the card, not a column, so one column is enough to start.
 */

const DEFAULT_COLUMNS: ReadonlyArray<{ name: string }> = [{ name: 'To do' }];
```

- [ ] **Step 3: The board**

In `src/features/board/Board.tsx`:

1. Import: `import { autoClear, endPosition, placeTask, reviveRecurring } from './actions';`
2. Delete the "Done columns start folded" block: the comment, the `defaulted` ref and its `useEffect`.
3. Replace the reviving block (comment, `reviving` ref and effect) with:

```ts
  // Repeating tasks whose return date has come round are unticked, and done
  // one-offs over a week old are cleared, when the app is opened: there is no
  // server to do either while nobody is looking. The ref stops a second pass
  // running while the first one's writes are still landing.
  const tidying = useRef(false);
  useEffect(() => {
    if (tidying.current || tasks.length === 0) return;
    tidying.current = true;
    void Promise.all([reviveRecurring(store, tasks), autoClear(store, tasks)]).finally(() => {
      tidying.current = false;
    });
  }, [store, tasks]);
```

4. In `addColumn()`, delete `isDone: false,`.

- [ ] **Step 4: New tasks start open**

In `src/features/board/TaskComposer.tsx`, replace `done: column.isDone,` with `done: false,`.

- [ ] **Step 5: Tests, fixtures and the realtime test**

- `src/data/collection.contract.ts`: `from.columns.create({ name: 'To do', position: 1000 })`.
- `src/data/supabase/supabaseRealtime.test.ts`: delete `isDone: false,` from the column it creates.
- `src/features/board/actions.test.ts`: delete `, isDone: false` from both `store.columns.create` calls.
- `scripts/perf/fixtures.ts`: replace `COLUMNS` with

```ts
export const COLUMNS: NewRow<BoardColumn>[] = [
  { name: 'To do', position: 1000 },
  { name: 'House', position: 2000 },
  { name: 'Errands', position: 3000 },
];
```

and in `taskRows()` replace `done: column.isDone,` with `done: i % 3 === 2,` followed, after the `row` literal, by

```ts
    // A third of the board is ticked, as a family's would be by the evening.
    if (row.done) row.doneAt = `2026-10-${String((i % 7) + 1).padStart(2, '0')}T18:00:00.000Z`;
```

- [ ] **Step 6: The schema's end state and the second migration**

In `supabase/schema.sql` `create table board_columns`, delete

```sql
  -- Tasks in this column count as complete; mirrored onto tasks.done.
  is_done     boolean     not null default false,
```

Create `supabase/migrations/20261010130000_drop_column_is_done.sql`:

```sql
-- Board: columns no longer mark tasks done; the tick on the card does
-- (20261010120000_board_done_tasks.sql).
--
-- Apply this only AFTER the code that stopped writing is_done is deployed:
-- the app before it sends is_done when someone adds a column, and that insert
-- fails once the column is gone.
--
-- schema.sql already has this change, so a fresh project needs only that file.

alter table board_columns drop column is_done;
```

- [ ] **Step 7: Run the type check and every test that does not need the network**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: PASS. The live Supabase suites skip without `.env.test`. If `src/i18n/literals.test.ts` flags `defaultColumns.ts`, it is already in that test's `SKIP` list, so look again at what changed.

- [ ] **Step 8: Check the board in the demo**

Start the demo dev server with the Browser pane's `preview_start` and the `dev-local` configuration (see the `preview-servers` memory). Open `/`, add a column, add a task, and drag it between columns. Expected: no console errors; the card moves and stays open.

- [ ] **Step 9: Commit**

```bash
git add src/domain/types.ts supabase/schema.sql supabase/migrations/20261010130000_drop_column_is_done.sql src/features/board/defaultColumns.ts src/features/board/Board.tsx src/features/board/TaskComposer.tsx src/data/collection.contract.ts src/data/supabase/supabaseRealtime.test.ts src/features/board/actions.test.ts scripts/perf/fixtures.ts
git commit -m "Board: columns no longer mark tasks done; revive and auto-clear run on load; new families start with To do

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The tick on the card

**Files:**
- Modify: `src/features/board/TaskCard.tsx`
- Modify: `src/features/board/board.css` (new `.card-tick*` rules, after `.card-icon`)
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/he.json` (`board.card.done`)
- Test: `src/features/board/Board.test.tsx` (new; Task 7 adds to it)

**Interfaces:**
- Consumes: `completeTask(store, task, memberId)`, `reopenTask(store, task)` (Task 4); `returnDate(task)` (Task 3).
- Produces: a `TaskCard` whose head is `[tick] [toggle] [assignee]`. Done cards carry no `data-task-id`, so they are never drop targets, and they start no drag. `TaskCard` takes an optional `highlight?: boolean` prop, used by Task 8.

- [ ] **Step 1: Write the failing test**

Create `src/features/board/Board.test.tsx`:

```tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionContext } from '../../auth/session';
import type { Session } from '../../auth/session';
import { createLocalStore } from '../../data/local/localStore';
import type { DataStore } from '../../data/types';
import type { BoardColumn, Member, NewRow, Task } from '../../domain/types';
import { LocaleProvider, i18n } from '../../i18n';
import { Board } from './Board';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dana: Member = { id: 'm-dana', familyId: 'f-test', name: 'Dana', color: '#1d9e75', createdAt: '', updatedAt: '' };

let store: DataStore;
let house: BoardColumn;
let unmount: (() => void) | null = null;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(): Promise<HTMLElement> {
  const session: Session = { store, me: dana, members: [dana], signOut: async () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <SessionContext.Provider value={session}>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Board />
          </MemoryRouter>
        </SessionContext.Provider>
      </LocaleProvider>,
    );
  });
  await flush();
  await flush();
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

async function click(element: Element | null | undefined): Promise<void> {
  expect(element).toBeTruthy();
  await act(async () => {
    (element as HTMLElement).click();
  });
  await flush();
  await flush();
}

const addTask = (row: Partial<NewRow<Task>> = {}): Promise<Task> =>
  store.tasks.create({ title: 'Bins', icon: '🗑️', columnId: house.id, position: 1000, done: false, ...row });

const tick = (host: ParentNode, title: string): HTMLButtonElement | null =>
  host.querySelector(`button[role="checkbox"][aria-label="${i18n.t('board.card.done', { title })}"]`);

beforeAll(() => {
  window.matchMedia ??= (query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList;
});

beforeEach(async () => {
  localStorage.clear();
  store = createLocalStore('f-test');
  house = await store.columns.create({ name: 'House', position: 1000 });
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('the tick', () => {
  it('is a checkbox named after the task, and ticking writes the task and its history', async () => {
    await addTask();
    const host = await render();

    const box = tick(host, 'Bins');
    expect(box?.getAttribute('aria-checked')).toBe('false');
    await click(box);

    const [task] = await store.tasks.list();
    expect(task?.done).toBe(true);
    expect(task?.doneAt).toBeDefined();
    const [entry] = await store.taskCompletions.list();
    expect(entry).toMatchObject({ taskId: task?.id, title: 'Bins', memberId: 'm-dana' });
    expect(tick(host, 'Bins')?.getAttribute('aria-checked')).toBe('true');
  });

  it('unticking removes the entry the tick made', async () => {
    await addTask();
    const host = await render();
    await click(tick(host, 'Bins'));

    await click(tick(host, 'Bins'));

    expect((await store.tasks.list())[0]?.done).toBe(false);
    expect(await store.taskCompletions.list()).toEqual([]);
  });

  it('shows a plain tick for a task with no emoji', async () => {
    await addTask({ icon: undefined });
    const host = await render();

    expect(tick(host, 'Bins')?.querySelector('.card-tick-plain')).not.toBeNull();
    expect(tick(host, 'Bins')?.querySelector('.card-tick-badge')).toBeNull();
  });

  it('leaves done cards out of the drag targets', async () => {
    await addTask({ title: 'Open' });
    await addTask({ title: 'Done', done: true, doneAt: new Date().toISOString() });
    const host = await render();

    expect([...host.querySelectorAll('[data-task-id]')].map((node) => node.textContent)).toEqual([expect.stringContaining('Open')]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/features/board/Board.test.tsx`
Expected: FAIL: no `button[role="checkbox"]`.

- [ ] **Step 3: Add the string**

`src/i18n/locales/en.json`, in `board.card` after `"deleteQuestion"`:

```json
      "deleteQuestion": "Delete this task?",
      "done": "Done: {{title}}"
```

`src/i18n/locales/he.json`, same place:

```json
      "deleteQuestion": "למחוק את המשימה?",
      "done": "בוצע: {{title}}"
```

- [ ] **Step 4: The card**

In `src/features/board/TaskCard.tsx`:

1. Imports: add `import { Check } from 'lucide-react';`, `import { completeTask, reopenTask } from './actions';`, and `returnDate` to the import from `./recurrence`.
2. Signature: `({ task, today, dragging, highlight = false }: { task: Task; today: string; dragging: boolean; highlight?: boolean })`, and `const { store, members, me } = useSession();`.
3. Replace the `<li ...>` opening tag with:

```tsx
    <li
      className={`card ${task.done ? 'card-done' : ''} ${dragging ? 'card-dragging' : ''} ${highlight ? 'card-highlight' : ''}`}
      // Only open cards are drop targets, so a drop never lands among the Done fold.
      data-task-id={task.done ? undefined : task.id}
    >
```

4. Inside `<div className="card-head">`, before the toggle button, add:

```tsx
        {/* The tick: the emoji with a small circle in its corner. Outside the
            toggle, since a control can't sit in a button, and it never starts
            a drag. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={task.done}
          aria-label={t('board.card.done', { title: task.title })}
          className={`card-tick ${task.done ? 'card-tick-on' : ''}`}
          onClick={() => void (task.done ? reopenTask(store, task) : completeTask(store, task, me.id))}
        >
          {task.icon !== undefined && (
            <span className="card-icon" aria-hidden="true">
              {task.icon}
            </span>
          )}
          <span className={task.icon !== undefined ? 'card-tick-badge' : 'card-tick-plain'} aria-hidden="true">
            {task.done && <Check size={10} strokeWidth={3.5} />}
          </span>
        </button>
```

5. In the toggle: `onPointerDown={(event) => { if (!task.done) startDrag(event, task); }}`, and delete its `<span className="card-icon">` child.
6. In the title, after the `card-date` span, add the return date of a done repeat:

```tsx
            {task.done && returnDate(task) !== undefined && (
              <span className="card-date">
                {t('board.card.comesBack', { date: formatDate(returnDate(task) as string, { weekday: 'short', day: 'numeric', month: 'short' }) })}
              </span>
            )}
```

7. In the open card's options, change the "Comes back" paragraph to use the return date:

```tsx
          {task.done && returnDate(task) !== undefined && (
            <p className="card-due">{t('board.card.comesBack', { date: formatDate(returnDate(task) as string) })}</p>
          )}
```

8. Update the comment above `TaskCard`: "Moving a task, within its column or to another, is done by dragging it; finishing it, by the tick on its emoji."

- [ ] **Step 5: Styles**

In `src/features/board/board.css`, after the `.card-icon` rule:

```css
/* The tick: the card's emoji with a small circle in its corner, or a plain
   circle for a task with no emoji. A 2rem target around a 1rem emoji. */
.card-tick {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  min-height: 2rem;
  margin-inline-start: 0.2rem;
  padding: 0;
  border: 0;
  border-radius: 0.4rem;
  background: none;
  cursor: pointer;
}

.card-tick:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.card-tick-badge,
.card-tick-plain {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 1.5px solid var(--muted);
  border-radius: 999px;
  background: var(--card);
  color: var(--card);
}

.card-tick-badge {
  position: absolute;
  inset-block-end: 0.15rem;
  inset-inline-end: 0.1rem;
  width: 0.85rem;
  height: 0.85rem;
}

.card-tick-plain {
  width: 1.1rem;
  height: 1.1rem;
}

.card-tick:hover .card-tick-badge,
.card-tick:hover .card-tick-plain {
  border-color: var(--sage);
}

.card-tick-on .card-tick-badge,
.card-tick-on .card-tick-plain {
  border-color: var(--sage);
  background: var(--sage);
}

/* A card History just restored, until the board is left. */
.card-highlight {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
```

In `.card-toggle`, the padding stays `0.5rem`; with the emoji gone from it, set `padding-inline-start: 0.3rem;` so the title sits close to the tick.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/features/board/Board.test.tsx`
Expected: PASS, all four. Until Task 7 the done card still sits in the open list, but without `data-task-id`, so the drag-target test already holds.

Run: `npx vitest run src/i18n`
Expected: PASS (the key exists in both locales).

- [ ] **Step 7: Check it in the demo**

In the `dev-local` preview: tick a card and untick it; hover the corner circle with the mouse; tab to the tick and press Space. Take a screenshot of a column with one ticked and one open card, in light and dark (`resize_window` `colorScheme`).

- [ ] **Step 8: Commit**

```bash
git add src/features/board/TaskCard.tsx src/features/board/board.css src/i18n/locales/en.json src/i18n/locales/he.json src/features/board/Board.test.tsx
git commit -m "Board: tick a card on its emoji; done cards show when they come back and are not drop targets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Done fold and Clear

**Files:**
- Modify: `src/features/board/Column.tsx`
- Modify: `src/features/board/board.css` (`.done-fold`, `.done-toggle`)
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/he.json` (`board.done.*`; `board.column.emptyFirst` reworded)
- Test: `src/features/board/Board.test.tsx` (add a `describe`)

**Interfaces:**
- Consumes: `clearDone(store, tasks)` (Task 4); `repeats()`, `doneAtOf()` (Task 3); `TaskCard`'s `highlight` prop (Task 6).
- Produces: `Column` takes an optional `highlightId?: string` and passes `highlight={task.id === highlightId}` to each card. Task 8 sets it from `Board`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/board/Board.test.tsx`:

```tsx
/** Minutes ago, as an ISO timestamp: recent enough that the board's auto-clear leaves it alone. */
const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
const toggle = (host: ParentNode): HTMLButtonElement | undefined =>
  [...host.querySelectorAll<HTMLButtonElement>('button.done-toggle')][0];
const titles = (host: ParentNode, selector: string): string[] =>
  [...host.querySelectorAll(`${selector} .card-title`)].map((node) => node.textContent ?? '');
const buttonNamed = (host: ParentNode, name: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((node) => node.textContent === name);

describe('the Done fold', () => {
  it('is absent while nothing in the column is done', async () => {
    await addTask();
    const host = await render();

    expect(toggle(host)).toBeUndefined();
  });

  it('holds done cards, closed, counts them, and the header counts open cards only', async () => {
    await addTask({ title: 'Mop' });
    await addTask({ title: 'Parcel', done: true, doneAt: ago(90) });
    await addTask({ title: 'Bins', done: true, doneAt: ago(5) });
    const host = await render();

    expect(toggle(host)?.textContent).toBe(i18n.t('board.done.toggle', { count: 2 }));
    expect(toggle(host)?.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.column-count')?.textContent).toBe('1');
    expect(titles(host, '.done-fold')).toEqual([]);

    await click(toggle(host));

    expect(titles(host, '.done-fold')).toEqual(['Bins', 'Parcel']);
  });

  it('Clear asks first, then deletes the done one-offs and keeps the repeats and the history', async () => {
    const parcel = await addTask({ title: 'Parcel' });
    await addTask({ title: 'Bins', recurEveryDays: 7, dueDate: '2026-10-10' });
    const host = await render();
    await click(tick(host, 'Parcel'));
    await click(tick(host, 'Bins'));
    await click(toggle(host));

    await click(buttonNamed(host, i18n.t('board.done.clear')));
    expect(host.textContent).toContain(i18n.t('board.done.clearQuestion', { count: 1 }));
    expect(await store.tasks.list()).toHaveLength(2);

    await click(host.querySelector('.done-fold .danger-solid'));

    expect((await store.tasks.list()).map((row) => row.title)).toEqual(['Bins']);
    expect((await store.taskCompletions.list()).map((row) => row.taskId)).toContain(parcel.id);
  });

  it('applies the search to the fold too', async () => {
    await addTask({ title: 'Parcel', done: true, doneAt: ago(90) });
    await addTask({ title: 'Bins', done: true, doneAt: ago(5) });
    writePreference('f-test', 'boardFilter', { query: 'parc', assignee: '' });
    const host = await render();
    await click(toggle(host));

    expect(toggle(host)?.textContent).toBe(i18n.t('board.done.toggle', { count: 1 }));
    expect(titles(host, '.done-fold')).toEqual(['Parcel']);
  });
});
```

Add `writePreference` to the test file's import from `'../../data/local/localStore'`. Timestamps are relative to the clock because the board's auto-clear runs on load with the real date.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/board/Board.test.tsx`
Expected: FAIL: no `button.done-toggle`, and `board.done.toggle` is a missing key.

- [ ] **Step 3: Strings**

`en.json`: in `board.column`, set `"emptyFirst": "Move or clear its tasks first"`. Add a `board.done` object after `board.composer`:

```json
    "done": {
      "toggle": "Done ({{count, number}})",
      "clear": "Clear",
      "confirmClear": "Confirm clear",
      "clearQuestion_one": "Clear {{count, number}} done task? It stays in History.",
      "clearQuestion_other": "Clear {{count, number}} done tasks? They stay in History."
    },
```

`he.json`: `"emptyFirst": "קודם צריך להעביר או לנקות את המשימות שבה"`, and

```json
    "done": {
      "toggle": "בוצעו ({{count, number}})",
      "clear": "ניקוי",
      "confirmClear": "אישור ניקוי",
      "clearQuestion_one": "לנקות משימה אחת שבוצעה? היא תישאר בהיסטוריה.",
      "clearQuestion_two": "לנקות {{count, number}} משימות שבוצעו? הן יישארו בהיסטוריה.",
      "clearQuestion_other": "לנקות {{count, number}} משימות שבוצעו? הן יישארו בהיסטוריה."
    },
```

- [ ] **Step 4: The column**

In `src/features/board/Column.tsx`:

1. Imports: `import { ChevronRight } from 'lucide-react';`, `import { clearDone, moveColumn } from './actions';`, `import { doneAtOf, repeats } from './recurrence';`.
2. Props: add `/** A card to outline: the one History just restored. */ highlightId?: string;`, and destructure it.
3. After `const [name, setName] = useState(column.name);` add:

```ts
  const [showDone, setShowDone] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  // Open cards in board order; done ones in their fold, most recently ticked first.
  const open = visibleTasks.filter((task) => !task.done);
  const done = visibleTasks
    .filter((task) => task.done)
    .sort((a, b) => doneAtOf(b).getTime() - doneAtOf(a).getTime());
  const openTotal = tasks.filter((task) => !task.done).length;
  // Clear takes what the fold shows: done one-offs. Repeats come back on their own.
  const clearable = done.filter((task) => !repeats(task));
```

4. Header count: replace the `column-count` span's content with

```tsx
              {filtering
                ? t('board.column.filteredCount', { visible: open.length, total: openTotal })
                : formatNumber(openTotal)}
```

5. Replace the `{!folded && (...)}` block with:

```tsx
      {!folded && (
        <>
          <ul className="cards">
            {open.map((task) => (
              <TaskCard key={task.id} task={task} today={today} dragging={task.id === draggingId} highlight={task.id === highlightId} />
            ))}
          </ul>

          <TaskComposer column={column} tasks={tasks} />

          {done.length > 0 && (
            <div className="done-fold">
              <button
                type="button"
                className="done-toggle"
                aria-expanded={showDone}
                onClick={() => {
                  setShowDone(!showDone);
                  setConfirmingClear(false);
                }}
              >
                <ChevronRight size={14} strokeWidth={2.2} aria-hidden className={showDone ? 'is-open' : ''} />
                {t('board.done.toggle', { count: done.length })}
              </button>

              {showDone && (
                <>
                  <ul className="cards">
                    {done.map((task) => (
                      <TaskCard key={task.id} task={task} today={today} dragging={false} highlight={task.id === highlightId} />
                    ))}
                  </ul>

                  {clearable.length > 0 &&
                    (confirmingClear ? (
                      <div className="card-actions card-confirm" role="group" aria-label={t('board.done.confirmClear')}>
                        <span>{t('board.done.clearQuestion', { count: clearable.length })}</span>
                        <button type="button" autoFocus onClick={() => setConfirmingClear(false)}>
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          className="danger danger-solid"
                          onClick={() => {
                            setConfirmingClear(false);
                            void clearDone(store, clearable);
                          }}
                        >
                          {t('board.done.clear')}
                        </button>
                      </div>
                    ) : (
                      <div className="card-actions">
                        <button type="button" onClick={() => setConfirmingClear(true)}>
                          {t('board.done.clear')}
                        </button>
                      </div>
                    ))}
                </>
              )}
            </div>
          )}
        </>
      )}
```

The delete button keeps `disabled={tasks.length > 0}`: a column with done cards is not empty.

- [ ] **Step 5: Styles**

In `src/features/board/board.css`, after the `.composer` rules:

```css
/* -------------------------------------------------------- done fold ----- */

.done-fold {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.done-toggle {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
  align-self: flex-start;
  padding: 0.25rem 0.3rem;
  border: 0;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.done-toggle:hover {
  color: var(--text);
}

.done-toggle svg {
  transition: transform 0.15s;
}

.done-toggle svg.is-open {
  transform: rotate(90deg);
}

[dir='rtl'] .done-toggle svg:not(.is-open) {
  transform: scaleX(-1);
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/features/board/Board.test.tsx src/i18n`
Expected: PASS, including Task 6's `leaves done cards out of the drag targets` (done cards render in the closed fold only when it is open, so the query sees just the open card).

- [ ] **Step 7: Check it in the demo**

In the `dev-local` preview: tick two cards, open the fold, untick one (it returns to its old place), press Clear and confirm. Drag an open card into a column whose fold is open and drop it over the done cards: it lands at the end of the open cards. Check the narrow layout with `resize_window` `mobile`, then reset with `desktop`. Screenshot the open fold.

- [ ] **Step 8: Commit**

```bash
git add src/features/board/Column.tsx src/features/board/board.css src/i18n/locales/en.json src/i18n/locales/he.json src/features/board/Board.test.tsx
git commit -m "Board: done cards fold under their column, newest first, with Clear

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The History page, restore, and the docs

**Files:**
- Create: `src/features/board/history/groupByDay.ts`, `src/features/board/history/groupByDay.test.ts`
- Create: `src/features/board/history/HistoryPage.tsx`, `src/features/board/history/HistoryPage.module.css`, `src/features/board/history/HistoryPage.test.tsx`
- Modify: `src/app/sections.ts` (the Board section's pages), `src/app/AppRoutes.tsx`, `src/app/warm.ts`
- Modify: `src/app/sections.test.ts`, `src/app/Nav.test.tsx`
- Modify: `src/features/board/BoardPage.tsx`, `src/features/board/Board.tsx` (`highlightId`), `src/features/board/board.css` (`.board-note`)
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/he.json` (`nav.history`, `board.history.*`, `board.restored`)
- Modify (docs): `src/features/board/README.md`, `src/domain/README.md`, `src/data/README.md`, `supabase/README.md`, `src/app/README.md`, `src/i18n/README.md`, `docs/ARCHITECTURE.md` (the board section), `CLAUDE.md` (the board row of "Where things live")

**Interfaces:**
- Consumes: `restoreTask(store, entry, { tasks, columns, entries, memberId })` (Task 4); `Column`'s `highlightId` (Task 7).
- Produces: route `/history`; `groupByDay(entries, now): DayGroup[]`; the board reads `location.state.restored: { taskId: string; title: string; column: string }` once.

- [ ] **Step 1: Write the failing pure test**

Create `src/features/board/history/groupByDay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TaskCompletion } from '../../../domain/types';
import { groupByDay } from './groupByDay';

const NOW = new Date(2026, 9, 10, 9, 0); // Saturday 10 October 2026, 09:00 local.

function entry(id: string, at: Date): TaskCompletion {
  const iso = at.toISOString();
  return { id, familyId: 'f', createdAt: iso, updatedAt: iso, taskId: `t-${id}`, title: id };
}

describe('groupByDay', () => {
  it('groups by local day, newest first, and names today and yesterday', () => {
    const groups = groupByDay(
      [
        entry('thu', new Date(2026, 9, 8, 20, 0)),
        entry('justAfterMidnight', new Date(2026, 9, 10, 0, 1)),
        entry('justBeforeMidnight', new Date(2026, 9, 9, 23, 59)),
        entry('morning', new Date(2026, 9, 10, 8, 30)),
      ],
      NOW,
    );

    expect(groups.map((group) => [group.day, group.relative, group.entries.map((row) => row.id)])).toEqual([
      ['2026-10-10', 'today', ['morning', 'justAfterMidnight']],
      ['2026-10-09', 'yesterday', ['justBeforeMidnight']],
      ['2026-10-08', undefined, ['thu']],
    ]);
  });

  it('is empty for no entries', () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});
```

Run: `npx vitest run src/features/board/history/groupByDay.test.ts`
Expected: FAIL: the module does not exist.

- [ ] **Step 2: Implement `groupByDay`**

Create `src/features/board/history/groupByDay.ts`:

```ts
import type { TaskCompletion } from '../../../domain/types';
import { addDays, toIsoDate } from '../recurrence';

export interface DayGroup {
  /** The local day, YYYY-MM-DD. */
  day: string;
  /** Today and yesterday are named; older days show their date. */
  relative: 'today' | 'yesterday' | undefined;
  /** Newest first. */
  entries: TaskCompletion[];
}

/** History entries, newest first, in runs of one local day. */
export function groupByDay(entries: readonly TaskCompletion[], now: Date): DayGroup[] {
  const today = toIsoDate(now);
  const yesterday = toIsoDate(addDays(now, -1));
  // ISO timestamps in one format sort as strings.
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const groups: DayGroup[] = [];
  for (const entry of sorted) {
    const day = toIsoDate(new Date(entry.createdAt));
    let group = groups[groups.length - 1];
    if (group === undefined || group.day !== day) {
      group = { day, relative: day === today ? 'today' : day === yesterday ? 'yesterday' : undefined, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}
```

Run: `npx vitest run src/features/board/history/groupByDay.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing page test**

Create `src/features/board/history/HistoryPage.test.tsx`:

```tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionContext } from '../../../auth/session';
import type { Session } from '../../../auth/session';
import { createLocalStore } from '../../../data/local/localStore';
import type { DataStore } from '../../../data/types';
import type { BoardColumn, Member } from '../../../domain/types';
import { LocaleProvider, i18n } from '../../../i18n';
import { HistoryPage } from './HistoryPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dana: Member = { id: 'm-dana', familyId: 'f-test', name: 'Dana', color: '#1d9e75', createdAt: '', updatedAt: '' };
const sam: Member = { id: 'm-sam', familyId: 'f-test', name: 'Sam', color: '#d85a30', createdAt: '', updatedAt: '' };

let store: DataStore;
let house: BoardColumn;
let unmount: (() => void) | null = null;
let landed: { pathname: string; state: unknown } | null = null;

function Spy(): null {
  const location = useLocation();
  landed = { pathname: location.pathname, state: location.state };
  return null;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(): Promise<HTMLElement> {
  const session: Session = { store, me: dana, members: [dana, sam], signOut: async () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <SessionContext.Provider value={session}>
          <MemoryRouter initialEntries={['/history']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/" element={<Spy />} />
            </Routes>
          </MemoryRouter>
        </SessionContext.Provider>
      </LocaleProvider>,
    );
  });
  await flush();
  await flush();
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

async function click(element: Element | null | undefined): Promise<void> {
  expect(element).toBeTruthy();
  await act(async () => {
    (element as HTMLElement).click();
  });
  await flush();
  await flush();
}

beforeEach(async () => {
  localStorage.clear();
  landed = null;
  store = createLocalStore('f-test');
  house = await store.columns.create({ name: 'House', position: 1000 });
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('HistoryPage', () => {
  it('says so when nothing has been done', async () => {
    const host = await render();

    expect(host.textContent).toContain(i18n.t('board.history.emptyTitle'));
  });

  it('lists entries under Today with who did them, and Someone for a backfilled one', async () => {
    const open = await store.tasks.create({ title: 'Mop', columnId: house.id, position: 1000, done: false });
    await store.taskCompletions.create({ taskId: open.id, title: 'Mop', columnId: house.id, memberId: 'm-sam' });
    await store.taskCompletions.create({ taskId: 'gone', title: 'Parcel', columnId: house.id });
    const host = await render();

    expect(host.querySelector('h2')?.textContent).toBe(i18n.t('board.history.today'));
    const rows = [...host.querySelectorAll('li')].map((row) => row.textContent ?? '');
    expect(rows.some((row) => row.includes('Mop') && row.includes('Sam') && row.includes(i18n.t('board.history.onBoard')))).toBe(true);
    expect(rows.some((row) => row.includes('Parcel') && row.includes(i18n.t('board.history.someone')))).toBe(true);
  });

  it('filters by who did it', async () => {
    await store.taskCompletions.create({ taskId: 'a', title: 'Mop', memberId: 'm-sam' });
    await store.taskCompletions.create({ taskId: 'b', title: 'Bins', memberId: 'm-dana' });
    const host = await render();
    const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${i18n.t('board.history.doneBy')}"]`)!;

    await act(async () => {
      select.value = 'm-dana';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const rows = [...host.querySelectorAll('li')].map((row) => row.textContent ?? '');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Bins');
  });

  it('restores a cleared task to its column and goes to the board with a note', async () => {
    await store.taskCompletions.create({ taskId: 'gone', title: 'Parcel', icon: '📦', columnId: house.id, memberId: 'm-dana' });
    const host = await render();

    await click(host.querySelector(`button[aria-label="${i18n.t('board.history.restoreTitle', { title: 'Parcel' })}"]`));

    const [task] = await store.tasks.list();
    expect(task).toMatchObject({ title: 'Parcel', icon: '📦', columnId: house.id, done: false });
    expect(landed?.pathname).toBe('/');
    expect(landed?.state).toEqual({ restored: { taskId: task?.id, title: 'Parcel', column: 'House' } });
  });
});
```

Run: `npx vitest run src/features/board/history/HistoryPage.test.tsx`
Expected: FAIL: `./HistoryPage` does not exist.

- [ ] **Step 4: Strings**

`en.json`: in `nav`, after `"board": "Board",` add `"history": "History",`. In `board`, after `"invite"`, add `"restored": "{{title}} is back in {{column}}.",` and, after the `done` object, add:

```json
    "history": {
      "title": "History",
      "doneBy": "Done by",
      "everyone": "Everyone",
      "someone": "Someone",
      "today": "Today",
      "yesterday": "Yesterday",
      "restore": "Restore",
      "restoreTitle": "Restore {{title}}",
      "onBoard": "On the board",
      "emptyTitle": "Nothing done yet",
      "emptyBody": "Ticked tasks show up here."
    },
```

`he.json`: `"history": "היסטוריה",` in `nav`; `"restored": "{{title}} חזרה לעמודה {{column}}.",` in `board`; and

```json
    "history": {
      "title": "היסטוריה",
      "doneBy": "בוצע על ידי",
      "everyone": "כולם",
      "someone": "מישהו",
      "today": "היום",
      "yesterday": "אתמול",
      "restore": "שחזור",
      "restoreTitle": "שחזור {{title}}",
      "onBoard": "על הלוח",
      "emptyTitle": "עוד לא בוצע כלום",
      "emptyBody": "משימות שסומנו יופיעו כאן."
    },
```

- [ ] **Step 5: The page**

Create `src/features/board/history/HistoryPage.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { History as HistoryIcon, RotateCcw } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { LoadFailed } from '../../../components/LoadFailed';
import { PageHeader } from '../../../components/PageHeader';
import { Button, EmptyState } from '../../../components/ui';
import { retryCollections, useCollection, useCollectionState } from '../../../data/useCollection';
import { comparePosition } from '../../../domain/position';
import type { TaskCompletion } from '../../../domain/types';
import { formatDate } from '../../../i18n';
import { restoreTask } from '../actions';
import { groupByDay } from './groupByDay';
import s from './HistoryPage.module.css';

/**
 * Every tick, newest first, by day, with who did it. Restore puts a task back
 * on the board as a to-do and keeps the entry ("do it again"); a mistaken tick
 * is undone by unticking on the board instead. The board never reads this
 * collection, so it does not slow down as history grows.
 */
export function HistoryPage(): JSX.Element {
  const { t } = useTranslation();
  const { store, me, members } = useSession();
  const navigate = useNavigate();
  const history = useCollectionState(store.taskCompletions);
  const tasks = useCollection(store.tasks);
  const columns = useCollection(store.columns);
  const [who, setWho] = useState('');

  if (history.failed && !history.loaded) {
    return <LoadFailed onRetry={() => retryCollections(store.taskCompletions)} />;
  }

  const shown = history.rows.filter((entry) => who === '' || entry.memberId === who);
  const groups = groupByDay(shown, new Date());
  const nameOf = (memberId: string | undefined): string =>
    members.find((member) => member.id === memberId)?.name ?? t('board.history.someone');
  const onBoard = (entry: TaskCompletion): boolean => tasks.some((task) => task.id === entry.taskId && !task.done);

  const restore = async (entry: TaskCompletion): Promise<void> => {
    const result = await restoreTask(store, entry, {
      tasks,
      columns: [...columns].sort(comparePosition),
      entries: history.rows,
      memberId: me.id,
    });
    if (result === null) return;
    navigate('/', { state: { restored: { taskId: result.taskId, title: entry.title, column: result.column.name } } });
  };

  return (
    <div className={s.page}>
      <PageHeader
        title={t('board.history.title')}
        actions={
          <select className={s.who} value={who} aria-label={t('board.history.doneBy')} onChange={(event) => setWho(event.target.value)}>
            <option value="">{t('board.history.everyone')}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        }
      />

      {!history.loaded ? (
        <p className="centred">{t('common.loading')}</p>
      ) : groups.length === 0 ? (
        <EmptyState icon={HistoryIcon} title={t('board.history.emptyTitle')}>
          {t('board.history.emptyBody')}
        </EmptyState>
      ) : (
        groups.map((group) => (
          <section key={group.day} className={s.day} aria-labelledby={`history-${group.day}`}>
            <h2 id={`history-${group.day}`} className={s.dayTitle}>
              {group.relative !== undefined
                ? t(`board.history.${group.relative}`)
                : formatDate(group.day, { weekday: 'short', day: 'numeric', month: 'short' })}
            </h2>
            <ul className={s.rows}>
              {group.entries.map((entry) => (
                <li key={entry.id} className={s.row}>
                  <span className={s.icon} aria-hidden="true">
                    {entry.icon ?? '•'}
                  </span>
                  <span className={s.title} dir="auto">
                    {entry.title}
                  </span>
                  <span className={s.by} dir="auto">
                    {nameOf(entry.memberId)}
                  </span>
                  {onBoard(entry) ? (
                    <span className={s.onBoard}>{t('board.history.onBoard')}</span>
                  ) : (
                    <Button
                      variant="ghost"
                      icon={RotateCcw}
                      aria-label={t('board.history.restoreTitle', { title: entry.title })}
                      onClick={() => void restore(entry)}
                    >
                      {t('board.history.restore')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
```

Create `src/features/board/history/HistoryPage.module.css`:

```css
.page {
  min-width: 0;
}

.who {
  min-height: 2.75rem;
}

.day {
  margin-top: 1.25rem;
}

.dayTitle {
  margin: 0 0 0.25rem;
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 500;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  min-height: 2.75rem;
  border-bottom: 1px solid var(--border);
}

.icon {
  flex: 0 0 auto;
  width: 1.5rem;
  text-align: center;
}

.title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.by,
.onBoard {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 0.85rem;
}
```

Run: `npx vitest run src/features/board/history`
Expected: PASS.

- [ ] **Step 6: Route, section page and warming**

`src/app/sections.ts`, the Board section:

```ts
  {
    id: 'board',
    labelKey: 'nav.board',
    icon: LayoutGrid,
    pages: [
      { path: '/', labelKey: 'nav.board', icon: LayoutGrid, end: true },
      { path: '/history', labelKey: 'nav.history', icon: History },
    ],
  },
```

and add `History` to its `lucide-react` import.

`src/app/AppRoutes.tsx`: with the other lazy screens,

```ts
const HistoryPage = lazy(() => import('../features/board/history/HistoryPage').then((m) => ({ default: m.HistoryPage })));
```

and after the `/` route:

```tsx
      {/* Not a kitchen screen: it waits for its own first read. */}
      <Route path="/history" element={<Suspense fallback={<Loading />}><HistoryPage /></Suspense>} />
```

`src/app/warm.ts`, in `WARMERS`:

```ts
  '/history': (store) => {
    preloadCollection(store.taskCompletions);
  },
```

`src/app/sections.test.ts`: in `'lights the board on / only'` add `expect(where('/history')).toBe('board/history');`.

`src/app/Nav.test.tsx`: in `describe('the page pills', ...)` add:

```tsx
  it("lists the board's pages, with History lit on /history", async () => {
    const host = await render(<PagePills />, '/history');
    const pills = host.querySelector(`nav[aria-label="${i18n.t('nav.sectionPages', { section: i18n.t('nav.board') })}"]`);
    expect([...(pills?.querySelectorAll('a') ?? [])].map((a) => a.textContent)).toEqual([i18n.t('nav.board'), i18n.t('nav.history')]);
    expect(link(pills as HTMLElement, i18n.t('nav.history'))?.getAttribute('aria-current')).toBe('page');
  });
```

Run: `npx vitest run src/app`
Expected: PASS. If an existing Nav test asserted the board section has no pills, update it to the two pages above.

- [ ] **Step 7: The board's note and highlight after a restore**

In `src/features/board/BoardPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
```

Inside `BoardPage()`, after `const inviteCode = ...`:

```tsx
  // History's Restore lands here with what it put back. Read once, then
  // dropped from the history entry, so a reload does not show it again.
  const location = useLocation();
  const navigate = useNavigate();
  const [restored] = useState(
    () => (location.state as { restored?: { taskId: string; title: string; column: string } } | null)?.restored,
  );
  useEffect(() => {
    if (restored !== undefined) navigate(location.pathname, { replace: true, state: null });
  }, [restored, navigate, location.pathname]);
```

Render, just before the `failed ? ... : <Board />` line:

```tsx
      {restored !== undefined && (
        <p className="board-note" role="status">
          {t('board.restored', { title: restored.title, column: restored.column })}
        </p>
      )}
```

and change `<Board />` to `<Board highlightId={restored?.taskId} />`.

In `src/features/board/Board.tsx`: `export function Board({ highlightId }: { highlightId?: string } = {}): JSX.Element {`, and pass `highlightId={highlightId}` to every `<Column>`.

In `board.css`, after `.invite`:

```css
/* "Parcel is back in Errands", after History's Restore. */
.board-note {
  margin: 1rem 0 0;
  padding: 0.6rem 0.75rem;
  border-radius: 0.6rem;
  background: var(--sage-tint);
  color: var(--text);
  font-size: 0.9rem;
}
```

Run: `npx vitest run src/features/board src/features/family/FamilyPage.test.tsx`
Expected: PASS.

- [ ] **Step 8: Check the whole flow in the demo**

In the `dev-local` preview: tick two tasks, open History from the Board · History pills, filter by member, go back, clear one, restore it from History. Expected: the board shows "‹title› is back in ‹column›." and the card is outlined; a reload drops the note. Screenshot History and the restored board, light and dark, and at `mobile` width; then `resize_window` `desktop`. No console errors.

- [ ] **Step 9: Docs**

Read each README's "Rules & gotchas" before editing it.

- `src/features/board/README.md`:
  - Files table: add `actions.test.ts`, `Board.test.tsx`, and `history/` (`HistoryPage.tsx`, `groupByDay.ts`, their tests).
  - `actions.ts` row: `completeTask()`, `reopenTask()`, `clearDone()`, `autoClear()`, `reviveRecurring()`, `restoreTask()`, `placeTask()`, `moveColumn()`, `endPosition()`.
  - `recurrence.ts` row: add `doneAtOf()` and `returnDate()`; drop the revive column.
  - `defaultColumns.ts` row: one "To do".
  - "How it works": `placeTask()` moves only; the tick writes `done`, `doneAt` and `completionId` plus a history entry; revive and auto-clear run on load (`Board.tsx`); done cards fold under their column; narrow screens no longer pre-fold.
  - "Rules & gotchas": replace "`Task.done` must equal its column's `isDone`..." with "`Task.done` belongs to the card: only `completeTask()`, `reopenTask()`, `reviveRecurring()` and `restoreTask()` write it. A done repeat keeps the due date it covered; its return date is `returnDate()`." Add: "Done cards have no `data-task-id`, so they are never drop targets"; "The board never reads `taskCompletions`; only History lists it".
  - Tests: list the new files.
- `src/domain/README.md`: `Task.doneAt`, `Task.completionId`, `TaskCompletion`; `BoardColumn` has no `isDone`.
- `src/data/README.md`: the `taskCompletions` collection; `doneAt` in the Supabase adapter's timestamp keys; the contract's new cases (removing a missing row resolves).
- `supabase/README.md`: both migrations, the order (the first before deploying, the second after), and that `task_completions.task_id` has no foreign key on purpose.
- `src/app/README.md`: the Board section has two pages; `/history` is warmed.
- `src/i18n/README.md`: the new key groups `board.done`, `board.history`, `board.restored`, `nav.history`.
- `docs/ARCHITECTURE.md`, section "The board": replace the done-column paragraph with the tick, the fold, clearing and History, and why the board never reads history (D8 in the spec).
- `CLAUDE.md`, the `src/features/board/` row: "Kanban board, drag and drop, the tick, repeating chores, History".

- [ ] **Step 10: Full check**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: PASS (live suites skipped).

Run: `npx vite build --mode demo`
Expected: build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/features/board/history src/app/sections.ts src/app/AppRoutes.tsx src/app/warm.ts src/app/sections.test.ts src/app/Nav.test.tsx src/features/board/BoardPage.tsx src/features/board/Board.tsx src/features/board/board.css src/i18n/locales/en.json src/i18n/locales/he.json src/features/board/README.md src/domain/README.md src/data/README.md supabase/README.md src/app/README.md src/i18n/README.md docs/ARCHITECTURE.md CLAUDE.md
git commit -m "Board: a History page of every tick, with Restore; Board and History pills; docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Rollout (with the user)

One Supabase project serves production and the live suites, and a push to `main` deploys to nestead.pages.dev in about a minute. Every step below that touches production is the user's, or needs their go-ahead in chat.

- [ ] **Step 1: Ask the user to apply migration 1 to production**

Give them `supabase/migrations/20261010120000_board_done_tasks.sql` to run in the Supabase SQL editor. The live app keeps working: it ignores the new columns and table. Wait for them to confirm it ran.

Between this step and Step 4, a card dragged into the old Done column by the live app is done without `doneAt`. The code falls back to `updatedAt` (`doneAtOf()`). A repeat dragged there in that window comes back one round late. Keep the window short.

- [ ] **Step 2: Run the live suites, with the user's go-ahead**

They write to the production project's two test families. From the shared checkout, where `.env.test` lives, after the branch is merged locally (Step 3), or by temporarily copying `.env.test` into the worktree and deleting it afterwards:

```bash
npx vitest run src/data/supabase
```

Expected: PASS, including the three new contract cases and the realtime test.

- [ ] **Step 3: Land the branch on `main`**

Follow the `shared-checkout-sessions` memory: check `git status` in the shared checkout and that `main` has not moved (`git log -1 main`). If other sessions have uncommitted edits in files this branch touches, land with the `git reset -q board/done-tasks -- <paths>` then `git merge --ff-only board/done-tasks` sequence described there; otherwise:

```bash
git -C "C:/Users/Mercury/Claude Projects/Nestead/Nestead" merge --ff-only board/done-tasks
```

The docs-on-merge hook checks the READMEs (Task 8 Step 9).

- [ ] **Step 4: Push and check the deploy (needs the user's go-ahead)**

```bash
git -C "C:/Users/Mercury/Claude Projects/Nestead/Nestead" push origin main
```

Check the Cloudflare Pages build through the public GitHub Actions API, as the `deploy-checks` memory describes. Then open nestead.pages.dev in the Browser pane: tick a card, open History. The user signs in themselves.

- [ ] **Step 5: Ask the user to apply migration 2**

`supabase/migrations/20261010130000_drop_column_is_done.sql`, only once Step 4's deploy is live. Then add a column on the live board to confirm.

- [ ] **Step 6: Clean up**

Remove the worktree's junction first, then the worktree, then the branch (all from the shared checkout, not from inside the worktree):

```bash
cmd //c rmdir "C:\\Users\\Mercury\\Claude Projects\\Nestead\\.worktrees\\board-done-tasks\\node_modules"
git -C "C:/Users/Mercury/Claude Projects/Nestead/Nestead" worktree remove ../.worktrees/board-done-tasks
git -C "C:/Users/Mercury/Claude Projects/Nestead/Nestead" branch -d board/done-tasks
```

Save a project memory "Board done tasks shipped" with the commit hash and the date, as the earlier features have.
