-- Addresses: the family's address book.
--
-- Run this against a database that already has the original schema.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- Apply it in one run: the table gets RLS and its policy in the same
-- transaction, so it is never readable without one.

begin;

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

commit;
