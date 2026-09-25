import type { PhotoStore } from '../types';

/**
 * Recipe photos for the local backend, in IndexedDB: localStorage caps out
 * around 5 MB, which is two or three photos.
 *
 * IndexedDB can be missing (some private windows, jsdom), so every call
 * degrades to "no photo" rather than throwing at the recipe screen.
 */

const DB_NAME = 'nestead-photos';
const STORE = 'photos';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening !== null) return opening;
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open photo storage'));
  });
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Photo storage failed'));
      }),
  );
}

export function createLocalPhotoStore(familyId: string): PhotoStore {
  // Object URLs are made once per photo and kept for the page's lifetime.
  const urls = new Map<string, string>();

  return {
    async put(blob) {
      const id = `${familyId}/${crypto.randomUUID()}`;
      await run('readwrite', (store) => store.put(blob, id));
      return id;
    },

    async url(id) {
      const cached = urls.get(id);
      if (cached !== undefined) return cached;
      try {
        const blob = await run<Blob | undefined>('readonly', (store) => store.get(id));
        if (blob === undefined) return null;
        const url = URL.createObjectURL(blob);
        urls.set(id, url);
        return url;
      } catch {
        return null;
      }
    },

    async remove(id) {
      const cached = urls.get(id);
      if (cached !== undefined) {
        URL.revokeObjectURL(cached);
        urls.delete(id);
      }
      try {
        await run('readwrite', (store) => store.delete(id));
      } catch {
        // Nothing stored, nothing to remove.
      }
    },
  };
}
