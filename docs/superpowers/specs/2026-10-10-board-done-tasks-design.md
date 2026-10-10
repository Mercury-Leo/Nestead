# Board: done tasks and history: design

- **Date:** 2026-10-10
- **Status:** Implemented on branch board/done-tasks; not yet rolled out.
- **Scope:** Mark a task done with one tap instead of a Done column, fold finished tasks under their own column, clear them by hand or after a week, and keep a History page of who did what, from which a task can be restored. Branch `board/done-tasks`.

## 1. Problem

A task is done only when it sits in a column whose `isDone` is set (`placeTask()` copies it onto `Task.done`). Only the seeded "Done" column ever has that flag: "New column" always makes an ordinary one and nothing in the UI sets it, so a family that deletes its Done column cannot finish anything again. The family does not use Doing or Done anyway: their columns are places or kinds of task, not stages. Finishing a task should be a property of the card, done in one tap, and there should be a record of what got done.

## 2. Decisions

- **D1 Done belongs to the card, not the column.** `BoardColumn.isDone` goes. `Task.done` is written by the tick and nothing else copies it.
- **D2 The tick is a badge on the card's emoji.** The emoji moves out of the card's toggle into its own button, with a small round tick in its corner; the whole emoji is the target. Rejected: a separate tick before the emoji (clearest, but costs a slot in a 15rem column), a ring that replaces the emoji with a tick (done cards lose their emoji), a Done button (squeezes titles), swipe (undiscoverable, fights column scrolling on wide screens, no keyboard), a button inside the open card (two taps for the commonest action), dragging to a Done bar (the slow path this replaces).
- **D3 Done cards fold under their own column**: "Done (3)" at the foot of the column, closed by default. Rejected: greyed at the bottom (piles up), hidden behind a board-wide switch, deleted on tick.
- **D4 Clearing: a Clear button in the fold, and auto-clear after 7 days.** Both delete done one-off tasks from the board; their history stays. Repeating chores are never cleared: they come back on their own.
- **D5 History records every completion and who did it**, in a new collection, so a repeating chore shows every round. Rejected: archiving cleared tasks and listing those (no repeats, no who, and the board would load every task ever finished).
- **D6 History is its own page in the Board section** (Board · History pills), not a sheet.
- **D7 Restore means "do it again".** It puts the task back on the board as a to-do and keeps the history entry. A mistaken tick is undone by unticking on the board, which does delete its entry.
- **D8 The board never loads history.** Ticking creates an entry, unticking removes one by id; only the History page lists them.
- **D9 The migration moves nothing.** Cards already in a Done column stay there, ticked, inside that column's fold; the family clears them and deletes the columns it does not want. Each already-done task gets a history entry with no "who", so auto-clear never loses one.

## 3. Data

### Tasks

```ts
/** The tick. Written only by the tick, untick, revive and restore. */
done: boolean;
/** When it was ticked; absent while open. Orders the fold, drives auto-clear and a repeat's return date. */
doneAt?: string;
/** The history entry this tick created, so an untick can remove exactly that one. */
completionId?: string;
```

`done_at timestamptz` and `completion_id uuid` on `tasks`, both nullable. `completion_id` has no foreign key: it is a pointer for undo, cleared by the untick that uses it.

### Columns

`isDone` is removed from `BoardColumn`, `board_columns` and every caller: `seedDefaultColumns()`, `scripts/perf/fixtures.ts`, `supabaseRealtime.test.ts` and the contract. A new family starts with one column, "To do".

### Completions (new collection `taskCompletions`, table `task_completions`)

```ts
export interface TaskCompletion extends Base {
  /** The task it was for; it may no longer exist (cleared or deleted). */
  taskId: string;
  /** Copies taken at the tick, so history reads right after a rename and a cleared task can be restored. */
  title: string;
  icon?: string;
  description?: string;
  columnId?: string;
  assigneeId?: string;
  /** Who ticked it. */
  memberId?: string;
}
```

When it was done is the entry's `createdAt`.

```sql
create table task_completions (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid        not null references families (id) on delete cascade,
  -- No foreign key: clearing a task must keep its history, and every entry of
  -- one task must still share its id afterwards, so Restore can re-point them
  -- all (on delete set null would blank them and let a second Restore duplicate it).
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
```

