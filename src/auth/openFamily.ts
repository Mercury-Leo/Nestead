import { preloadStore, withCache } from '../data/cache';
import { readDevicePreference, writeDevicePreference } from '../data/local/localStore';
import type { Account, DataStore, Family } from '../data/types';
import { seedDefaultColumns } from '../features/board/defaultColumns';
import { ensureKitchen } from '../features/larder/setup';

export interface OpenedFamily {
  family: Family;
  /** Its rows are already loading. */
  store: DataStore;
  /** A new family's default columns and kitchen; wait for it before showing the app. */
  setup: Promise<unknown>;
}

/**
 * The families already started for one user on this device, by id. A try
 * after a failure (../auth/accountSession.tsx) carries on with the store it
 * began, whose rows may have arrived meanwhile: a second store for the same
 * family would ask realtime for channels the first still holds. Setup runs
 * again only if it failed, so a slow first run is never doubled.
 */
export type Started = Map<string, { store: DataStore; setup: Promise<unknown>; setupFailed: boolean }>;

function start(account: Account, familyId: string, started: Started): Omit<OpenedFamily, 'family'> {
  const known = started.get(familyId);
  // Every table starts loading now, alongside the setup, so the board and the
  // kitchen have their rows by the time they mount. Again for a known store,
  // in case its collections closed while the tries went on (a no-op if not).
  const store = known?.store ?? withCache(account.openStore(familyId));
  preloadStore(store);
  if (known !== undefined && !known.setupFailed) return known;
  const entry = { store, setup: Promise.all([seedDefaultColumns(store), ensureKitchen(store)]) as Promise<unknown>, setupFailed: false };
  entry.setup.catch(() => {
    entry.setupFailed = true;
  });
  started.set(familyId, entry);
  return entry;
}

/**
 * The signed-in user's family, with a store whose rows are on their way, or
 * null for someone who has not joined one.
 *
 * `lastFamilyId` is the family this device opened for this user last time.
 * Its store starts while membership is checked rather than after, which takes
 * a round trip off every launch. A stale guess costs only requests: a user
 * belongs to one family at most, so the backend shows the old one no rows and refuses
 * its setup writes, and it is dropped as soon as membership answers.
 */
export async function openFamily(
  account: Account,
  userId: string,
  lastFamilyId: string | null,
  started: Started = new Map(),
): Promise<OpenedFamily | null> {
  const early = lastFamilyId === null ? null : start(account, lastFamilyId, started);
  // Judged below; until then a failure must not surface as unhandled.
  early?.setup.catch(() => undefined);

  const family = await account.readMembership(userId);
  if (family === null) return null;
  const opened = early !== null && lastFamilyId === family.id ? early : start(account, family.id, started);
  return { family, store: opened.store, setup: opened.setup };
}

const LAST_FAMILY = 'lastFamily';

/** The family this device last opened for this user, if it remembers one. */
export function lastFamilyOf(userId: string): string | null {
  const saved = readDevicePreference(LAST_FAMILY);
  if (typeof saved !== 'object' || saved === null) return null;
  const { userId: savedUser, familyId } = saved as { userId?: unknown; familyId?: unknown };
  return savedUser === userId && typeof familyId === 'string' ? familyId : null;
}

/** Remembers the family this user opened on this device, or forgets it with null. */
export function rememberFamily(userId: string, familyId: string | null): void {
  writeDevicePreference(LAST_FAMILY, familyId === null ? null : { userId, familyId });
}
