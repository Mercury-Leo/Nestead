import type { SupabaseClient } from '@supabase/supabase-js';
import type { Account, Family } from '../types';
import { toAiStatus } from './aiStatus';
import { getRememberMe, getSupabaseClient, setRememberMe, takeLinkError, takeRecoveryLink } from './supabaseClient';
import { createSupabaseStore } from './supabaseStore';

/**
 * Account on Supabase: Supabase Auth for who is signed in, and the database
 * functions in supabase/schema.sql for families.
 *
 * Joining and creating are database functions rather than client queries,
 * because RLS makes them impossible from the client: you cannot insert a
 * family whose policy requires you to be in it, and you cannot look one up by
 * a code the policy is hiding from you.
 */

function fail(error: { message: string } | null): void {
  if (error !== null) throw new Error(error.message);
}

export function createSupabaseAccount(client: SupabaseClient = getSupabaseClient()): Account {
  async function readFamily(familyId: string): Promise<Family> {
    const row = await client.from('families').select('id, name, join_code').eq('id', familyId).single();
    if (row.error !== null) throw new Error(row.error.message);
    return { id: row.data.id as string, name: row.data.name as string, joinCode: row.data.join_code as string };
  }

  return {
    watchUser(onChange) {
      let active = true;
      void client.auth.getSession().then(({ data }) => {
        if (active) onChange(data.session?.user.id ?? null, false);
      });
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (active) onChange(session?.user.id ?? null, event === 'PASSWORD_RECOVERY');
      });
      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    },
    takeRecoveryLink,
    takeLinkError,

    rememberMe: getRememberMe,
    async signIn(email, password, remember) {
      // Before signing in, so the new session lands in the right storage.
      setRememberMe(remember);
      const { error } = await client.auth.signInWithPassword({ email, password });
      fail(error);
    },
    async signUp(email, password, remember, confirmTo) {
      setRememberMe(remember);
      // Supabase only follows redirect URLs on its allow list and otherwise
      // uses the Site URL.
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: confirmTo !== undefined ? { emailRedirectTo: confirmTo } : undefined,
      });
      fail(error);
      // A user with no session means the project requires email confirmation.
      return data.session === null ? 'confirmEmail' : 'signedIn';
    },
    async sendPasswordReset(email, returnTo) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: returnTo });
      fail(error);
    },
    async setPassword(password) {
      const { error } = await client.auth.updateUser({ password });
      fail(error);
    },
    async signOut() {
      await client.auth.signOut();
    },

    /**
     * One request: the family row is embedded through members.family_id rather
     * than read after it, since this is on the way to the first screen.
     *
     * Filtered by id explicitly. RLS returns every member of your family, not
     * just you, so relying on it to yield one row works only while you are
     * alone: the second person to join would make this return two.
     */
    async readMembership(userId) {
      const { data, error } = await client
        .from('members')
        .select('family_id, families(id, name, join_code)')
        .eq('id', userId)
        .maybeSingle();
      fail(error);

      const familyId = data?.family_id as string | undefined;
      if (familyId === undefined) return null;

      const family = data?.families as { id: string; name: string; join_code: string } | null | undefined;
      // Not expected: RLS lets a member read their own family. Fall back rather than fail.
      if (family === null || family === undefined) return readFamily(familyId);
      return { id: family.id, name: family.name, joinCode: family.join_code };
    },
    readFamily,
    async createFamily(familyName, displayName) {
      const { error } = await client.rpc('create_family', { family_name: familyName, display_name: displayName });
      fail(error);
    },
    async joinFamily(code, displayName) {
      const { error } = await client.rpc('join_family', { code, display_name: displayName });
      fail(error);
    },
    async rotateJoinCode() {
      const { data, error } = await client.rpc('rotate_join_code');
      fail(error);
      return data as string;
    },
    async inviteFamilyName(code) {
      const { data, error } = await client.rpc('invite_family_name', { code });
      fail(error);
      return typeof data === 'string' ? data : null;
    },

    async accessToken() {
      // getSession() refreshes an expired session before answering.
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
    async aiStatus() {
      const { data, error } = await client.rpc('family_ai_status');
      fail(error);
      return toAiStatus(data);
    },
    async clearAiKey() {
      const { error } = await client.rpc('clear_family_ai_key');
      fail(error);
    },
    async setAiModel(model) {
      const { error } = await client.rpc('set_family_ai_model', { model });
      fail(error);
    },

    openStore: (familyId) => createSupabaseStore(familyId, client),
  };
}

let shared: Account | null = null;

/** The browser's account, on the client built from VITE_SUPABASE_*. */
export function supabaseAccount(): Account {
  if (shared === null) shared = createSupabaseAccount();
  return shared;
}
