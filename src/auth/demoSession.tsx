import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore } from '../data';
import type { DataStore } from '../data/types';
import { useCollection } from '../data/useCollection';
import type { Member } from '../domain/types';
import { seedDefaultColumns } from './defaultColumns';
import { SessionContext } from './session';

/**
 * The no-accounts session, used by the local backend. One hard-coded family,
 * and you pick which member you are; sessionStorage keeps that per tab, so two
 * tabs can be two people.
 *
 * This exists so the app runs with no Supabase project and no network. It is
 * not a security model and never was.
 */

const DEMO_FAMILY_ID = 'demo-family';
const ME_KEY = 'nestead:me';

const DEMO_MEMBERS: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Alex', color: '#4f8ef7' },
  { name: 'Sam', color: '#e8734a' },
];

/** One store for the whole app, so every hook sees the same collections. */
let storeSingleton: DataStore | null = null;

function getStore(): DataStore {
  if (storeSingleton === null) storeSingleton = createStore(DEMO_FAMILY_ID);
  return storeSingleton;
}

/** Runs at most once per page load, however many times the provider mounts. */
let seeding: Promise<void> | null = null;

async function seed(store: DataStore): Promise<void> {
  const members = await store.members.list();
  for (const member of DEMO_MEMBERS) {
    if (!members.some((existing) => existing.name === member.name)) {
      await store.members.create(member);
    }
  }
  await seedDefaultColumns(store);
}

function seedOnce(store: DataStore): Promise<void> {
  if (seeding === null) seeding = seed(store);
  return seeding;
}

export function DemoSession({ children }: { children: ReactNode }): JSX.Element | null {
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

  const me: Member | null = members.find((member) => member.id === meId) ?? members[0] ?? null;

  if (!seeded || me === null) return null;

  const setMe = (memberId: string): void => {
    sessionStorage.setItem(ME_KEY, memberId);
    setMeId(memberId);
  };

  const signOut = async (): Promise<void> => {
    sessionStorage.removeItem(ME_KEY);
    setMeId(null);
  };

  return (
    <SessionContext.Provider value={{ store, me, members, setMe, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
