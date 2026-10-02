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
| `config.toml` | Declares only `project_id`, the site URL and the `/join/**` redirect URL. |
| `.gitignore` | Ignores the CLI's `.branches` and `.temp`. |

## How it works
- Each migration's header says `schema.sql` already includes it: a fresh project needs only `schema.sql`.
- Every family table has `family_id` and a policy comparing it with `current_family_id()`, a `security definer` function that returns NULL, and so denies everything, for a user in no family (`schema.sql`).
- `create_family`, `join_family`, `rotate_join_code` and `invite_family_name` are `security definer` RPCs, since RLS makes those steps impossible from the client (`schema.sql`, `../src/data/supabase/supabaseAccount.ts`).
- Realtime publishes `members`, `board_columns`, `tasks` and the five kitchen tables, not `families` (`schema.sql`).
- Photos live in the private `recipe-photos` bucket, one folder per family id, enforced by storage policies (`schema.sql`).

## Connections
- Mirrored by `../src/domain/types.ts`; mapped by `../src/data/supabase/supabaseStore.ts`.
- Called by `../src/data/supabase/` only: `supabaseStore.ts` for rows and photos, `supabaseAccount.ts` for auth and the RPCs.
- Exercised by the live suites in `../src/data/supabase/`.

## Rules & gotchas
- A schema change is a new migration plus the same change in `schema.sql`, plus `../src/domain/types.ts` (snake_case here, camelCase there).
- Apply in one run: a table that exists before its policy is briefly readable with the publishable key (`schema.sql` header).
- `tasks.column_id` is `on delete restrict`: a column that still has tasks cannot be deleted (`schema.sql`).
- Declare a setting in `config.toml` only to own it: `supabase config push` overwrites every property the file declares (`config.toml`).
- Open question: `schema.sql` says it "has NOT been applied to any project", yet the live suites pass against a project with these tables.
