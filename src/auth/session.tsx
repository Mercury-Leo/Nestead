import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { DataStore } from '../data/types';
import type { Member } from '../domain/types';
import { DemoSession } from './demoSession';
import { SupabaseSession } from './supabaseSession';

/**
 * Who you are and which family's data you get. Screens read this and never ask
 * how it was decided.
 *
 * There are two implementations. The local backend has no accounts, so
 * DemoSession lets you pick a member per tab. The supabase backend signs you in
 * for real. Both provide the same shape, which is the point: the board does not
 * change when auth becomes real.
 */

export interface Family {
  id: string;
  name: string;
  /** Share this so somebody can join. Rotatable, see Session.rotateJoinCode. */
  joinCode: string;
}

export interface Session {
  store: DataStore;
  me: Member;
  members: Member[];
  /** Ends the session. In demo mode it just forgets which member you picked. */
  signOut: () => Promise<void>;
  /** Real auth only: there is no family row to read in demo mode. */
  family?: Family;
  /**
   * Real auth only. Swaps the join code for a fresh one; the old code stops
   * working at once. Members already in the family are unaffected.
   */
  rotateJoinCode?: () => Promise<void>;
  /**
   * Real auth only. Re-reads the family row. families is not in the realtime
   * publication, so a code rotated by someone else only shows up this way.
   */
  refreshFamily?: () => Promise<void>;
  /** Demo mode only: with real auth you cannot choose to be someone else. */
  setMe?: (memberId: string) => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('useSession() must be used inside <SessionProvider>');
  }
  return session;
}

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const backend = import.meta.env.VITE_BACKEND ?? 'local';

  return backend === 'supabase' ? (
    <SupabaseSession>{children}</SupabaseSession>
  ) : (
    <DemoSession>{children}</DemoSession>
  );
}
