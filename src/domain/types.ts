/**
 * Domain types. These mirror supabase/schema.sql one-to-one (camelCase here,
 * snake_case there) so a future Supabase backend is a pure mapping exercise.
 */

/** Fields every stored row carries. Timestamps are ISO 8601 strings. */
export interface Base {
  id: string;
  familyId: string;
  createdAt: string;
  updatedAt: string;
}

/** A row as a caller supplies it: the store fills in everything in Base. */
export type NewRow<T extends Base> = Omit<T, keyof Base>;

/** Anything the board orders. See src/domain/position.ts. */
export interface Positioned {
  position: number;
}

export interface Member extends Base {
  name: string;
  /** Hex colour used to tag this person's contributions. */
  color: string;
}

/** A kanban column. Families can add, rename, reorder and delete these. */
export interface BoardColumn extends Base, Positioned {
  name: string;
  /**
   * Tasks in this column count as complete. Kept in sync with Task.done by
   * moveTaskToColumn(), which is the only thing that writes either field.
   */
  isDone: boolean;
}

export interface Ingredient {
  name: string;
  qty?: string;
}

export interface Recipe extends Base {
  title: string;
  ingredients: Ingredient[];
  steps: string;
  photoUrl?: string;
  /** Member id. */
  createdBy: string;
}

export interface ShoppingList extends Base {
  name: string;
}

export interface ShoppingItem extends Base {
  /** ShoppingList id. */
  listId: string;
  name: string;
  qty?: string;
  checked: boolean;
  /** Member id. */
  addedBy: string;
  /** Set when the item was added from a recipe. */
  recipeId?: string;
}

export interface Task extends Base, Positioned {
  title: string;
  /** A single emoji, stored as text. No icon set, no assets. */
  icon?: string;
  /** BoardColumn id. */
  columnId: string;
  /** Member id. */
  assigneeId?: string;
  /** ISO date string. */
  dueDate?: string;
  /** Mirrors the column's isDone. Never written on its own. */
  done: boolean;
  /** Member id. */
  createdBy: string;
}
