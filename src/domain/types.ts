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

export interface Task extends Base, Positioned {
  title: string;
  /** A single emoji, stored as text. No icon set, no assets. */
  icon?: string;
  /** BoardColumn id. */
  columnId: string;
  /** Member id. */
  assigneeId?: string;
  /**
   * ISO date (YYYY-MM-DD). For a repeating task this is when it next comes
   * round; for a one-off it is simply a deadline.
   */
  dueDate?: string;
  /**
   * Days between occurrences. Absent means the task does not repeat.
   * Completing a repeating task sets dueDate to this many days from now, and
   * it becomes outstanding again when that date arrives. The same row recurs,
   * so a chore can never be duplicated.
   */
  recurEveryDays?: number;
  /** Mirrors the column's isDone. Never written on its own. */
  done: boolean;
  /** Member id. Cleared when that member is deleted. */
  createdBy?: string;
}
