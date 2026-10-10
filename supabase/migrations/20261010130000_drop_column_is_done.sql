-- Board: columns no longer mark tasks done; the tick on the card does
-- (20261010120000_board_done_tasks.sql).
--
-- Apply this only AFTER the code that stopped writing is_done is deployed:
-- the app before it sends is_done when someone adds a column, and that insert
-- fails once the column is gone.
--
-- schema.sql already has this change, so a fresh project needs only that file.

alter table board_columns drop column is_done;
