import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Trans } from 'react-i18next';
import type { Account, DataStore, Family } from '../data/types';
import { LoadFailed } from '../components/LoadFailed';
import { retryCollections, useCollectionState } from '../data/useCollection';
import { clearInvite, pendingInvite } from './invite';
import { lastFamilyOf, openFamily, rememberFamily } from './openFamily';
import { JoinOrCreate } from './screens/JoinOrCreate';
import { SessionContext } from './session';
import { SetNewPassword } from './screens/SetNewPassword';
import { SignIn } from './screens/SignIn';

/**
 * The real session, on whichever backend `account` belongs to.
 *
 * Being signed in and being in a family are different things. A new account
 * has no member row, so the backend shows it nothing. That in-between state is
 * a screen, not an error.
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'recovering'; userId: string }
  | { kind: 'noFamily'; userId: string }
  | { kind: 'ready'; userId: string; store: DataStore; family: Family };

export function AccountSession({ account, children }: { account: Account; children: ReactNode }): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  // A reset link signs you in, but that must not let you into the app until
  // you have chosen a new password. Every auth event while this is set lands
  // on SetNewPassword instead of resolving the family.
  const recovering = useRef<boolean | null>(null);
  if (recovering.current === null) recovering.current = account.takeRecoveryLink();

  /** Works out which of the three states a signed-in user is actually in. */
  const resolve = useCallback(
    async (userId: string): Promise<void> => {
      const opened = await openFamily(account, userId, lastFamilyOf(userId));
      if (opened === null) {
        // Out of the family this device remembered: stop guessing it.
        rememberFamily(userId, null);
        setPhase({ kind: 'noFamily', userId });
        return;
      }

      // Already in a family (one per person), so an invite opened on this
      // device has nothing left to do.
      clearInvite();
      rememberFamily(userId, opened.family.id);

      await opened.setup;
      setPhase({ kind: 'ready', userId, store: opened.store, family: opened.family });
    },
    [account],
  );

  // Which user the auth events last resolved. Startup can report the same
  // session twice and a token refresh reports it again every hour; none of
  // that changes the family, so the store is kept rather than rebuilt, which
  // would drop every cached row and realtime channel.
  const resolvedFor = useRef<string | null>(null);

  useEffect(
    () =>
      account.watchUser((userId, recovery) => {
        if (recovery) recovering.current = true;
        if (userId === null) {
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
      }),
    [account, resolve],
  );

  const signOut = useCallback((): Promise<void> => account.signOut(), [account]);

  switch (phase.kind) {
    case 'loading':
      return (
        <p className="centred">
          <Trans i18nKey="common.loading" />
        </p>
      );
    case 'signedOut':
      return <SignIn account={account} inviteCode={pendingInvite()} />;
    case 'recovering':
      return (
        <SetNewPassword
          account={account}
          onDone={() => {
            recovering.current = false;
            void resolve(phase.userId);
          }}
          onSignOut={signOut}
        />
      );
    case 'noFamily':
      return (
        <JoinOrCreate
          account={account}
          inviteCode={pendingInvite()}
          onJoined={() => void resolve(phase.userId)}
          onSignOut={signOut}
        />
      );
    case 'ready':
      return (
        <Ready account={account} userId={phase.userId} store={phase.store} initialFamily={phase.family} signOut={signOut}>
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
  account,
  userId,
  store,
  initialFamily,
  signOut,
  children,
}: {
  account: Account;
  userId: string;
  store: DataStore;
  initialFamily: Family;
  signOut: () => Promise<void>;
  children: ReactNode;
}): JSX.Element | null {
  const { rows: members, loaded, failed } = useCollectionState(store.members);
  const me = members.find((member) => member.id === userId) ?? null;
  const [family, setFamily] = useState(initialFamily);

  const rotateJoinCode = useCallback(async (): Promise<void> => {
    const joinCode = await account.rotateJoinCode();
    setFamily((current) => ({ ...current, joinCode }));
  }, [account]);

  const refreshFamily = useCallback(async (): Promise<void> => {
    setFamily(await account.readFamily(initialFamily.id));
  }, [account, initialFamily.id]);

  const ai = useMemo(
    () => ({
      token: () => account.accessToken(),
      status: () => account.aiStatus(),
      clearKey: () => account.clearAiKey(),
      setModel: (model: string | null) => account.setAiModel(model),
    }),
    [account],
  );

  if (me === null) {
    if (failed && !loaded) return <LoadFailed onRetry={() => retryCollections(store.members)} />;
    return (
      <p className="centred">
        <Trans i18nKey="common.loading" />
      </p>
    );
  }

  return (
    <SessionContext.Provider value={{ store, me, members, family, rotateJoinCode, refreshFamily, ai, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
