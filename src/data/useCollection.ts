import { useEffect, useState } from 'react';
import type { Base } from '../domain/types';
import type { Collection } from './types';

/**
 * Live rows from a collection, and whether the first read has landed yet.
 * Re-reads whenever the collection reports a change (including changes made in
 * another tab) and unsubscribes on unmount.
 *
 * `loaded` lets a screen tell "no rows" from "not read yet", so an empty state
 * or a "not found" never flashes up before the data arrives.
 */
export function useCollectionState<T extends Base>(collection: Collection<T>): { rows: T[]; loaded: boolean } {
  const [state, setState] = useState<{ rows: T[]; loaded: boolean }>({ rows: [], loaded: false });

  useEffect(() => {
    let active = true;

    const reload = (): void => {
      void collection.list().then(
        (next) => {
          if (active) setState({ rows: next, loaded: true });
        },
        (error: unknown) => {
          // A failed read leaves what we had; the next change retries.
          console.warn('Could not read rows:', error);
          if (active) setState((previous) => ({ ...previous, loaded: true }));
        },
      );
    };

    reload();
    const unsubscribe = collection.subscribe(reload);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [collection]);

  return state;
}

/** Live rows from a collection. See useCollectionState. */
export function useCollection<T extends Base>(collection: Collection<T>): T[] {
  return useCollectionState(collection).rows;
}
