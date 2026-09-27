-- Repeats that count from the due date.
--
-- Run this against a database that already has the original schema.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- A repeating task now keeps to its schedule: monthly from 5 July comes round
-- on the 5th of every month, whenever it is actually done. Months are calendar
-- months, which a count of days cannot express, and recur_from remembers the
-- day the schedule counts from.

alter table tasks
  add column recur_every_months integer
    check (recur_every_months is null or recur_every_months > 0),
  add column recur_from date;

comment on column tasks.recur_every_months is
  'Calendar months between occurrences; null when it repeats by days or not at all.';
comment on column tasks.recur_from is
  'The date the repeat schedule counts from; the due date the family set.';

-- "Every month" and "every 3 months" used to be stored as 30 and 90 days.
update tasks
  set recur_every_months = recur_every_days / 30,
      recur_every_days   = null
  where recur_every_days in (30, 90);

-- Schedules already running count on from the date they are next due.
update tasks
  set recur_from = due_date
  where recur_from is null
    and due_date is not null
    and (recur_every_days is not null or recur_every_months is not null);

alter table tasks
  add constraint tasks_one_recur_unit
    check (recur_every_days is null or recur_every_months is null);
