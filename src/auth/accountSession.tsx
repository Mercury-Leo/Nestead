import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Trans } from 'react-i18next';
import type { Account, DataStore, Family } from '../data/types';
import { LoadFailed } from '../components/LoadFailed';
import { onComeBack, retryDelay } from '../data/retry';
import { retryCollections, useCollectionState } from '../data/useCollection';
import { clearInvite, pendingInvite } from './invite';
import { lastFamilyOf, openFamily, rememberFamily } from './openFamily';
import type { Started } from './openFamily';
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
 *
 * Opening the family can fail (no connection yet on a phone that just woke):
 * then it shows LoadFailed and tries again by itself, after a growing wait and
 * whenever the connection or the tab comes back.
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'recovering'; userId: string }
  | { kind: 'noFamily'; userId: string }
  | { kind: 'failed'; userId: string }
  | { kind: 'ready'; userId: string; store: DataStore; family: Family };

export function AccountSession({ account, children }: { account: Account; children: ReactNode }): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  // A reset link signs you in, but that must not let you into the app until
  // you have chosen a new password. Every auth event while this is set lands
  // on SetNewPassword instead of resolving the family.
  const recovering = useRef<boolean | null>(null);
  if (recovering.current === null) recovering.current = account.takeRecoveryLink();

  // Which user the auth events last resolved. Startup can report the same
  // session twice and a token refresh reports it again every hour; none of
  // that changes the family, so the store is kept rather than rebuilt, which
  // would drop every cached row and realtime channel.
  const resolvedFor = useRef<string | null>(null);

  // The stores begun for this user, so a try after a failure carries on with
  // the one already started (openFamily.ts).
  const started = useRef<{ userId: string; families: Started } | null>(null);
  const startedFor = (userId: string): Started => {
    if (started.current?.userId !== userId) started.current = { userId, families: new Map() };
    return started.current.families;
  };

  /** Works out which of the three states a signed-in user is actually in. */
  const resolve = useCallback(
    async (userId: string): Promise<void> => {
      const opened = await openFamily(account, userId, lastFamilyOf(userId), startedFor(userId));
      // Signed out, or someone else signed in, while this was out.
      if (resolvedFor.current !== userId) return;
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
      if (resolvedFor.current !== userId) return;
      setPhase({ kind: 'ready', userId, store: opened.store, family: opened.family });
    },
    [account],
  );

  // Failed tries in a row, which set the wait before the next; and whose try is out now.
  const failures = useRef(0);
  const opening = useRef<string | null>(null);

  /** resolve(), and on failure the failed phase, which tries again (below). */
  const attempt = useCallback(
    (userId: string): void => {
      resolvedFor.current = userId;
      if (opening.current === userId) return;
      opening.current = userId;
      resolve(userId)
        .then(
          () => {
            failures.current = 0;
          },
          (error: unknown) => {
            if (resolvedFor.current !== userId) return;
            console.warn('Could not open the family:', error);
            failures.current += 1;
            setPhase({ kind: 'failed', userId });
          },
        )
        .finally(() => {
          if (opening.current === userId) opening.current = null;
        });
    },
    [resolve],
  );

  // Every failure sets a new phase, so each one waits a little longer.
  useEffect(() => {
    if (phase.kind !== 'failed') return;
    const again = (): void => attempt(phase.userId);
    const timer = setTimeout(again, retryDelay(failures.current));
    const stop = onComeBack(again);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [phase, attempt]);

  useEffect(
    () =>
      account.watchUser((userId, recovery) => {
        if (recovery) recovering.current = true;
        if (userId === null) {
          resolvedFor.current = null;
          started.current = null;
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
        attempt(userId);
      }),
    [account, attempt],
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
            attempt(phase.userId);
          }}
          onSignOut={signOut}
        />
      );
    case 'noFamily':
      return (
        <JoinOrCreate
          account={account}
          inviteCode={pendingInvite()}
          onJoined={() => attempt(phase.userId)}
          onSignOut={signOut}
        />
      );
    case 'failed':
      return (
        <LoadFailed
          onRetry={() => {
            failures.current = 0;
            setPhase({ kind: 'loading' });
            attempt(phase.userId);
          }}
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
