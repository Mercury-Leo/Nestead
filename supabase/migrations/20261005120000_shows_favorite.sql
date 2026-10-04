-- Shows: a favourite star, for a show the family would watch again.
--
-- Run this against a database that already has 20261004120000_shows.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- A constant default fills existing rows without rewriting the table: every
-- show starts unstarred. Apply it before deploying the star, since starring
-- writes this column.

alter table shows add column favorite boolean not null default false;
