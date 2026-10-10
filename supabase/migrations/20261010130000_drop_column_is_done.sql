-- Board: columns no longer mark tasks done; the tick on the card does
-- (20261010120000_board_done_tasks.sql).
--
-- Apply this only AFTER the code that stopped writing is_done is deployed AND
-- every family device has reloaded or closed the app. A tab still running the
-- app before it keeps going after the deploy (nothing makes it reload), and
-- once this runs its writes fail: adding a task and moving a card to another
-- column send done = null (taken from the column's is_done, which is gone),
-- which tasks.done refuses, and adding a column sends is_done itself. So Add
-- task, moving cards between columns and New column all break in such a tab.
--
-- It also catches up tasks finished the old way. Between the first migration
-- and the deploy, and in old tabs since, moving a card into a done column set
-- done = true with no done_at, no completion_id and no history entry, and had
-- already moved a repeat's due date on to its next round. The first
-- migration's backfill runs again for exactly those (done and done_at is
-- null), in the same transaction as the drop: one entry each, copied from the
-- task with no member, then done_at, the entry it points at and, for a repeat
-- with a due date, one day back.
--
-- schema.sql already has this change, so a fresh project needs only that file.

begin;

-- One statement: the insert copies each task before the update moves its
-- updated_at, and the update joins only the entries this insert made, since a
-- task may already have older ones.
with caught as (
  insert into task_completions (family_id, task_id, title, icon, description, column_id, assignee_id, created_at, updated_at)
    select family_id, id, title, icon, description, column_id, assignee_id, updated_at, updated_at
    from tasks
    where done and done_at is null
  returning id, task_id
)
update tasks t
set done_at = t.updated_at,
    completion_id = c.id,
    due_date = case
      when t.due_date is not null and (t.recur_every_days is not null or t.recur_every_months is not null)
        then t.due_date - 1
      else t.due_date
    end
from caught c
where c.task_id = t.id;

alter table board_columns drop column is_done;

commit;
