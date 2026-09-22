-- Task descriptions.
--
-- Run this against a database that already has the original schema.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.

alter table tasks
  add column description text;

comment on column tasks.description is
  'Plain-text notes; null means none.';
