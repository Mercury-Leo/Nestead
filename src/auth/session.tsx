import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore } from '../data';
import type { DataStore } from '../data/types';
import { useCollection } from '../data/useCollection';
import { POSITION_STEP } from '../domain/position';
import type { Member } from '../domain/types';

/**
 * Fake session. There is one hard-coded demo family and you pick which member
 * you are; sessionStorage keeps that choice per tab, so two tabs can be two
 * people. Real auth replaces the internals of this module (Supabase Auth, one
 * account per person, family joined by code) and keeps this exact shape.
 */

const DEMO_FAMILY_ID = 'demo-family';
const ME_KEY = 'nestead:me';
const DEMO_LIST_NAME = 'Groceries';

const DEMO_MEMBERS: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Alex', color: '#4f8ef7' },
  { name: 'Sam', color: '#e8734a' },
];

const DEFAULT_COLUMNS: ReadonlyArray<{ name: string; isDone: boolean }> = [
  { name: 'To do', isDone: false },
  { name: 'Doing', isDone: false },
  { name: 'Done', isDone: true },
];

/**
 * One store for the whole app, so every hook sees the same collection objects.
 */
let storeSingleton: DataStore | null = null;

function getStore(): DataStore {
  if (storeSingleton === null) storeSingleton = createStore(DEMO_FAMILY_ID);
  return storeSingleton;
}

/**
 * Module-level guard: the seed runs at most once per page load however many
 * times the provider mounts. Seeding is also idempotent in its own right, so a
 * reload does not duplicate anything.
 */
let seeding: Promise<void> | null = null;

async function seed(store: DataStore): Promise<void> {
  const members = await store.members.list();
  for (const member of DEMO_MEMBERS) {
    if (!members.some((existing) => existing.name === member.name)) {
      await store.members.create(member);
    }
  }

  const lists = await store.lists.list();
  if (!lists.some((list) => list.name === DEMO_LIST_NAME)) {
    await store.lists.create({ name: DEMO_LIST_NAME });
  }

  // Columns are seeded only when there are none at all. Matching on name the
  // way the rows above do would re-create a column the family had renamed.
  const columns = await store.columns.list();
  if (columns.length === 0) {
    let position = 0;
    for (const column of DEFAULT_COLUMNS) {
      position += POSITION_STEP;
      await store.columns.create({ ...column, position });
    }
  }
}

function seedOnce(store: DataStore): Promise<void> {
  if (seeding === null) seeding = seed(store);
  return seeding;
}

export interface Session {
  store: DataStore;
  me: Member;
  members: Member[];
  setMe: (memberId: string) => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element | null {
  const store = getStore();
  const members = useCollection(store.members);

  const [seeded, setSeeded] = useState(false);
  const [meId, setMeId] = useState<string | null>(() => sessionStorage.getItem(ME_KEY));

  useEffect(() => {
    let active = true;
    void seedOnce(store).then(() => {
      if (active) setSeeded(true);
    });
    return () => {
      active = false;
    };
  }, [store]);

  const me = members.find((member) => member.id === meId) ?? members[0] ?? null;

  if (!seeded || me === null) return null;

  const setMe = (memberId: string): void => {
    sessionStorage.setItem(ME_KEY, memberId);
    setMeId(memberId);
  };

  return (
    <SessionContext.Provider value={{ store, me, members, setMe }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('useSession() must be used inside <SessionProvider>');
  }
  return session;
}
