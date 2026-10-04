import { useSyncExternalStore } from 'react';
import type { Base } from '../domain/types';
import { cacheOf } from './cache';
import type { Rows } from './cache';
import type { Collection } from './types';

/**
 * Live rows from a collection, and whether the first read has landed yet.
 * Every screen watching one collection shares one copy of its rows (see
 * cache.ts), which follows changes from anywhere, including another tab.
 *
 * `loaded` lets a screen tell "no rows" from "not read yet", so an empty state
 * or a "not found" never flashes up before the data arrives.
 */
export function useCollectionState<T extends Base>(collection: Collection<T>): Rows<T> {
  const cache = cacheOf(collection);
  return useSyncExternalStore(cache.subscribe, cache.getSnapshot);
}

/** Live rows from a collection. See useCollectionState. */
export function useCollection<T extends Base>(collection: Collection<T>): T[] {
  return useCollectionState(collection).rows;
}

/**
 * Starts reading a collection for a screen that is about to open, so its rows
 * can be there when it mounts. If nothing watches it, the cache closes it after
 * its linger (cache.ts); calling again while it is open costs nothing.
 */
export function preloadCollection<T extends Base>(collection: Collection<T>): void {
  cacheOf(collection).preload();
}
