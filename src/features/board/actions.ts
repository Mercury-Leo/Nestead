import type { DataStore } from '../../data/types';
import { comparePosition, positionBetween } from '../../domain/position';
import type { BoardColumn, Task } from '../../domain/types';

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
): Promise<void> {
  if (task.columnId === column.id) return;
  await store.tasks.update(task.id, {
    columnId: column.id,
    position: endPosition(tasksInColumn),
    done: column.isDone,
  });
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
