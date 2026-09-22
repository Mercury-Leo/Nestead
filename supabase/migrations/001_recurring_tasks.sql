-- Recurring tasks.
--
-- Run this against a database that already has the original schema.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- A repeating task is one row that comes back round, not a new row per
-- occurrence: completing it sets due_date, and the app marks it outstanding
-- again when that date arrives. Nothing can be duplicated, so there is no
-- dedupe key and no spawn race to worry about.

alter table tasks
  add column recur_every_days integer
    check (recur_every_days is null or recur_every_days > 0);

comment on column tasks.recur_every_days is
  'Days between occurrences; null means the task does not repeat.';
