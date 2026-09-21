-- Nestead — TARGET Postgres schema for the future Supabase backend.
--
-- STATUS: reviewed only. This file has NOT been applied to any project. It is
-- the reference the domain types in src/domain/types.ts mirror 1:1 (camelCase
-- there, snake_case here). Nothing in src/ talks to Supabase yet.
--
-- Rules this schema enforces:
--   * every family table carries family_id;
--   * RLS is on for every family table;
--   * a row is visible only when its family_id = current_family_id().

-- ---------------------------------------------------------------------------
-- Families and membership
-- ---------------------------------------------------------------------------

create table families (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  -- Short human-typeable code used to join a family. Never a shared password:
  -- each person still signs in with their own account.
  join_code   text        not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per person. id IS the auth.users id, so auth.uid() joins straight in.
create table members (
  id          uuid primary key references auth.users (id) on delete cascade,
  family_id   uuid        not null references families (id) on delete cascade,
  name        text        not null,
  color       text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index members_family_id_idx on members (family_id);

-- ---------------------------------------------------------------------------
-- current_family_id(): the one function every policy is built on.
--
-- SECURITY DEFINER so it can read members without recursing through members'
-- own RLS policy. search_path is pinned for safety.
-- ---------------------------------------------------------------------------

create function current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from members where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Family tables
-- ---------------------------------------------------------------------------

-- Kanban columns. Families add, rename, reorder and delete these themselves,
-- so the defaults are seeded only when a family has none at all.
create table board_columns (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid        not null references families (id) on delete cascade,
  name        text        not null,
  -- Sparse ordering: new rows take the midpoint between their neighbours, so
  -- moving one card rewrites one row. See src/domain/position.ts.
  position    double precision not null,
  -- Tasks in this column count as complete; mirrored onto tasks.done.
  is_done     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table recipes (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid        not null references families (id) on delete cascade,
  title       text        not null,
  -- [{ "name": "Flour", "qty": "500g" }, ...] — mirrors Ingredient[].
  ingredients jsonb       not null default '[]'::jsonb,
  steps       text        not null default '',
  photo_url   text,
  created_by  uuid        not null references members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table shopping_lists (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid        not null references families (id) on delete cascade,
  name        text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table shopping_items (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid        not null references families (id) on delete cascade,
  list_id     uuid        not null references shopping_lists (id) on delete cascade,
  name        text        not null,
  qty         text,
  checked     boolean     not null default false,
  added_by    uuid        not null references members (id) on delete set null,
  recipe_id   uuid        references recipes (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table tasks (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid        not null references families (id) on delete cascade,
  title       text        not null,
  -- A single emoji, stored as text. No icon set, no assets.
  icon        text,
  column_id   uuid        not null references board_columns (id) on delete restrict,
  position    double precision not null,
  assignee_id uuid        references members (id) on delete set null,
  due_date    date,
  done        boolean     not null default false,
  created_by  uuid        not null references members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Cached price lookups, so a family shares one set of results.
create table prices (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid        not null references families (id) on delete cascade,
  query       text        not null,
  store       text        not null,
  item        text        not null,
  price       numeric(10, 2) not null,
  currency    text        not null default 'GBP',
  unit        text        not null default 'each',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index recipes_family_id_idx        on recipes (family_id);
create index shopping_lists_family_id_idx on shopping_lists (family_id);
create index shopping_items_family_id_idx on shopping_items (family_id);
create index shopping_items_list_id_idx   on shopping_items (list_id);
create index board_columns_family_id_idx on board_columns (family_id);
create index tasks_family_id_idx          on tasks (family_id);
create index tasks_column_id_idx          on tasks (column_id);
create index prices_family_id_idx         on prices (family_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table families       enable row level security;
alter table members        enable row level security;
alter table board_columns  enable row level security;
alter table recipes        enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_items enable row level security;
alter table tasks          enable row level security;
alter table prices         enable row level security;

-- families is keyed by id rather than family_id.
create policy families_read on families
  for select using (id = current_family_id());

create policy families_write on families
  for update using (id = current_family_id())
  with check (id = current_family_id());

create policy members_all on members
  for all using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy board_columns_all on board_columns
  for all using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy recipes_all on recipes
  for all using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy shopping_lists_all on shopping_lists
  for all using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy shopping_items_all on shopping_items
  for all using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy tasks_all on tasks
  for all using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy prices_all on prices
  for all using (family_id = current_family_id())
  with check (family_id = current_family_id());

-- ---------------------------------------------------------------------------
-- TODO before this schema is applied
-- ---------------------------------------------------------------------------

-- TODO: create_family(name text) returns families
--   Security definer. Inserts a families row with a freshly generated
--   join_code, then inserts a members row for auth.uid() pointing at it.
--   Must reject callers who already belong to a family.

-- TODO: join_family(code text) returns families
--   Security definer. Looks the family up by join_code and inserts a members
--   row for auth.uid(). Needed because RLS hides a family the caller has not
--   joined yet, so the lookup cannot happen from the client. Rate-limit or
--   expire codes so they cannot be brute-forced.

-- TODO: photos Storage bucket
--   Private bucket "photos", objects keyed <family_id>/<uuid>.jpg. Add storage
--   policies on storage.objects mirroring the table policies, i.e.
--   (bucket_id = 'photos' and (storage.foldername(name))[1] = current_family_id()::text)
--   for select/insert/update/delete. This replaces src/data/localBlobs.ts.

-- TODO: realtime publication
--   alter publication supabase_realtime add table
--     members, board_columns, recipes, shopping_lists, shopping_items, tasks;
--   This is what makes Collection.subscribe() fire for other clients, the same
--   guarantee the storage event provides for the local backend.
