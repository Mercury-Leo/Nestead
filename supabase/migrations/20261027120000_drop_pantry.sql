-- Kitchen: the pantry is gone. Keeping track of what the family has did not
-- work out, so the app no longer reads or writes pantry_items; the shopping
-- list skips a fixed set of staples instead (src/domain/kitchen/staples.ts).
--
-- Apply this only AFTER the code without the pantry is deployed AND family
-- devices have had time to reload onto it. A tab still on the build before
-- reads pantry_items with the rest of the kitchen, and once the table is gone
-- that read fails, so its kitchen pages show "didn't arrive" until it reloads.
--
-- Dropping the table takes its rows, index, trigger, policy and its place in
-- the realtime publication with it. The rows cannot be brought back.
--
-- schema.sql already has this change, so a fresh project needs only that file.

drop table if exists pantry_items;
