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
