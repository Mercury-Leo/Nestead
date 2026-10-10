# supabase
The Postgres schema for the real backend, the migrations for projects that already exist, and the Supabase CLI config.

## Files
| File | Responsibility |
| --- | --- |
| `schema.sql` | The whole schema for a fresh project: tables, RLS policies, triggers, RPCs, realtime, photo bucket policies. |
| `migrations/20260922120000_recurring_tasks.sql` | `tasks.recur_every_days`. |
| `migrations/20260923120000_task_description.sql` | `tasks.description`. |
| `migrations/20260924120000_kitchen.sql` | The kitchen tables and the `recipe-photos` bucket. |
| `migrations/20260926120000_invite_family_name.sql` | `invite_family_name(code)`. |
| `migrations/20260927120000_task_schedule.sql` | `tasks.recur_every_months` and `recur_from`; converts 30- and 90-day repeats to months. |
| `migrations/20260927180000_list_group_order.sql` | `list_groups.position`, `builtin` and one row per built-in section. |
| `migrations/20261003120000_family_ai.sql` | AI reading: `family_ai_settings`, `ai_usage`, `ai_usage_days` and their five functions. |
| `migrations/20261004120000_shows.sql` | Activities: the `shows` table (movies and series from OMDb), its policy, trigger and realtime. |
| `migrations/20261004150000_shows_dropped.sql` | `shows.status` may also be `dropped` (`shows_status_check` replaced). |
| `migrations/20261004200000_addresses.sql` | `addresses`: the family's address book, with RLS, its policy and realtime. |
| `migrations/20261005120000_shows_favorite.sql` | `shows.favorite` (not null, default false): the favourite star. |
| `migrations/20261005130000_shows_genres.sql` | `shows.genres` (`text[]`, at most ten, no null items; NULL on rows from before it). |
| `migrations/20261005140000_shows_tags.sql` | `shows.tags` (`text[]`, not null, empty by default, at most twenty, no null items): the family's own tags. |
| `migrations/20261010120000_board_done_tasks.sql` | `tasks.done_at` and `completion_id`; `task_completions`, one row per tick, with its policy, trigger and realtime; a history entry for every task already done, with `done_at` and `completion_id` filled in and done repeats' due dates moved back a day. Additive. |
| `migrations/20261010130000_drop_column_is_done.sql` | Catches up tasks the old app ticked after the first migration (`done` with no `done_at`): the same backfill, for those only. Then drops `board_columns.is_done`. One transaction, applied after the deploy (below). |
| `config.toml` | Declares only `project_id`, the site URL and the `/join/**` redirect URL. |
| `.gitignore` | Ignores the CLI's `.branches` and `.temp`. |

## How it works
- Each migration's header says `schema.sql` already includes it: a fresh project needs only `schema.sql`.
- Every family table has `family_id` and a policy comparing it with `current_family_id()`, a `security definer` function that returns NULL, and so denies everything, for a user in no family (`schema.sql`).
- `create_family`, `join_family`, `rotate_join_code` and `invite_family_name` are `security definer` RPCs, since RLS makes those steps impossible from the client (`schema.sql`, `../src/data/supabase/supabaseAccount.ts`).
- Realtime publishes `members`, `board_columns`, `tasks`, `task_completions`, the five kitchen tables, `shows` and `addresses`, not `families` or the AI tables (`schema.sql`).
- `shows` keeps OMDb's details as they were read (`fetched_at`), so the list never calls OMDb; `poster_url` is OMDb's link to Amazon's image servers, and no poster image is stored here or in Storage. One row per title per family (`shows_one_per_title`, whose index also serves the family's list); `status` is `to-watch` (the default), `watching`, `watched` or `dropped`; `favorite` is the family's star, false by default and never null; `genres` is the title's genres in English, empty when a read named none, NULL only on rows from before genres until read again; `tags` is the family's own labels as typed, empty for none and never NULL (`schema.sql`).
- A tick is `tasks.done`, `done_at` and `completion_id`, plus one `task_completions` row: copies of the task's fields taken then (so History reads right after a rename or a clear), and `member_id`, who ticked it, null for the entries the migrations backfilled. `column_id`, `assignee_id` and `member_id` are `on delete set null`. `task_id` has no foreign key on purpose: clearing a task deletes its row but its entries must keep the id, so Restore can point them all at the re-created task (`on delete set null` would blank them and let a second Restore duplicate it). Entries are never cascaded from `tasks` (`schema.sql`, `../src/features/board/actions.ts`).
- The AI tables have RLS with no policies and revoked privileges; only `family_ai_status`, `store_family_ai_key`, `clear_family_ai_key`, `set_family_ai_model` and `claim_ai_request` (security definer, `current_family_id()`-scoped) touch them. The key is ciphertext made by the server. `claim_ai_request()` serialises free claims on today's `ai_usage_days` row; the day is UTC (`schema.sql`, `../server/ai/store.ts`).
- Photos live in the private `recipe-photos` bucket, one folder per family id, enforced by storage policies (`schema.sql`).

