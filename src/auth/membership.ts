import type { SupabaseClient } from '@supabase/supabase-js';
import type { Family } from './session';

/** Reads the family row. */
export async function readFamily(client: SupabaseClient, familyId: string): Promise<Family> {
  const row = await client.from('families').select('id, name, join_code').eq('id', familyId).single();
  if (row.error !== null) throw new Error(row.error.message);
  return {
    id: row.data.id as string,
    name: row.data.name as string,
    joinCode: row.data.join_code as string,
  };
}

/**
 * The family a signed-in user belongs to, or null if they have not joined one.
 *
 * One request: the family row is embedded through members.family_id rather
 * than read after it, since this is on the way to the first screen.
 *
 * Filtered by id explicitly. RLS returns every member of your family, not just
 * you, so relying on it to yield one row works only while you are alone: the
 * second person to join would make this return two.
 */
export async function readMembership(client: SupabaseClient, userId: string): Promise<Family | null> {
  const { data, error } = await client
    .from('members')
    .select('family_id, families(id, name, join_code)')
    .eq('id', userId)
    .maybeSingle();
  if (error !== null) throw new Error(error.message);

  const familyId = data?.family_id as string | undefined;
  if (familyId === undefined) return null;

  const family = data?.families as { id: string; name: string; join_code: string } | null | undefined;
  // Not expected: RLS lets a member read their own family. Fall back rather than fail.
  if (family === null || family === undefined) return readFamily(client, familyId);
  return { id: family.id, name: family.name, joinCode: family.join_code };
}
