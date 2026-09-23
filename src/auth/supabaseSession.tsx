import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getSupabaseClient, takeRecoveryLink } from '../data/supabaseClient';
import { createSupabaseStore } from '../data/supabaseStore';
import type { DataStore } from '../data/types';
import { useCollection } from '../data/useCollection';
import { ensureKitchen } from '../features/larder/seed/seedKitchen';
import { seedDefaultColumns } from './defaultColumns';
import { JoinOrCreate } from './JoinOrCreate';
import type { Family } from './session';
import { SessionContext } from './session';
import { SetNewPassword } from './SetNewPassword';
import { SignIn } from './SignIn';

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
      // Filter by id explicitly. RLS returns every member of your family, not
      // just you, so relying on it to yield one row works only while you are
      // alone: the second person to join would make this return two.
      const membership = await client
        .from('members')
        .select('family_id')
        .eq('id', userId)
        .maybeSingle();
      if (membership.error !== null) throw new Error(membership.error.message);

      const familyId = membership.data?.family_id as string | undefined;
      if (familyId === undefined) {
        setPhase({ kind: 'noFamily', userId });
        return;
      }

      const row = await client.from('families').select('id, name, join_code').eq('id', familyId).single();
      if (row.error !== null) throw new Error(row.error.message);

      const store = createSupabaseStore(familyId, client);
      await seedDefaultColumns(store);
      await ensureKitchen(store);

      setPhase({
        kind: 'ready',
        userId,
        store,
        family: {
          id: row.data.id as string,
          name: row.data.name as string,
          joinCode: row.data.join_code as string,
        },
      });
    },
    [client],
  );

  useEffect(() => {
    let active = true;

    const apply = (userId: string | undefined): void => {
      if (!active) return;
      if (userId === undefined) {
        recovering.current = false;
        setPhase({ kind: 'signedOut' });
        return;
      }
      if (recovering.current === true) {
        setPhase({ kind: 'recovering', userId });
        return;
      }
      void resolve(userId);
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
      return <p className="centred">Loading…</p>;
    case 'signedOut':
      return <SignIn />;
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
      return <JoinOrCreate onJoined={() => void resolve(phase.userId)} onSignOut={signOut} />;
    case 'ready':
      return (
        <Ready userId={phase.userId} store={phase.store} family={phase.family} signOut={signOut}>
          {children}
        </Ready>
      );
  }
}

/**
 * Split out so useCollection is only called once a store exists: hooks cannot
 * be conditional, and the store does not exist in the earlier phases.
 */
function Ready({
  userId,
  store,
  family,
  signOut,
  children,
}: {
  userId: string;
  store: DataStore;
  family: Family;
  signOut: () => Promise<void>;
  children: ReactNode;
}): JSX.Element | null {
  const members = useCollection(store.members);
  const me = members.find((member) => member.id === userId) ?? null;

  if (me === null) return <p className="centred">Loading…</p>;

  return (
    <SessionContext.Provider value={{ store, me, members, family, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
