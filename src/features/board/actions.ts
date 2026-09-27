import type { DataStore } from '../../data/types';
import { POSITION_STEP, comparePosition, positionBetween } from '../../domain/position';
import type { BoardColumn, NewRow, Task } from '../../domain/types';
import { isDueAgain, nextOccurrence, reviveColumn } from './recurrence';

/** Which way a row moves within its list. */
export type Direction = 'up' | 'down';

/** The position that puts a new row at the end of a sorted list. */
export function endPosition(rows: ReadonlyArray<{ position: number }>): number {
  return positionBetween(rows[rows.length - 1]?.position, undefined);
}

/**
 * Put a task at a position in a column, its own or another. Dragging a card
 * comes through here.
 *
 * This is the only place that writes Task.done on a move: it is always taken
 * from the destination column's isDone, so the two can never drift apart.
 */
export async function placeTask(
  store: DataStore,
  task: Task,
  column: BoardColumn,
  position: number,
  now: Date = new Date(),
): Promise<void> {
  const patch: Partial<NewRow<Task>> = { position };
  if (task.columnId !== column.id) {
    patch.columnId = column.id;
    patch.done = column.isDone;
  }

  // Finishing a repeating chore is what schedules the next one: the next date
  // on its schedule that is still ahead, so doing it late does not make it
  // come straight back overdue.
  if (column.isDone && !task.done) {
    const next = nextOccurrence(task, now);
    if (next !== undefined) {
      patch.dueDate = next.dueDate;
      patch.recurFrom = next.recurFrom;
    }
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
