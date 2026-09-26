-- The family name behind an invite link.
--
-- Run this against a database that already has the original schema.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.

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

revoke all on function invite_family_name(text) from public;
grant execute on function invite_family_name(text) to anon, authenticated;
