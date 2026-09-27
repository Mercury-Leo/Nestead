import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Trans } from 'react-i18next';
import { preloadStore, withCache } from '../data/cache';
import { getSupabaseClient, takeRecoveryLink } from '../data/supabase/supabaseClient';
import { createSupabaseStore } from '../data/supabase/supabaseStore';
import type { DataStore } from '../data/types';
import { useCollection } from '../data/useCollection';
import { ensureKitchen } from '../features/larder/setup';
import { seedDefaultColumns } from '../features/board/defaultColumns';
import { clearInvite, pendingInvite } from './invite';
import { readFamily, readMembership } from './membership';
import { JoinOrCreate } from './screens/JoinOrCreate';
import type { Family } from './session';
import { SessionContext } from './session';
import { SetNewPassword } from './screens/SetNewPassword';
import { SignIn } from './screens/SignIn';

/**
 * The real session.
 *
 * Being signed in and being in a family are different things. A new account has
 * an auth.users row and no members row, so current_family_id() returns null and
 * RLS denies everything. That in-between state is a screen, not an error.
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'recovering'; userId: string }
  | { kind: 'noFamily'; userId: string }
  | { kind: 'ready'; userId: string; store: DataStore; family: Family };

export function SupabaseSession({ children }: { children: ReactNode }): JSX.Element {
  const client = getSupabaseClient();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  // A reset link signs you in, but that must not let you into the app until
  // you have chosen a new password. Every auth event while this is set lands
  // on SetNewPassword instead of resolving the family.
  const recovering = useRef<boolean | null>(null);
  if (recovering.current === null) recovering.current = takeRecoveryLink();

  /** Works out which of the three states a signed-in user is actually in. */
  const resolve = useCallback(
    async (userId: string): Promise<void> => {
      const family = await readMembership(client, userId);
      if (family === null) {
        setPhase({ kind: 'noFamily', userId });
        return;
      }

      // Already in a family (one per person), so an invite opened on this
      // device has nothing left to do.
      clearInvite();

      // Every table starts loading now, alongside the setup below, so the
      // board and the kitchen have their rows by the time they mount.
      const store = withCache(createSupabaseStore(family.id, client));
      preloadStore(store);
      await Promise.all([seedDefaultColumns(store), ensureKitchen(store)]);

      setPhase({ kind: 'ready', userId, store, family });
    },
    [client],
  );

  // Which user the auth events last resolved. Startup reports the same session
  // twice (getSession and INITIAL_SESSION) and a token refresh reports it again
  // every hour; none of that changes the family, so the store is kept rather
  // than rebuilt, which would drop every cached row and realtime channel.
  const resolvedFor = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const apply = (userId: string | undefined): void => {
      if (!active) return;
      if (userId === undefined) {
        resolvedFor.current = null;
        recovering.current = false;
        setPhase({ kind: 'signedOut' });
        return;
      }
      if (recovering.current === true) {
        resolvedFor.current = null;
        setPhase({ kind: 'recovering', userId });
        return;
      }
      if (resolvedFor.current === userId) return;
      resolvedFor.current = userId;
      void resolve(userId).catch((error: unknown) => {
        // Let the next auth event try again.
        resolvedFor.current = null;
        throw error;
      });
    };

    void client.auth.getSession().then(({ data }) => apply(data.session?.user.id));

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recovering.current = true;
      apply(session?.user.id);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [client, resolve]);

  const signOut = useCallback(async (): Promise<void> => {
    await client.auth.signOut();
  }, [client]);

  switch (phase.kind) {
    case 'loading':
      return (
        <p className="centred">
          <Trans i18nKey="common.loading" />
        </p>
      );
    case 'signedOut':
      return <SignIn inviteCode={pendingInvite()} />;
    case 'recovering':
      return (
        <SetNewPassword
          onDone={() => {
            recovering.current = false;
            void resolve(phase.userId);
          }}
          onSignOut={signOut}
        />
      );
    case 'noFamily':
      return <JoinOrCreate inviteCode={pendingInvite()} onJoined={() => void resolve(phase.userId)} onSignOut={signOut} />;
    case 'ready':
      return (
        <Ready client={client} userId={phase.userId} store={phase.store} initialFamily={phase.family} signOut={signOut}>
          {children}
        </Ready>
      );
  }
}

/**
 * Split out so useCollection is only called once a store exists: hooks cannot
 * be conditional, and the store does not exist in the earlier phases.
 *
 * The family is state here, not a prop, so a rotated join code shows up
 * without going back through resolve() and reseeding.
 */
function Ready({
  client,
  userId,
  store,
  initialFamily,
  signOut,
  children,
}: {
  client: SupabaseClient;
  userId: string;
  store: DataStore;
  initialFamily: Family;
  signOut: () => Promise<void>;
  children: ReactNode;
}): JSX.Element | null {
  const members = useCollection(store.members);
  const me = members.find((member) => member.id === userId) ?? null;
  const [family, setFamily] = useState(initialFamily);

  const rotateJoinCode = useCallback(async (): Promise<void> => {
    const { data, error } = await client.rpc('rotate_join_code');
    if (error !== null) throw new Error(error.message);
    setFamily((current) => ({ ...current, joinCode: data as string }));
  }, [client]);

  const refreshFamily = useCallback(async (): Promise<void> => {
    setFamily(await readFamily(client, initialFamily.id));
  }, [client, initialFamily.id]);

  if (me === null) {
    return (
      <p className="centred">
        <Trans i18nKey="common.loading" />
      </p>
    );
  }

  return (
    <SessionContext.Provider value={{ store, me, members, family, rotateJoinCode, refreshFamily, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
