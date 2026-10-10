import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Throws unless the client holds a session. Without one, supabase-js sends the
 * publishable key in place of the member's token, and RLS answers a family
 * read as it would a stranger's: no rows, and no error. That happens while a
 * token refresh is failing (a phone waking with no signal yet): a list would
 * look emptied, membership would say "no family", and setup would seed
 * default columns into a family that has them. A throw is retried
 * (`../cache.ts`, `../../auth/accountSession.tsx`); an empty answer would be
 * believed.
 */
export async function requireSession(client: SupabaseClient): Promise<void> {
  const { data, error } = await client.auth.getSession();
  if (data.session === null) throw new Error(error === null ? 'Not signed in' : `Not signed in: ${error.message}`);
}

/**
 * A request refused for an expired token that this device thought was still
 * fresh: its clock is behind the server's. Refreshing now gets a token the
 * server accepts in time for the next try.
 */
export function refreshIfExpired(client: SupabaseClient, message: string): void {
  if (/jwt expired/i.test(message)) void client.auth.refreshSession().catch(() => undefined);
}
