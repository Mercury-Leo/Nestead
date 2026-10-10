import type { DataStore } from '../../data/types';
import { comparePosition, positionBetween } from '../../domain/position';
import type { BoardColumn, NewRow, Task, TaskCompletion } from '../../domain/types';
import { doneAtOf, isDueAgain, nextOccurrence, repeats } from './recurrence';

/** Which way a row moves within its list. */
export type Direction = 'up' | 'down';

/** The position that puts a new row at the end of a sorted list. */
export function endPosition(rows: ReadonlyArray<{ position: number }>): number {
  return positionBetween(rows[rows.length - 1]?.position, undefined);
}

/** Done one-off tasks leave the board this long after they were ticked. */
export const CLEAR_AFTER_DAYS = 7;

/** Put a task at a position in a column, its own or another. Dragging a card comes through here. */
export async function placeTask(store: DataStore, task: Task, column: BoardColumn, position: number): Promise<void> {
  const patch: Partial<NewRow<Task>> = { position };
  if (task.columnId !== column.id) patch.columnId = column.id;
  await store.tasks.update(task.id, patch);
}

/**
 * The tick. Writes the history entry first, so the task can point at the one
 * an untick should remove. Two writes, no transaction: if the second fails the
 * entry stays without a task pointing at it, which History shows as done.
 */
export async function completeTask(store: DataStore, task: Task, memberId: string, now: Date = new Date()): Promise<void> {
  const entry = await store.taskCompletions.create({
    taskId: task.id,
    title: task.title,
    icon: task.icon,
    description: task.description,
    columnId: task.columnId,
    assigneeId: task.assigneeId,
    memberId,
  });
  await store.tasks.update(task.id, { done: true, doneAt: now.toISOString(), completionId: entry.id });
}

/** An untick: the tick was a mistake, so its history entry goes too. The due date is untouched. */
export async function reopenTask(store: DataStore, task: Task): Promise<void> {
  await store.tasks.update(task.id, { done: false, doneAt: undefined, completionId: undefined });
  if (task.completionId !== undefined) await store.taskCompletions.remove(task.completionId);
}

/** Done one-offs, which Clear and auto-clear may delete. Repeats come back on their own. */
function clearable(task: Task): boolean {
  return task.done && !repeats(task);
}

/** The Clear button: deletes these tasks' done one-offs. Their history stays. */
export async function clearDone(store: DataStore, tasks: readonly Task[]): Promise<void> {
  for (const task of tasks.filter(clearable)) await store.tasks.remove(task.id);
}

/**
 * Deletes done one-offs ticked more than CLEAR_AFTER_DAYS ago. Runs when the
 * board opens, like reviveRecurring(); two devices doing it at once both
 * remove the same rows, which is harmless.
 */
export async function autoClear(store: DataStore, tasks: readonly Task[], now: Date = new Date()): Promise<number> {
  const before = now.getTime() - CLEAR_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const stale = tasks.filter((task) => clearable(task) && doneAtOf(task).getTime() < before);
  for (const task of stale) await store.tasks.remove(task.id);
  return stale.length;
}

/**
 * Brings back repeating tasks whose return date has arrived: the same row,
 * unticked in its own column, due on the next round.
 *
 * There is no server, so this runs when somebody opens the app. A chore due on
 * Monday appears when the app is next opened, which for a chores board is fine.
 * Running it twice is harmless: the second pass finds nothing done to revive.
 */
export async function reviveRecurring(store: DataStore, tasks: readonly Task[], now: Date = new Date()): Promise<number> {
  const due = tasks.filter((task) => isDueAgain(task, now));
  for (const task of due) {
    const next = nextOccurrence(task, doneAtOf(task));
    await store.tasks.update(task.id, {
      done: false,
      doneAt: undefined,
      completionId: undefined,
      dueDate: next?.dueDate,
      recurFrom: next?.recurFrom,
    });
  }
  return due.length;
}

export interface RestoreContext {
  tasks: readonly Task[];
  /** Sorted by position: a task whose column is gone goes to the first. */
  columns: readonly BoardColumn[];
  entries: readonly TaskCompletion[];
  /** Who is restoring it, as the re-created task's createdBy. */
  memberId: string;
}

/**
 * History's Restore: "do it again". The entry stays either way.
 *
 * A task still on the board is unticked (or left alone if already open). A
 * cleared one is created again from the entry's copies, at the end of its
 * column, and every entry of the old task is pointed at the new one, so
 * History shows it as on the board and a second press cannot duplicate it.
 * Null when the family has no columns to put it in.
 */
export async function restoreTask(
  store: DataStore,
  entry: TaskCompletion,
  { tasks, columns, entries, memberId }: RestoreContext,
): Promise<{ taskId: string; column: BoardColumn } | null> {
  const existing = tasks.find((task) => task.id === entry.taskId);
  if (existing !== undefined) {
    const column = columns.find((row) => row.id === existing.columnId) ?? columns[0];
    if (column === undefined) return null;
    if (existing.done) {
      await store.tasks.update(existing.id, { done: false, doneAt: undefined, completionId: undefined });
    }
    return { taskId: existing.id, column };
  }

  const column = columns.find((row) => row.id === entry.columnId) ?? columns[0];
  if (column === undefined) return null;
  const inColumn = tasks.filter((task) => task.columnId === column.id).sort(comparePosition);
  const created = await store.tasks.create({
    title: entry.title,
    icon: entry.icon,
    description: entry.description,
    assigneeId: entry.assigneeId,
    columnId: column.id,
    position: endPosition(inColumn),
    done: false,
    createdBy: memberId,
  });
  for (const row of entries.filter((candidate) => candidate.taskId === entry.taskId)) {
    await store.taskCompletions.update(row.id, { taskId: created.id });
  }
  return { taskId: created.id, column };
}

/** Swap a row with its neighbour by taking a position on the far side of it. */
function positionPastNeighbour<T extends { position: number }>(
  sorted: readonly T[],
  index: number,
  direction: Direction,
): number | null {
  if (direction === 'up') {
    if (index <= 0) return null;
    return positionBetween(sorted[index - 2]?.position, sorted[index - 1]?.position);
  }
  if (index >= sorted.length - 1) return null;
  return positionBetween(sorted[index + 1]?.position, sorted[index + 2]?.position);
}

/** Move a column left or right. */
export async function moveColumn(
  store: DataStore,
  column: BoardColumn,
  columns: readonly BoardColumn[],
  direction: Direction,
): Promise<void> {
  const sorted = [...columns].sort(comparePosition);
  const index = sorted.findIndex((row) => row.id === column.id);
  const position = positionPastNeighbour(sorted, index, direction);
  if (position === null) return;
  await store.columns.update(column.id, { position });
}
