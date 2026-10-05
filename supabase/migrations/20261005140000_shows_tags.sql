-- Shows: tags, the family's own labels for a show ("Bad movie").
--
-- Run this against a database that already has 20261004120000_shows.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- Existing rows get an empty list. Members type tags on a show; they are kept
-- as typed, never translated, and shared by the whole family. Apply this
-- before deploying tags: saving a show's tags writes the column.

alter table shows add column tags text[] not null default '{}'
  check (cardinality(tags) <= 20 and array_position(tags, null) is null);
