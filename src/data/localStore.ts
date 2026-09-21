import type {
  Base,
  BoardColumn,
  Member,
  NewRow,
  Recipe,
  ShoppingItem,
  ShoppingList,
  Task,
} from '../domain/types';
import type { ChangeListener, Collection, DataStore, Unsubscribe } from './types';

/**
 * localStorage-backed DataStore. This is the only module in src/ that is
 * allowed to touch localStorage.
 *
 * Layout: one JSON array per collection under `nestead:<familyId>:<collection>`.
 * Cross-tab changes arrive through the window `storage` event, which fires in
 * every tab except the one that wrote.
 */

const NAMESPACE = 'nestead';

type CollectionName = 'members' | 'columns' | 'recipes' | 'lists' | 'items' | 'tasks';

export function storageKey(familyId: string, collection: CollectionName): string {
  return `${NAMESPACE}:${familyId}:${collection}`;
}

/**
 * Date.now() has millisecond resolution, so two writes in the same tick would
 * otherwise produce an unchanged updatedAt. Step forward when that happens.
 */
function nextIso(after?: string): string {
  let ms = Date.now();
  if (after !== undefined) {
    const prev = Date.parse(after);
    if (!Number.isNaN(prev) && ms <= prev) ms = prev + 1;
  }
  return new Date(ms).toISOString();
}

function createCollection<T extends Base>(
  familyId: string,
  name: CollectionName,
): Collection<T> {
  const key = storageKey(familyId, name);
  const listeners = new Set<ChangeListener>();
  let onStorage: ((event: StorageEvent) => void) | null = null;

  function read(): T[] {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  function write(rows: T[]): void {
    localStorage.setItem(key, JSON.stringify(rows));
    notify();
  }

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  return {
    async list(): Promise<T[]> {
      return read();
    },

    async create(row: NewRow<T>): Promise<T> {
      const now = nextIso();
      const created = {
        ...row,
        id: crypto.randomUUID(),
        familyId,
        createdAt: now,
        updatedAt: now,
      } as T;
      write([...read(), created]);
      return created;
    },

    async update(id: string, patch: Partial<NewRow<T>>): Promise<T> {
      const rows = read();
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) {
        throw new Error(`${name}: no row with id ${id}`);
      }
      const existing = rows[index] as T;
      const updated = {
        ...existing,
        ...patch,
        id: existing.id,
        familyId: existing.familyId,
        createdAt: existing.createdAt,
        updatedAt: nextIso(existing.updatedAt),
      } as T;
      const next = [...rows];
      next[index] = updated;
      write(next);
      return updated;
    },

    async remove(id: string): Promise<void> {
      write(read().filter((row) => row.id !== id));
    },

    subscribe(onChange: ChangeListener): Unsubscribe {
      listeners.add(onChange);
      if (onStorage === null) {
        onStorage = (event: StorageEvent) => {
          // event.key is null when another tab called localStorage.clear().
          if (event.key !== null && event.key !== key) return;
          notify();
        };
        window.addEventListener('storage', onStorage);
      }
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && onStorage !== null) {
          window.removeEventListener('storage', onStorage);
          onStorage = null;
        }
      };
    },
  };
}

export function createLocalStore(familyId: string): DataStore {
  return {
    familyId,
    members: createCollection<Member>(familyId, 'members'),
    columns: createCollection<BoardColumn>(familyId, 'columns'),
    recipes: createCollection<Recipe>(familyId, 'recipes'),
    lists: createCollection<ShoppingList>(familyId, 'lists'),
    items: createCollection<ShoppingItem>(familyId, 'items'),
    tasks: createCollection<Task>(familyId, 'tasks'),
  };
}
