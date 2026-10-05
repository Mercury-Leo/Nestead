-- Shows: genres ("Action", "Comedy"), saved with the rest of a title's details.
--
-- Run this against a database that already has 20261004120000_shows.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- Existing rows get NULL: never read for genres. The Shows page offers to read
-- those again once (Get genres); a read that names no genre saves an empty
-- list, so NULL always means "not read yet". Apply this before deploying
-- genres, since adding or refreshing a show writes the column.

alter table shows add column genres text[]
  check (genres is null or (cardinality(genres) <= 10 and array_position(genres, null) is null));
