import type { DataStore } from '../../data/types';
import { POSITION_STEP, comparePosition, positionBetween } from '../../domain/position';
import type { BoardColumn, NewRow, Task } from '../../domain/types';
import { isDueAgain, nextDueDate, reviveColumn } from './recurrence';

/** Which way a row moves within its list. */
export type Direction = 'up' | 'down';

/** The position that puts a new row at the end of a sorted list. */
export function endPosition(rows: ReadonlyArray<{ position: number }>): number {
  return positionBetween(rows[rows.length - 1]?.position, undefined);
}

/**
 * Move a task to another column, appending it at the bottom.
 *
 * This is the only place that writes Task.done: it is always taken from the
 * destination column's isDone, so the two can never drift apart.
 */
export async function moveTaskToColumn(
  store: DataStore,
  task: Task,
  column: BoardColumn,
  tasksInColumn: readonly Task[],
  now: Date = new Date(),
): Promise<void> {
  if (task.columnId === column.id) return;

  const patch: Partial<NewRow<Task>> = {
    columnId: column.id,
    position: endPosition(tasksInColumn),
    done: column.isDone,
  };

  // Finishing a repeating chore is what schedules the next one. Measured from
  // now rather than from the old due date, so doing it late does not make it
  // come straight back overdue.
  if (column.isDone && !task.done) {
    const due = nextDueDate(task, now);
    if (due !== undefined) patch.dueDate = due;
  }

  await store.tasks.update(task.id, patch);
}

/**
 * Brings back repeating tasks whose next occurrence has arrived: the same row,
 * marked outstanding again and moved out of the done column.
 *
 * There is no server, so this runs when somebody opens the app. A chore due on
 * Monday appears when the app is next opened, which for a chores board is fine.
 * Running it twice is harmless, since it only ever moves a task from done to
 * not-done and the second pass finds nothing to do.
 */
export async function reviveRecurring(
  store: DataStore,
  tasks: readonly Task[],
  columns: readonly BoardColumn[],
  now: Date = new Date(),
): Promise<number> {
  const target = reviveColumn(columns);
  if (target === undefined) return 0;

  const due = tasks.filter((task) => isDueAgain(task, now));
  let position = endPosition(tasks.filter((task) => task.columnId === target.id));

  for (const task of due) {
    await store.tasks.update(task.id, { done: false, columnId: target.id, position });
    position += POSITION_STEP;
  }
  return due.length;
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

/** Move a task up or down inside its own column. */
export async function reorderTask(
  store: DataStore,
  task: Task,
  siblings: readonly Task[],
  direction: Direction,
): Promise<void> {
  const sorted = [...siblings].sort(comparePosition);
  const index = sorted.findIndex((row) => row.id === task.id);
  const position = positionPastNeighbour(sorted, index, direction);
  if (position === null) return;
  await store.tasks.update(task.id, { position });
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
