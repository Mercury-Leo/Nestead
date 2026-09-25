import type {
  Base,
  BoardColumn,
  DietProfile,
  ListGroup,
  ListItem,
  Member,
  NewRow,
  PantryItem,
  Recipe,
  Task,
} from '../domain/types';
import { createLocalPhotoStore } from './localPhotos';
import type { ChangeListener, Collection, DataStore, Unsubscribe } from './types';

/**
 * localStorage-backed DataStore. This is the only module in src/ that is
 * allowed to touch localStorage. Photos are too big for it and go to
 * IndexedDB instead, in localPhotos.ts.
 *
 * Layout: one JSON array per collection under `nestead:<familyId>:<collection>`.
 * Cross-tab changes arrive through the window `storage` event, which fires in
 * every tab except the one that wrote.
 */

const NAMESPACE = 'nestead';

type CollectionName = 'members' | 'columns' | 'tasks' | 'recipes' | 'pantry' | 'diet' | 'list' | 'listGroups';

export function storageKey(familyId: string, collection: CollectionName): string {
  return `${NAMESPACE}:${familyId}:${collection}`;
}

/**
 * Date.now() has millisecond resolution, so two writes in the same tick would
 * otherwise produce an unchanged updatedAt, or two rows created back to back
 * the same createdAt (and "newest first" would come out in random order).
 * Every stamp this tab hands out is strictly later than the last one.
 */
let lastStamp = 0;

function nextIso(after?: string): string {
  let ms = Math.max(Date.now(), lastStamp + 1);
  if (after !== undefined) {
    const prev = Date.parse(after);
    if (!Number.isNaN(prev) && ms <= prev) ms = prev + 1;
  }
  lastStamp = ms;
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

/**
 * Small per-family UI preferences, such as the board filter. They live here
 * because this module is the only localStorage user, and they stay local on
 * every backend: they belong to this browser, not to the family.
 *
 * Storage can be unavailable (private windows, blocked site data), so reads
 * fall back to undefined and failed writes are dropped.
 */
export function readPreference(familyId: string, name: string): unknown {
  try {
    const raw = localStorage.getItem(`${NAMESPACE}:${familyId}:pref:${name}`);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

export function writePreference(familyId: string, name: string, value: unknown): void {
  try {
    localStorage.setItem(`${NAMESPACE}:${familyId}:pref:${name}`, JSON.stringify(value));
  } catch {
    // Not worth interrupting anyone over.
  }
}

/**
 * Preferences for this device whoever is signed in, such as the theme. They
 * are read before sign-in (and, for the theme, by the script in index.html
 * before first paint), so they are not scoped to a family.
 */
export function readDevicePreference(name: string): unknown {
  try {
    const raw = localStorage.getItem(`${NAMESPACE}:device:pref:${name}`);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

export function writeDevicePreference(name: string, value: unknown): void {
  try {
    localStorage.setItem(`${NAMESPACE}:device:pref:${name}`, JSON.stringify(value));
  } catch {
    // Not worth interrupting anyone over.
  }
}

export function createLocalStore(familyId: string): DataStore {
  return {
    familyId,
    members: createCollection<Member>(familyId, 'members'),
    columns: createCollection<BoardColumn>(familyId, 'columns'),
    tasks: createCollection<Task>(familyId, 'tasks'),
    recipes: createCollection<Recipe>(familyId, 'recipes'),
    pantry: createCollection<PantryItem>(familyId, 'pantry'),
    dietProfiles: createCollection<DietProfile>(familyId, 'diet'),
    listItems: createCollection<ListItem>(familyId, 'list'),
    listGroups: createCollection<ListGroup>(familyId, 'listGroups'),
    photos: createLocalPhotoStore(familyId),
  };
}