Index on `family_id`, the `set_updated_at` trigger, RLS with the `family_id = current_family_id()` policy, and `supabase_realtime`, all as `20261004200000_addresses.sql` does. Adding the collection follows the Shows and Addresses pattern: `DataStore`, both adapters, `withCache()`.

### Migrations (two, see section 9)

1. `20261010120000_board_done_tasks.sql`, additive and in one transaction: the two task columns and the table. Then, for every task already done:
   - `done_at = updated_at`;
   - a history entry copied from the task, with no `member_id` (shown as "Someone") and `created_at = updated_at`, and `completion_id` pointing at it. Without these, auto-clear would delete old done tasks on the first load with nothing in History to restore them from;
   - for repeating ones, `due_date = due_date - 1 day`. Under the old rule their due date already moved to the next round; under the new one a done repeat keeps the round it covered and its return date is worked out (section 4). Shifting back one day makes that return date come out as the date they show now.
2. `20261010130000_drop_column_is_done.sql`: `alter table board_columns drop column is_done`.

`schema.sql` and `src/domain/types.ts` take the end state.

## 4. Rules (`src/features/board/actions.ts`, `recurrence.ts`)

- **Tick** (`completeTask(store, task, me, now)`): create the entry (snapshot, `memberId: me.id`), then update the task `{ done: true, doneAt: now, completionId }`. `dueDate` does not change.
- **Untick** (`reopenTask(store, task)`): update `{ done: false, doneAt: undefined, completionId: undefined }`, then remove the entry `completionId` names, if any. `dueDate` does not change: a repeat goes back to the round it was ticked for, overdue if that has passed.
- **Return date** (`returnDate(task)`): `nextOccurrence(task, doneAt)`, the same rule as today with the day it was done as "now". Done late, missed rounds are skipped; done early, only the round it covered is.
- **Revive** (`reviveRecurring()`, on board load as today): a done repeat whose return date has arrived gets `{ done: false, doneAt: undefined, completionId: undefined, dueDate, recurFrom }` from `returnDate()`, **in place**, in its own column. `reviveColumn()` goes.
- **Clear** (`clearDone(store, tasks)`): remove the given column's done one-offs. Repeats are skipped.
- **Auto-clear** (`autoClear(store, tasks, now)`, on board load with revive): remove done one-offs whose `doneAt` is more than 7 days (`CLEAR_AFTER_DAYS`) before now. Two devices doing it at once is harmless; a remove of a row already gone must not throw (checked in the contract).
- **Restore** (`restoreTask(store, entry, tasks, columns, completions)`):
  - The entry's task exists and is done: update it `{ done: false, doneAt: undefined, completionId: undefined }` and remove no entry (unlike an untick).
  - It exists and is open: nothing to do (the History row shows "On the board" instead of the button).
  - It is gone: create it from the snapshot as an open one-off at the end of `columnId`, or of the first column if that is gone, then point every entry with the old `taskId` at the new task, so the row now reads "On the board" and a second press cannot duplicate it.
- **Moving** (`placeTask()`): position and column only; it no longer writes `done` or schedules a repeat.
- **New tasks** (`TaskComposer`): always `done: false`.
- Two writes per tick or untick, no transaction. The entry is written first; if the task update then fails, the entry stays without a task pointing at it. Accepted for a family board.

## 5. The card (`TaskCard.tsx`)

- The head becomes: **tick button** (emoji with a corner tick), then the toggle (title, repeat and date badges; opens the card and starts drags), then the assignee circle.
- The tick button is a `<button role="checkbox" aria-checked>` named "Done: ‹title›". Its hit area is at least 32px square. It does not start a drag.
- The corner tick is an outlined circle; on hover it takes the app's green (`--sage`); ticked, it is filled `--sage` with a check in `--card`. Both tokens already exist in light and dark.
- A task with no emoji shows a plain round tick in the same slot.
- Ticked: the title greys and is struck through (`.card-done`, as now). A repeat shows "Back on ‹date›" from `returnDate()`.

## 6. The column (`Column.tsx`, `Board.tsx`)

