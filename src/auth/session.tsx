import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { supabaseAccount } from '../data/supabase/supabaseAccount';
import type { DataStore, Family } from '../data/types';
import type { AiStatus, Member } from '../domain/types';
import { AccountSession } from './accountSession';
import { DemoSession } from './demoSession';

export type { Family } from '../data/types';

/**
 * Who you are and which family's data you get. Screens read this and never ask
 * how it was decided.
 *
 * There are two implementations. The local backend has no accounts, so
 * DemoSession lets you pick a member per tab. AccountSession signs you in for
 * real, against any backend that provides an Account (src/data/types.ts). Both
 * provide the same shape, which is the point: the board does not change when
 * auth becomes real, or when the backend behind it is swapped.
 */

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
  /**
   * Real auth only: AI recipe reading. The token is for Nestead's own /api/ai
   * routes (src/ai/client.ts); the rest reads and changes the family's AI
   * settings, never the key itself.
   */
  ai?: {
    token: () => Promise<string | null>;
    status: () => Promise<AiStatus>;
    clearKey: () => Promise<void>;
    setModel: (model: string | null) => Promise<void>;
  };
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

/**
 * The swap point: the only place that names a backend. Another backend is one
 * more case here, once its DataStore passes runDataStoreContract() and its
 * Account keeps the promises listed on the interface.
 *
 * VITE_BACKEND is compared directly, not through a local, so the build sees a
 * constant condition and leaves the other backends, and the demo kitchen the
 * demo session seeds, out of the bundle.
 */
export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  if (import.meta.env.VITE_BACKEND === 'supabase') {
    return <AccountSession account={supabaseAccount()}>{children}</AccountSession>;
  }
  if (import.meta.env.VITE_BACKEND === undefined || import.meta.env.VITE_BACKEND === 'local') {
    return <DemoSession>{children}</DemoSession>;
  }
  throw new Error(`VITE_BACKEND="${import.meta.env.VITE_BACKEND}" is not a known backend. Use "local" or "supabase".`);
}
