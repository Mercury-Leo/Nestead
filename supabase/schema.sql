-- Nestead — TARGET Postgres schema for the future Supabase backend.
--
-- STATUS: reviewed only. This file has NOT been applied to any project.
--
-- Scope is what the app actually does today: a kanban board and the people who
-- share it. Recipes, shopping lists, photos and prices are not here, and should
-- be added when the feature that needs them is being built, not before.
--
-- It is the reference that src/domain/types.ts mirrors 1:1 (camelCase there,
-- snake_case here). Change one, change the other.
--
-- Rules this schema enforces:
--   * every family table carries family_id;
--   * RLS is on for every table, with a policy, from the moment it exists;
--   * a row is visible only when its family_id = current_family_id().
--
-- Apply it in one run. RLS without policies denies everything, and a table that
-- exists before its policy does is briefly world-readable to anyone holding the
-- publishable key.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Families and membership
-- ---------------------------------------------------------------------------

create table families (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  -- Short code used to join a family. Never a shared password: each person
  -- still signs in with their own account. Rotatable, see rotate_join_code().
  join_code   text        not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per person. id IS the auth.users id, so auth.uid() joins straight in.
-- A person therefore belongs to exactly one family. That is a deliberate
-- simplification: supporting several would make current_family_id() a choice
-- rather than a lookup, and every policy would have to follow.
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
-- own RLS policy. search_path is pinned so the definer rights cannot be
-- redirected at a shadowed table.
--
-- Returns NULL for a signed-in user who has not joined a family yet. Every
-- policy then compares against NULL, which is not true, so access is denied.
-- Fail-closed by construction.
-- ---------------------------------------------------------------------------

create function current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select family_id from members where id = auth.uid();
$fn$;

-- ---------------------------------------------------------------------------
-- The board
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

create table tasks (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid        not null references families (id) on delete cascade,
  title       text        not null,
  -- A single emoji, stored as text. No icon set, no assets.
  icon        text,
  -- Plain-text notes; null means none.
  description text,
  -- restrict, not cascade: deleting a column must not silently bin its tasks.
  -- The board blocks deleting a column that still has any.
  column_id   uuid        not null references board_columns (id) on delete restrict,
  position    double precision not null,
  assignee_id uuid        references members (id) on delete set null,
  -- When the task next comes round, or just a deadline for a one-off.
  due_date    date,
  -- Days between occurrences; null means it does not repeat. A repeating task
  -- is one row that comes back, not a new row per occurrence, so there is no
  -- way for two clients to create the same chore twice.
  recur_every_days integer check (recur_every_days is null or recur_every_days > 0),
  done        boolean     not null default false,
  -- Attribution is nullable on purpose: it must not block deleting a member.
  -- NOT NULL plus ON DELETE SET NULL contradict, and the delete fails.
  created_by  uuid        references members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index board_columns_family_id_idx on board_columns (family_id);
create index tasks_family_id_idx         on tasks (family_id);
create index tasks_column_id_idx         on tasks (column_id);

-- ---------------------------------------------------------------------------
-- updated_at
--
-- `default now()` only fires on insert, so without this trigger updated_at
-- would never move and the data-store contract would fail.
--
-- clock_timestamp() rather than now(): now() is the transaction start time and
-- is identical for two statements in one transaction, which would break the
-- contract's requirement that updated_at strictly increases. The trigger is
-- BEFORE UPDATE only, so a freshly inserted row still has created_at and
-- updated_at exactly equal, which the contract also requires.
-- ---------------------------------------------------------------------------

create function set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$fn$;

create trigger families_set_updated_at      before update on families
  for each row execute function set_updated_at();
create trigger members_set_updated_at       before update on members
  for each row execute function set_updated_at();
create trigger board_columns_set_updated_at before update on board_columns
  for each row execute function set_updated_at();
create trigger tasks_set_updated_at         before update on tasks
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table families      enable row level security;
alter table members       enable row level security;
alter table board_columns enable row level security;
alter table tasks         enable row level security;

-- families is keyed by id rather than family_id. There is no insert policy on
-- purpose: families are only ever created through create_family().
create policy families_read on families
  for select to authenticated using (id = current_family_id());

create policy families_write on families
  for update to authenticated using (id = current_family_id())
  with check (id = current_family_id());

create policy members_all on members
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy board_columns_all on board_columns
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy tasks_all on tasks
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

-- ---------------------------------------------------------------------------
-- Creating and joining a family
--
-- Both run SECURITY DEFINER because RLS makes them impossible from the client:
-- you cannot insert a family whose own policy requires you to be in it, and you
-- cannot look up a family by a code that the policy is busy hiding from you.
-- ---------------------------------------------------------------------------

-- 8 characters from a 32-symbol alphabet with I, O, 0 and 1 removed, so a code
-- can be read aloud without ambiguity. 32 divides 256 exactly, so taking bytes
-- modulo the alphabet length introduces no bias.
create function generate_join_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  for attempt in 1..20 loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
    end loop;
    if not exists (select 1 from families where join_code = code) then
      return code;
    end if;
  end loop;
  raise exception 'Could not generate a unique join code';
end;
$fn$;

-- Colours are handed out round-robin so two people never look alike.
create function pick_member_color(target_family uuid)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select (array['#4f8ef7', '#e8734a', '#3fa96b', '#a05fd3', '#d64580', '#c99700'])
         [1 + (select count(*) from members where family_id = target_family) % 6];
$fn$;

create function create_family(family_name text, display_name text)
returns families
language plpgsql
security definer
set search_path = public
as $fn$
declare
  new_family families;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from members where id = auth.uid()) then
    raise exception 'You already belong to a family';
  end if;

  insert into families (name, join_code)
  values (family_name, generate_join_code())
  returning * into new_family;

  insert into members (id, family_id, name, color)
  values (auth.uid(), new_family.id, display_name, pick_member_color(new_family.id));

  return new_family;
end;
$fn$;

create function join_family(code text, display_name text)
returns families
language plpgsql
security definer
set search_path = public
as $fn$
declare
  target families;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from members where id = auth.uid()) then
    raise exception 'You already belong to a family';
  end if;

  select * into target from families where join_code = upper(trim(code));
  if target.id is null then
    raise exception 'No family has that code';
  end if;

  insert into members (id, family_id, name, color)
  values (auth.uid(), target.id, display_name, pick_member_color(target.id));

  return target;