- Open cards, then "Add a task", then the fold toggle **▸ Done (n)**, shown only when the column has done cards. Closed whenever the board loads; open state is not remembered.
- Open: done cards newest first by `doneAt`. They cannot be dragged; untick first. The search and person filters apply inside the fold and its count.
- **Clear** under the open fold when it holds a done one-off. A confirm step ("Clear 2 done tasks? They stay in History.") as deleting a card has.
- The header count is open cards only.
- Deleting a column still needs it empty; the hint becomes "Move or clear its tasks first".
- Narrow screens no longer fold columns on load (they folded done columns).
- `dropPosition()` still runs over every task in the column, done ones included, so an unticked card returns to its old place.

## 7. History (`src/features/board/history/`, new)

- Route `/history`; the Board section in `sections.ts` gets a second page, so the pills appear as Larder's do. `warm.ts` preloads `taskCompletions` on the way there.
- Entries newest first, grouped by local day: "Today", "Yesterday", then `formatDate()` with weekday, day and month. `groupByDay(entries, now)` is pure.
- A row: emoji, title (`dir="auto"`), who ticked it (name, or "Someone" when the member is gone), and **Restore** or "On the board".
- "Done by" filter: Everyone or one member. Not remembered.
- Restoring goes to the board with a `role="status"` line "‹title› is back in ‹column›" and the card outlined until the board is left. The note is read once, so a reload does not show it again.
- Read-only otherwise: entries cannot be edited or deleted here.
- `LoadFailed` for a failed first read; empty state "Nothing done yet. Ticked tasks show up here."
- It lists the whole history. At about ten ticks a day that is a few thousand small rows a year; loading only recent entries is the follow-up if it drags.

## 8. Tests

- `recurrence.test.ts`: `returnDate()` done early, on time and late, monthly on the 31st; a done repeat shifted back one day by the migration returns on its old date.
- `actions.test.ts` (new): tick writes the snapshot and the task patch; untick clears the fields and removes that entry only; clear skips repeats; auto-clear at 7 days less a minute and plus a minute; revive in place with the next date; restore in each of its three cases, including the re-pointed entries and the first-column fallback.
- `tests/sql/` on PGlite: migration 1 over a done one-off, a done weekly and monthly repeat and an open task: `done_at`, the backfilled entries and `completion_id`, the shifted due dates, open tasks untouched.
- `history/groupByDay.test.ts`: local midnight on either side, Today, Yesterday, older; newest first.
- `collection.contract.ts`: `taskCompletions` round-trips; deleting a task leaves its entries with their `taskId`; removing a missing row does not throw; tasks round-trip `doneAt` and `completionId` and clear them with `undefined`; columns without `isDone`. Runs against Supabase too when `.env.test` is present.
- Screens: `TaskCard` tick (name, `aria-checked`, no drag); `Column` fold (hidden when empty, count, newest first, untick, Clear with confirm, filtered); `HistoryPage` (grouping, filter, Restore and "On the board", `LoadFailed`, empty); `Nav.test.tsx` and `sections.test.ts` for the new page.

## 9. Rollout

One Supabase project serves production and the live suites, and a push to main deploys in about a minute, so the order matters:

1. Build on `board/done-tasks` in `../.worktrees/board-done-tasks`; the shared checkout never switches branch.
2. The user applies migration 1 to production. The live app ignores the new columns and table.
3. Run the live Supabase suites.
4. Update the READMEs on the branch: `src/features/board/` (the Task.done rule and the history folder), `src/domain/`, `src/data/`, `supabase/`, `src/app/`, `src/i18n/` for the new keys (English and Hebrew), and the board section of `docs/ARCHITECTURE.md`.
5. Fast-forward into main and push; check the deploy.
6. Every family device reloads or closes the app: an open tab keeps running the old bundle, which still ticks by moving cards into the done column and unticks repeats ticked in the new app.
7. The user applies migration 2, which first catches up tasks the old app ticked since migration 1. In a tab still on the old bundle it breaks Add task, moving cards between columns and "New column".

## 10. Not in this version

- A repeating chore restored after someone deleted it comes back as a one-off: the entry does not copy the schedule.
- Crediting the assignee instead of whoever ticked; choosing who did it when ticking.
- Editing or deleting history entries; exporting history; counts or charts per person.
- A swipe or keyboard shortcut to tick.
- Remembering whether a fold is open.
