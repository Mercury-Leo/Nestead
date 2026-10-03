-- AI recipe reading: the family's own OpenRouter key and the free-read counter.
--
-- Run this against a database that already has the original schema.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- Apply it in one run: each table gets RLS and its revoked privileges in the
-- same transaction, so none is ever readable by a client.

begin;

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

commit;