end;
$fn$;

-- Lets a family invalidate a code that has been shared too widely.
create function rotate_join_code()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  new_code text;
begin
  if current_family_id() is null then
    raise exception 'You do not belong to a family';
  end if;
  new_code := generate_join_code();
  update families set join_code = new_code where id = current_family_id();
  return new_code;
end;
$fn$;

-- Functions are executable by PUBLIC unless told otherwise. The helpers are
-- internal to the definer functions above and must not be callable at all.
revoke all on function generate_join_code()         from public;
revoke all on function pick_member_color(uuid)      from public;

revoke all on function create_family(text, text)    from public;
revoke all on function join_family(text, text)      from public;
revoke all on function rotate_join_code()           from public;
revoke all on function current_family_id()          from public;

grant execute on function create_family(text, text) to authenticated;
grant execute on function join_family(text, text)   to authenticated;
grant execute on function rotate_join_code()        to authenticated;
grant execute on function current_family_id()       to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
--
-- This is what makes Collection.subscribe() fire for other clients, the same
-- guarantee the storage event provides for the local backend.
--
-- Default replica identity (primary key) is enough: subscribe() only needs to
-- know that something changed and then re-reads through RLS. REPLICA IDENTITY
-- FULL would ship whole old rows to clients and is not wanted here.
--
-- supabase_realtime already exists on a Supabase project. On plain Postgres,
-- create the publication first.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  members, board_columns, tasks;

-- ---------------------------------------------------------------------------
-- Known limits
-- ---------------------------------------------------------------------------

-- join_family() is not rate limited. 32^8 is about 1.1 trillion codes, so
-- guessing one is impractical, but a determined attacker is throttled only by
-- the platform's own limits. If that ever matters, log attempts per user and
-- refuse after a handful.
--
-- One family per person, as noted on the members table.
--
-- Last write wins. There is no merge or conflict detection: two people editing
-- one row means the later update overwrites the earlier wholesale.
