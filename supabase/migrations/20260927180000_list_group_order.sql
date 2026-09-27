-- Shopping-list sections in the family's own order.
--
-- Run this against a database that already has the original schema.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- Sections are dragged into order like board columns, and every device sees
-- the same order. Supermarket and General are not rows, so each gets one the
-- first time it is moved, marked by builtin, only to hold its position.

alter table list_groups
  -- Nullable: an app still running the previous version creates sections
  -- without one, and the app places those after the rest, as it always did.
  add column position double precision,
  add column builtin text
    check (builtin is null or builtin in ('supermarket', 'general')),
  -- One position row per built-in section. The second of two devices moving
  -- Supermarket for the first time at once is turned away and moves the first
  -- device's row instead. Nulls are distinct, so the family's own sections
  -- are not limited.
  add constraint list_groups_one_builtin unique (family_id, builtin);

comment on column list_groups.position is
  'Order among all the sections, Supermarket and General included. See src/domain/kitchen/list.ts orderGroups().';
comment on column list_groups.builtin is
  'Set on the row holding Supermarket''s or General''s position; null for the family''s own sections.';

-- Keep today's order: Supermarket (1000) and General (2000) first, then each
-- family's own sections in the order they were made, from 3000. The app
-- assumes the same numbers for rows that have none.
update list_groups
  set position = ordered.n * 1000 + 2000
  from (
    select id, row_number() over (partition by family_id order by created_at, id) as n
    from list_groups
  ) as ordered
  where list_groups.id = ordered.id;
