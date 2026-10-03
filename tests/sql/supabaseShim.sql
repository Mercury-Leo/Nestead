-- Just enough of a Supabase project for supabase/schema.sql to load in PGlite.
-- auth.uid() reads request.jwt.claim.sub, as PostgREST sets it from the token.
create schema if not exists extensions;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
-- Supabase grants every new table and function in public to these roles, and
-- schema.sql then revokes what it must not leave open. Without these defaults
-- the privilege tests would pass even if schema.sql revoked nothing.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create publication supabase_realtime;
