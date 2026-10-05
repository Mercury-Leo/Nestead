-- Nestead — TARGET Postgres schema for the future Supabase backend.
--
-- STATUS: reviewed only. This file has NOT been applied to any project.
--
-- Scope is what the app actually does today: a kanban board, the people who
-- share it, the kitchen (recipes, pantry, diet profile, shopping list and
-- recipe photos), and activities (the family's movies and series). Prices are
-- not here, and should be added when the feature that needs them is being
-- built, not before.
--
-- It is the reference that src/domain/types.ts mirrors 1:1 (camelCase there,
-- snake_case here). Change one, change the other.
--
-- Rules this schema enforces:
--   * every family table carries family_id;
--   * RLS is on for every table, with a policy, from the moment it exists;
--   * a row is visible only when its family_id = current_family_id().
--   The AI tables (family_ai_settings, ai_usage, ai_usage_days) are the
--   deliberate exception: RLS on and no policies, reached only through security
--   definer functions; ai_usage is keyed by user and day, ai_usage_days by day,
--   so neither carries family_id.
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
  -- Days or calendar months between occurrences; both null means it does not
  -- repeat. A repeating task is one row that comes back, not a new row per
  -- occurrence, so there is no way for two clients to create the same chore
  -- twice.
  recur_every_days   integer check (recur_every_days is null or recur_every_days > 0),
  recur_every_months integer check (recur_every_months is null or recur_every_months > 0),
  -- The date the schedule counts from: monthly from 5 July is the 5th of
  -- every month. Apart from due_date so the 31st survives February.
  recur_from  date,
  done        boolean     not null default false,
  -- Attribution is nullable on purpose: it must not block deleting a member.
  -- NOT NULL plus ON DELETE SET NULL contradict, and the delete fails.
  created_by  uuid        references members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tasks_one_recur_unit
    check (recur_every_days is null or recur_every_months is null)
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

-- Tells somebody opening an invite link which family it is for, before they
-- have an account. Only the name, and only for an exact code: the code is
-- already the secret that lets you in, so whoever holds it may know whose
-- family it opens. Null for a code no family has, such as a rotated one.
create function invite_family_name(code text)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select name from families where join_code = upper(trim(code));
$fn$;

-- Functions are executable by PUBLIC unless told otherwise. The helpers are
-- internal to the definer functions above and must not be callable at all.
revoke all on function generate_join_code()         from public;
revoke all on function pick_member_color(uuid)      from public;

revoke all on function create_family(text, text)    from public;
revoke all on function join_family(text, text)      from public;
revoke all on function rotate_join_code()           from public;
revoke all on function current_family_id()          from public;
revoke all on function invite_family_name(text)     from public;

grant execute on function create_family(text, text) to authenticated;
grant execute on function join_family(text, text)   to authenticated;
grant execute on function rotate_join_code()        to authenticated;
grant execute on function current_family_id()       to authenticated;
-- Signed out too: an invite link is opened before there is an account.
grant execute on function invite_family_name(text)  to anon, authenticated;

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
-- Kitchen (Larder): recipes, pantry, diet profile, shopping list, photos
--
-- Every table is family-scoped and gets RLS and its policy in the same run,
-- like everything above. Nested structures (ingredient lines, steps, list
-- parts, diet rules) are jsonb: they are always read and written whole with
-- their recipe or item, never queried on their own.
-- ---------------------------------------------------------------------------

create table recipes (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid        not null references families (id) on delete cascade,
  title            text        not null,
  description      text,
  -- {"kind":"mine"} or {"kind":"web","url":...,"site":...}
  source           jsonb       not null,
  -- Path in the recipe-photos bucket: family id, slash, file name.
  photo_id         text,
  -- A remote image, for recipes imported from the web.
  photo_url        text,
  servings         integer     not null check (servings > 0),
  serving_unit     text,
  prep_min         integer     not null default 0 check (prep_min >= 0),
  cook_min         integer     not null default 0 check (cook_min >= 0),
  ingredients      jsonb       not null default '[]',
  equipment        jsonb       not null default '[]',
  steps            jsonb       not null default '[]',
  tags             jsonb       not null default '[]',
  kcal_per_serving integer,
  kcal_estimated   boolean     not null default false,
  source_rating    real,
  -- The family's own rating.
  user_rating      integer     check (user_rating between 1 and 5),
  created_by       uuid        references members (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- kind 'have' is the pantry ("Have now"); 'staple' is assumed always present.
create table pantry_items (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid        not null references families (id) on delete cascade,
  name         text        not null,
  canonical_id text,
  section      text        not null,
  kind         text        not null check (kind in ('have', 'staple')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One per family. The unique constraint is what stops two devices seeding a
-- new family's kitchen twice: the second insert fails and that device skips.
create table diet_profiles (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid        not null unique references families (id) on delete cascade,
  presets       jsonb       not null default '{}',
  custom        jsonb       not null default '[]',
  conflict_mode text        not null default 'hide' check (conflict_mode in ('hide', 'warn')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table list_items (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid        not null references families (id) on delete cascade,
  name         text        not null,
  canonical_id text,
  section      text        not null,
  -- 'supermarket', 'general' or a list_groups id. Text, not a foreign key,
  -- because the two built-in groups are not rows. Deleting a group moves its
  -- items to 'general' first.
  group_id     text        not null default 'supermarket',
  -- One part per recipe that needs this: recipeId, recipeTitle, qty, unit.
  -- Empty for something added by hand.
  parts        jsonb       not null default '[]',
  note         text,
  -- Added by hand: stays when the last recipe needing it leaves the list.
  manual       boolean     not null default false,
  checked      boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The family's own shopping-list groups, beside Supermarket and General.
-- Supermarket and General are not rows, but each gets one the first time it
-- is moved, marked by builtin, only to hold its position.
create table list_groups (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid        not null references families (id) on delete cascade,
  name         text        not null,
  -- Order among all the sections, built-in ones included. Nullable: rows
  -- without one stand where they always did (src/domain/kitchen/list.ts
  -- orderGroups()), which also covers an app still on an older version.
  position     double precision,
  builtin      text        check (builtin is null or builtin in ('supermarket', 'general')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One position row per built-in section; nulls are distinct, so the
  -- family's own sections are not limited.
  constraint list_groups_one_builtin unique (family_id, builtin)
);

create index recipes_family_id_idx      on recipes (family_id);
create index pantry_items_family_id_idx on pantry_items (family_id);
create index list_items_family_id_idx   on list_items (family_id);
create index list_groups_family_id_idx  on list_groups (family_id);

create trigger recipes_set_updated_at       before update on recipes
  for each row execute function set_updated_at();
create trigger pantry_items_set_updated_at  before update on pantry_items
  for each row execute function set_updated_at();
create trigger diet_profiles_set_updated_at before update on diet_profiles
  for each row execute function set_updated_at();
create trigger list_items_set_updated_at    before update on list_items
  for each row execute function set_updated_at();
create trigger list_groups_set_updated_at   before update on list_groups
  for each row execute function set_updated_at();

alter table recipes       enable row level security;
alter table pantry_items  enable row level security;
alter table diet_profiles enable row level security;
alter table list_items    enable row level security;
alter table list_groups   enable row level security;

create policy recipes_all on recipes
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy pantry_items_all on pantry_items
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy diet_profiles_all on diet_profiles
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy list_items_all on list_items
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

create policy list_groups_all on list_groups
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

alter publication supabase_realtime add table
  recipes, pantry_items, diet_profiles, list_items, list_groups;

-- Photos: a private bucket with one folder per family. The folder name is the
-- family id and these policies are the only way in, so a member reads and
-- writes their own family's photos and nobody else's.
insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', false)
on conflict (id) do nothing;

create policy recipe_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-photos'
         and (storage.foldername(name))[1] = public.current_family_id()::text);

create policy recipe_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-photos'
              and (storage.foldername(name))[1] = public.current_family_id()::text);

create policy recipe_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'recipe-photos'
         and (storage.foldername(name))[1] = public.current_family_id()::text)
  with check (bucket_id = 'recipe-photos'
              and (storage.foldername(name))[1] = public.current_family_id()::text);

create policy recipe_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-photos'
         and (storage.foldername(name))[1] = public.current_family_id()::text);

-- ---------------------------------------------------------------------------
-- Addresses: the family's address book
--
-- Family-scoped like every other table, with RLS and its policy in the same run.
-- The door code is family data: the app never puts it in a navigation link.
-- ---------------------------------------------------------------------------

create table addresses (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid        not null references families (id) on delete cascade,
  -- What the family calls it, e.g. "Dana's house".
  name         text        not null,
  city         text        not null,
  -- Street and house number, as one line.
  street       text        not null,
  apartment    text,
  door_code    text,
  created_by   uuid        references members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index addresses_family_id_idx on addresses (family_id);

create trigger addresses_set_updated_at before update on addresses
  for each row execute function set_updated_at();

alter table addresses enable row level security;

create policy addresses_all on addresses
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

alter publication supabase_realtime add table addresses;

-- ---------------------------------------------------------------------------
-- AI recipe reading: the family's own OpenRouter key and the free-read counter
--
-- The key is encrypted by the server (server/ai/crypto.ts) under a secret
-- Postgres never sees; this schema stores and hands back ciphertext only.
-- RLS is on with no policies and privileges are revoked: only the security
-- definer functions below touch these tables. None is in realtime.
-- ---------------------------------------------------------------------------

-- One row per family that has added an OpenRouter key; no row means free AI.
-- RLS on and no policies: only the security definer functions below read or
-- write it, and no client ever selects from it.
create table family_ai_settings (
  family_id      uuid primary key references families (id) on delete cascade,
  -- v1:<iv>:<ciphertext>, base64url, AES-GCM under AI_KEY_SECRET with family_id
  -- as additional data. Encrypted and decrypted by the server, never here.
  key_ciphertext text not null check (key_ciphertext ~ '^v[0-9]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
                                      and length(key_ciphertext) <= 1024),
  key_hint       text not null check (key_hint ~ '^[A-Za-z0-9_-]{4}$'),
  -- Null: the free models, run on the family key.
  -- Plain vendor/model ids only: no :online or other variants, no ~ aliases,
  -- no openrouter/* routers.
  model          text check (model is null or (model ~ '^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9._-]*(:free)?$'
                                               and model not like 'openrouter/%'
                                               and length(model) <= 100)),
  set_by         uuid references members (id) on delete set null,
  updated_at     timestamptz not null default now()
);

-- Free reads per user per UTC day, and the day's total for the whole app.
create table ai_usage (
  day     date    not null,
  user_id uuid    not null references auth.users (id) on delete cascade,
  count   integer not null check (count >= 0),
  primary key (day, user_id)
);

create table ai_usage_days (
  day   date primary key,
  count integer not null check (count >= 0)
);

alter table family_ai_settings enable row level security;
alter table ai_usage           enable row level security;
alter table ai_usage_days      enable row level security;
-- No policies. Revoked as well, so a future policy cannot open them by accident.
revoke all on family_ai_settings, ai_usage, ai_usage_days from anon, authenticated;

create trigger family_ai_settings_set_updated_at before update on family_ai_settings
  for each row execute function set_updated_at();

-- The one call per read. A family with a key gets its ciphertext and counts
-- nothing; everyone else takes one of the free reads: 5 per user and 45 for the
-- whole app per UTC day (OpenRouter resets its own free counter at 00:00 UTC).
create function claim_ai_request()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  fam      uuid := current_family_id();
  today    date := (now() at time zone 'utc')::date;
  settings family_ai_settings;
  total    integer;
  mine     integer;
begin
  if fam is null then
    return jsonb_build_object('mode', 'no-family');
  end if;

  -- A family key: hand over the ciphertext and count nothing.
  select * into settings from family_ai_settings where family_id = fam;
  if found then
    return jsonb_build_object('mode', 'family', 'family_id', fam,
                              'ciphertext', settings.key_ciphertext, 'model', settings.model);
  end if;

  -- Free: every claim takes today's global row lock, so claims run one at a
  -- time and both caps are exact.
  insert into ai_usage_days (day, count) values (today, 0) on conflict (day) do nothing;
  select count into total from ai_usage_days where day = today for update;
  select coalesce((select count from ai_usage where day = today and user_id = auth.uid()), 0) into mine;

  if mine >= 5 then
    return jsonb_build_object('mode', 'quota-exceeded', 'scope', 'user');
  end if;
  if total >= 45 then
    return jsonb_build_object('mode', 'quota-exceeded', 'scope', 'app');
  end if;

  update ai_usage_days set count = count + 1 where day = today;
  insert into ai_usage (day, user_id, count) values (today, auth.uid(), 1)
    on conflict (day, user_id) do update set count = ai_usage.count + 1;

  -- Keep a month.
  delete from ai_usage      where day < today - 30;
  delete from ai_usage_days where day < today - 30;

  return jsonb_build_object('mode', 'free');
end;
$fn$;

-- What any member may see: never the ciphertext.
create function family_ai_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  fam      uuid := current_family_id();
  today    date := (now() at time zone 'utc')::date;
  settings family_ai_settings;
  setter   text;
  mine     integer;
  total    integer;
begin
  if fam is null then
    raise exception 'You do not belong to a family';
  end if;
  select * into settings from family_ai_settings where family_id = fam;
  if found then
    select name into setter from members where id = settings.set_by;
  end if;
  select coalesce((select count from ai_usage where day = today and user_id = auth.uid()), 0) into mine;
  select coalesce((select count from ai_usage_days where day = today), 0) into total;
  return jsonb_build_object(
    'has_key',     settings.family_id is not null,
    'key_hint',    settings.key_hint,
    'model',       settings.model,
    'set_by_name', setter,
    'updated_at',  settings.updated_at,
    'free_used',   mine,
    'free_limit',  5,
    'free_left',   greatest(0, least(5 - mine, 45 - total))
  );
end;
$fn$;

-- Ciphertext made by the server for this family; replacing a key keeps the model.
create function store_family_ai_key(ciphertext text, hint text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if current_family_id() is null then
    raise exception 'You do not belong to a family';
  end if;
  insert into family_ai_settings (family_id, key_ciphertext, key_hint, set_by)
  values (current_family_id(), store_family_ai_key.ciphertext, store_family_ai_key.hint, auth.uid())
  on conflict (family_id) do update
    set key_ciphertext = excluded.key_ciphertext,
        key_hint       = excluded.key_hint,
        set_by         = excluded.set_by;
end;
$fn$;

create function clear_family_ai_key()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if current_family_id() is null then
    raise exception 'You do not belong to a family';
  end if;
  delete from family_ai_settings where family_id = current_family_id();
end;
$fn$;

-- Null or blank goes back to the free models. The model is checked here first,
-- by the same rule as the table's check: a failed check constraint's detail
-- holds the whole row, ciphertext included, and PostgREST passes details on.
create function set_family_ai_model(model text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  chosen text := nullif(trim(set_family_ai_model.model), '');
begin
  if current_family_id() is null then
    raise exception 'You do not belong to a family';
  end if;
  if chosen is not null and not (chosen ~ '^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9._-]*(:free)?$'
                                 and chosen not like 'openrouter/%'
                                 and length(chosen) <= 100) then
    raise exception 'Invalid model' using errcode = 'check_violation';
  end if;
  update family_ai_settings
     set model = chosen
   where family_id = current_family_id();
  if not found then
    raise exception 'No family key';
  end if;
end;
$fn$;

-- Supabase grants new functions to anon as well as PUBLIC: revoke both.
revoke all on function family_ai_status()                 from public, anon;
revoke all on function store_family_ai_key(text, text)    from public, anon;
revoke all on function clear_family_ai_key()              from public, anon;
revoke all on function set_family_ai_model(text)          from public, anon;
revoke all on function claim_ai_request()                 from public, anon;

grant execute on function family_ai_status()              to authenticated;
grant execute on function store_family_ai_key(text, text) to authenticated;
grant execute on function clear_family_ai_key()           to authenticated;
grant execute on function set_family_ai_model(text)       to authenticated;
grant execute on function claim_ai_request()              to authenticated;

-- ---------------------------------------------------------------------------
-- Activities: the family's movies and series (the Shows page)
--
-- Family-scoped like the kitchen: RLS and its policy in the same run, the
-- updated_at trigger, and realtime.
-- ---------------------------------------------------------------------------

-- OMDb's details are saved when a show is added, so opening the list never
-- calls OMDb (its free key allows 1,000 requests a day). fetched_at is when
-- they were read; only a refresh someone asks for reads them again.
-- poster_url is OMDb's link to Amazon's image servers: the image itself is
-- never stored, here or in Storage.
create table shows (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid        not null references families (id) on delete cascade,
  imdb_id       text        not null check (imdb_id ~ '^tt[0-9]{7,10}$'),
  kind          text        not null check (kind in ('movie', 'series')),
  title         text        not null,
  plot          text,
  poster_url    text        check (poster_url is null or poster_url like 'https://%'),
  -- 1 January of the year when OMDb has no release date.
  released      date,
  year          integer,
  runtime_min   integer     check (runtime_min is null or runtime_min > 0),
  -- Series only.
  total_seasons integer     check (total_seasons is null or total_seasons > 0),
  imdb_rating   real        check (imdb_rating is null or imdb_rating between 0 and 10),
  -- In English, as the service names them; the app translates them. Empty
  -- when a read named none; NULL on rows from before genres, until read again.
  genres        text[]      check (genres is null or (cardinality(genres) <= 10 and array_position(genres, null) is null)),
  fetched_at    timestamptz not null,
  -- dropped: the family decided not to watch it.
  status        text        not null default 'to-watch'
                            check (status in ('to-watch', 'watching', 'watched', 'dropped')),
  -- Set when the status becomes watched, cleared when it leaves it.
  watched_at    timestamptz,
  -- A family favourite, one they would watch again. Independent of status.
  favorite      boolean     not null default false,
  created_by    uuid        references members (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- One row per title per family. Two devices adding it at once: the second
  -- insert fails and that device opens the first one's row. The index behind
  -- it leads with family_id, so it also serves the family's list.
  constraint shows_one_per_title unique (family_id, imdb_id)
);

create trigger shows_set_updated_at before update on shows
  for each row execute function set_updated_at();

alter table shows enable row level security;

create policy shows_all on shows
  for all to authenticated using (family_id = current_family_id())
  with check (family_id = current_family_id());

alter publication supabase_realtime add table shows;

-- ---------------------------------------------------------------------------
-- Known limits
-- ---------------------------------------------------------------------------

-- join_family() is not rate limited. 32^8 is about 1.1 trillion codes, so
-- guessing one is impractical, but a determined attacker is throttled only by
-- the platform's own limits. If that ever matters, log attempts per user and
-- refuse after a handful. invite_family_name() is callable signed out, so
-- it is the same guess without an account; it reveals only a family's name.
--
-- One family per person, as noted on the members table.
--
-- Last write wins. There is no merge or conflict detection: two people editing
-- one row means the later update overwrites the earlier wholesale.
