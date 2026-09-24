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

/** Called whenever the collection's rows may have changed. */
export type ChangeListener = () => void;

/** Cancels a subscription. */
export type Unsubscribe = () => void;

/**
 * One family-scoped table. Every backend implements this identically and must
 * pass runDataStoreContract() in collection.contract.ts.
 */
export interface Collection<T extends Base> {
  list(): Promise<T[]>;
  create(row: NewRow<T>): Promise<T>;
  update(id: string, patch: Partial<NewRow<T>>): Promise<T>;
  remove(id: string): Promise<void>;
  /**
   * Fire onChange after any change to this collection, including changes made
   * by another tab or another client. Returns an unsubscribe function.
   */
  subscribe(onChange: ChangeListener): Unsubscribe;
}

/**
 * Recipe photos. Blobs are not rows: they live beside the tables (IndexedDB
 * locally, a private Storage bucket on Supabase) and a recipe keeps the id.
 */
export interface PhotoStore {
  /** Stores a JPEG and returns its id. */
  put(blob: Blob): Promise<string>;
  /** A URL an <img> can load, or null if the photo is gone. */
  url(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
}

/** Every collection one family owns. */
export interface DataStore {
  familyId: string;
  members: Collection<Member>;
  columns: Collection<BoardColumn>;
  tasks: Collection<Task>;
  recipes: Collection<Recipe>;
  pantry: Collection<PantryItem>;
  /** At most one row per family. */
  dietProfiles: Collection<DietProfile>;
  listItems: Collection<ListItem>;
  /** The family's own shopping-list groups. */
  listGroups: Collection<ListGroup>;
  photos: PhotoStore;
}
