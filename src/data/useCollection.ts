import { useEffect, useState } from 'react';
import type { Base } from '../domain/types';
import type { Collection } from './types';

/**
 * Live rows from a collection. Re-reads whenever the collection reports a
 * change (including changes made in another tab) and unsubscribes on unmount.
 */
export function useCollection<T extends Base>(collection: Collection<T>): T[] {
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    let active = true;

    const reload = (): void => {
      void collection.list().then((next) => {
        if (active) setRows(next);
      });
    };

    reload();
    const unsubscribe = collection.subscribe(reload);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [collection]);

  return rows;
}
