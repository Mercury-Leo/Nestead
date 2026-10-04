import type { Base, NewRow } from '../domain/types';
import type { ChangeListener, Collection, DataStore, Unsubscribe } from './types';

/**
 * An in-memory copy of each collection, shared by every screen, with writes
 * shown before the backend confirms them.
 *
 * Without it every useCollection() read its own copy of a table, and a change
 * showed on screen only after two round trips: the write, then a full re-read.
 * With it:
 *
 *   * One read per collection however many screens watch it, and at most one
 *     at a time. A change that arrives mid-read queues exactly one more, so a
 *     slow old read can never land on top of a newer one, and a write
 *     confirmed while a read was out is laid back over what it returns.
 *   * update() and remove() change the rows at once and undo themselves if the
 *     backend refuses; create() shows its row as soon as the backend returns
 *     it, without waiting for the re-read.
 *   * Rows outlive the screen. Coming back to one shows what it had while a
 *     fresh read runs, instead of an empty page.
 *
 * It wraps any backend and passes the same contract, so screens and backends
 * stay unaware of it. list() always reads the backend.
 */

export interface Rows<T> {
  rows: T[];
  /** False until the first read lands, so "no rows" and "not read yet" differ. */
  loaded: boolean;
}

/**
 * How long a collection nobody is watching stays subscribed. Going from the
 * board to the kitchen and back keeps the board live instead of tearing down
 * and re-joining its realtime channels; a preload holds a collection open
 * until the screen that wants it mounts.
 */
const LINGER_MS = 30_000;

type Edit<T> = (rows: T[]) => T[];

/** A patch applied the way the backends apply it: undefined clears a field. */
function merge<T extends Base>(row: T, patch: Partial<NewRow<T>>): T {
  const next: Record<string, unknown> = { ...row, ...patch };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
  }
  return next as T;
}

/**
 * Puts a row the backend returned into rows, unless rows already hold a later
 * version of it (a read that saw somebody else's change after ours).
 */
function upsert<T extends Base>(rows: T[], row: T): T[] {
  const index = rows.findIndex((existing) => existing.id === row.id);
  if (index === -1) return [...rows, row];
  if ((rows[index] as T).updatedAt > row.updatedAt) return rows;
  const next = [...rows];
  next[index] = row;
  return next;
}

/** Same rows at the same versions: a re-read that found nothing new. */
function sameRows<T extends Base>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const versions = new Map(a.map((row) => [row.id, row.updatedAt]));
  return b.every((row) => versions.get(row.id) === row.updatedAt);
}

export class CachedCollection<T extends Base> implements Collection<T> {
  /** The rows as the backend last reported them, plus confirmed writes. */
  private base: T[] = [];
  private loaded = false;
  /** Writes still in flight, applied over base in the order they were made. */
  private readonly edits = new Set<Edit<T>>();
  private snapshot: Rows<T> = { rows: [], loaded: false };

  private readonly listeners = new Set<ChangeListener>();
  private stopSource: Unsubscribe | null = null;
  private closing: ReturnType<typeof setTimeout> | null = null;

  private reading = false;
  private readAgain = false;
  /**
   * Writes confirmed while a read is out. The read may have reached the
   * backend before them, so they are applied again to what it returns; each is
   * a no-op on rows that already include it.
   */
  private landedDuringRead: Edit<T>[] = [];

  constructor(private readonly source: Collection<T>) {}

  /** The current rows. The same object until something changes. */
  readonly getSnapshot = (): Rows<T> => this.snapshot;

  /** Starts reading and listening now, for a screen that is about to mount. */
  preload(): void {
    if (this.listeners.size > 0) return;
    this.open();
    this.closeSoon();
  }

  readonly subscribe = (onChange: ChangeListener): Unsubscribe => {
    this.listeners.add(onChange);
    this.open();
    return () => {
      if (this.listeners.delete(onChange) && this.listeners.size === 0) this.closeSoon();
    };
  };

  list(): Promise<T[]> {
    return this.source.list();
  }

  async create(row: NewRow<T>): Promise<T> {
    return this.write(null, () => this.source.create(row), (created) => (rows) => upsert(rows, created));
  }

  async update(id: string, patch: Partial<NewRow<T>>): Promise<T> {
    return this.write(
      (rows) => rows.map((row) => (row.id === id ? merge(row, patch) : row)),
      () => this.source.update(id, patch),
      (updated) => (rows) => upsert(rows, updated),
    );
  }

