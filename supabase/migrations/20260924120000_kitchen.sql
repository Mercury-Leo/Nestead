-- Kitchen (Larder): recipes, pantry, diet profile, shopping list and photos.
--
-- Run this against a database that already has the original schema.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- Apply it in one run: each table gets RLS and its policy in the same
-- transaction, so none is ever readable without one.

begin;

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
  -- One part per recipe that needs this: recipeId, recipeTitle, qty, unit.
  parts        jsonb       not null default '[]',
  checked      boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index recipes_family_id_idx      on recipes (family_id);
create index pantry_items_family_id_idx on pantry_items (family_id);
create index list_items_family_id_idx   on list_items (family_id);

create trigger recipes_set_updated_at       before update on recipes
  for each row execute function set_updated_at();
create trigger pantry_items_set_updated_at  before update on pantry_items
  for each row execute function set_updated_at();
create trigger diet_profiles_set_updated_at before update on diet_profiles
  for each row execute function set_updated_at();
create trigger list_items_set_updated_at    before update on list_items
  for each row execute function set_updated_at();

alter table recipes       enable row level security;
alter table pantry_items  enable row level security;
alter table diet_profiles enable row level security;
alter table list_items    enable row level security;

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

alter publication supabase_realtime add table
  recipes, pantry_items, diet_profiles, list_items;

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

commit;
