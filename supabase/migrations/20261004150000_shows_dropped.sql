-- Shows: a fourth status, dropped, for a show the family decided not to watch.
--
-- Run this against a database that already has 20261004120000_shows.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- The status check is replaced in one transaction, so no row can slip in
-- between without one. Existing rows all hold one of the first three values.

begin;

alter table shows drop constraint shows_status_check;

alter table shows add constraint shows_status_check
  check (status in ('to-watch', 'watching', 'watched', 'dropped'));

commit;
