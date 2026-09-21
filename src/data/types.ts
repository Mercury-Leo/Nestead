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

/** Every collection one family owns. */
export interface DataStore {
  familyId: string;
  members: Collection<Member>;
  columns: Collection<BoardColumn>;
  recipes: Collection<Recipe>;
  lists: Collection<ShoppingList>;
  items: Collection<ShoppingItem>;
  tasks: Collection<Task>;
}

/** Somewhere to put binary blobs and get back a URL a browser can render. */
export interface BlobStorage {
  putImage(file: File): Promise<string>;
}