  async remove(id: string): Promise<void> {
    const drop: Edit<T> = (rows) => rows.filter((row) => row.id !== id);
    return this.write(drop, () => this.source.remove(id), () => drop);
  }

  /**
   * Shows `edit` at once, runs the write, then folds what the backend returned
   * into base. If the write fails the edit is dropped, which puts the rows back,
   * and the error goes to the caller as before.
   */
  private async write<R>(edit: Edit<T> | null, run: () => Promise<R>, settle: (result: R) => Edit<T>): Promise<R> {
    if (edit !== null) {
      this.edits.add(edit);
      this.emit();
    }
    try {
      const result = await run();
      const landed = settle(result);
      this.base = landed(this.base);
      if (this.reading) this.landedDuringRead.push(landed);
      return result;
    } finally {
      if (edit !== null) this.edits.delete(edit);
      this.emit();
    }
  }

  private open(): void {
    if (this.closing !== null) {
      clearTimeout(this.closing);
      this.closing = null;
    }
    if (this.stopSource === null) {
      this.stopSource = this.source.subscribe(() => this.read());
      this.read();
    }
  }

  private closeSoon(): void {
    if (this.closing !== null) clearTimeout(this.closing);
    this.closing = setTimeout(() => {
      this.closing = null;
      if (this.listeners.size === 0 && this.stopSource !== null) {
        this.stopSource();
        this.stopSource = null;
      }
    }, LINGER_MS);
  }

  private read(): void {
    if (this.reading) {
      this.readAgain = true;
      return;
    }
    this.reading = true;
    this.landedDuringRead = [];

    void this.source
      .list()
      .then(
        (read) => {
          let rows = read;
          for (const landed of this.landedDuringRead) rows = landed(rows);
          const changed = !this.loaded || !sameRows(this.base, rows);
          this.loaded = true;
          if (changed) {
            this.base = rows;
            this.emit();
          }
        },
        (error: unknown) => {
          // A failed read leaves what we had; the next change retries.
          console.warn('Could not read rows:', error);
          if (!this.loaded) {
            this.loaded = true;
            this.emit();
          }
        },
      )
      .finally(() => {
        this.reading = false;
        this.landedDuringRead = [];
        const again = this.readAgain;
        this.readAgain = false;
        if (again && this.stopSource !== null) this.read();
      });
  }

  private emit(): void {
    let rows = this.base;
    for (const edit of this.edits) rows = edit(rows);
    this.snapshot = { rows, loaded: this.loaded };
    for (const listener of [...this.listeners]) listener();
  }
}

/** Collections that reached a hook without going through withCache (tests). */
const adopted = new WeakMap<Collection<Base>, CachedCollection<Base>>();

/** The cache for a collection: itself if it is one, else one made for it. */
export function cacheOf<T extends Base>(collection: Collection<T>): CachedCollection<T> {
  if (collection instanceof CachedCollection) return collection as CachedCollection<T>;
  let cache = adopted.get(collection as Collection<Base>) as CachedCollection<T> | undefined;
  if (cache === undefined) {
    cache = new CachedCollection(collection);
    adopted.set(collection as Collection<Base>, cache as unknown as CachedCollection<Base>);
  }
  return cache;
}

/** A store whose every collection is cached. Photos pass straight through. */
export function withCache(store: DataStore): DataStore {
  return {
    familyId: store.familyId,
    members: new CachedCollection(store.members),
    columns: new CachedCollection(store.columns),
    tasks: new CachedCollection(store.tasks),
    recipes: new CachedCollection(store.recipes),
    pantry: new CachedCollection(store.pantry),
    dietProfiles: new CachedCollection(store.dietProfiles),
    listItems: new CachedCollection(store.listItems),
    listGroups: new CachedCollection(store.listGroups),
    shows: new CachedCollection(store.shows),
    photos: store.photos,
  };
}

/** Starts reading every collection at once, ahead of the screens that show them. */
export function preloadStore(store: DataStore): void {
  for (const collection of [
    store.members,
    store.columns,
    store.tasks,
    store.recipes,
    store.pantry,
    store.dietProfiles,
    store.listItems,
    store.listGroups,
  ]) {
    cacheOf<Base>(collection).preload();
  }
}
