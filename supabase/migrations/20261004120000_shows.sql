-- Activities: the family's list of movies and series (the Shows page).
--
-- Run this against a database that already has the original schema.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- Apply it in one run: the table gets RLS and its policy in the same
-- transaction, so it is never readable without one.

begin;

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
  fetched_at    timestamptz not null,
  status        text        not null default 'to-watch'
                            check (status in ('to-watch', 'watching', 'watched')),
  -- Set when the status becomes watched, cleared when it leaves it.
  watched_at    timestamptz,
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

commit;