## Connections
- Mirrored by `../src/domain/types.ts`; mapped by `../src/data/supabase/supabaseStore.ts`.
- Called by `../src/data/supabase/` only: `supabaseStore.ts` for rows and photos, `supabaseAccount.ts` for auth and the RPCs. The AI functions are also called by `../server/ai/store.ts`, as the signed-in member over PostgREST.
- Exercised by the live suites in `../src/data/supabase/`; the AI functions by `../tests/sql/familyAi.test.ts`, the `shows` table by `../tests/sql/shows.test.ts`, and `task_completions` with both board migrations by `../tests/sql/boardDone.test.ts`, which load `schema.sql` into PGlite behind the stand-in Supabase in `../tests/sql/supabaseShim.sql`.

## Rules & gotchas
- A schema change is a new migration plus the same change in `schema.sql`, plus `../src/domain/types.ts` (snake_case here, camelCase there).
- Apply in one run: a table that exists before its policy is briefly readable with the publishable key (`schema.sql` header).
- `tasks.column_id` is `on delete restrict`: a column that still has tasks cannot be deleted (`schema.sql`).
- Declare a setting in `config.toml` only to own it: `supabase config push` overwrites every property the file declares (`config.toml`).
- Test the AI functions with `../tests/sql/familyAi.test.ts` (PGlite), never against the live project: claiming there spends the app's real free reads.
- `../tests/sql/shows.test.ts` checks RLS by switching to the `authenticated` role (`set role`), since PGlite's superuser bypasses policies; reset the role before any setup a test does as the superuser.
- The live contract suite tests `shows`, so it fails until `migrations/20261004120000_shows.sql` is applied to the project in `.env.test` (production). Apply it before merging the Shows page, which reads the table on first open. Likewise apply `migrations/20261005120000_shows_favorite.sql` before deploying the favourite star: the page still opens without the column, but starring a show fails. And apply `migrations/20261005130000_shows_genres.sql` before deploying genres: the list still opens without it, but adding or refreshing a show writes `genres` and fails. And apply `migrations/20261005140000_shows_tags.sql` before deploying tags: the list still opens without it, but saving a show's tags writes `tags` and fails.
- Board done tasks take two migrations, in this order. Apply `migrations/20261010120000_board_done_tasks.sql` before deploying the code that ticks: the app before it ignores the new columns and table, and the live contract suite (`task_completions`, `done_at`) fails until it is applied. Then deploy, and have every family device reload or close the app: the old bundle has no service worker or version check, so an open tab keeps running it after the deploy. Such a tab still ticks by moving a card into the done column (no `done_at` or history entry; the second migration catches those up), and its revive unticks any repeat ticked in the new app whose due date has come, since a new tick keeps the due date. Only once every device has reloaded apply `migrations/20261010130000_drop_column_is_done.sql`: after it, a stale tab breaks Add task and moving cards between columns (both send `done` taken from the column's `is_done`, which is gone, so null, and `tasks.done` is not null) as well as New column (which sends `is_done` itself).
- Done repeats migrated by either migration carry `due_date` minus one day, one day off their schedule, until they come back: the new return rule takes the first round after the due date, so they return on the date they showed before, but unticking or restoring one early shows it due a day early. Done repeats sitting in the old "Done" column come back there, since revive unticks a task in place, in its own column.
- A failed check constraint's detail holds the whole row, and PostgREST passes details to the caller. So `set_family_ai_model()` tests the model by the table's own rule before it updates, and raises a bare `Invalid model` (`check_violation`), never the row with the stored ciphertext. Keep the function's rule and the table's check the same, in `schema.sql` and in the migration. (`store_family_ai_key()`'s check errors show only the row being written, the caller's own values.)
- Open question: `schema.sql` says it "has NOT been applied to any project", yet the live suites pass against a project with these tables.
