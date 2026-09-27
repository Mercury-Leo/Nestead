import { comparePosition, positionBetween } from '../../domain/position';
import type { Task } from '../../domain/types';

/**
 * Where a dragged card lands. Kept apart from the pointer handling in
 * useTaskDrag so the ordering rules can be tested without a DOM.
 */
export interface DropTarget {
  columnId: string;
  /** The card it lands directly above. Undefined for the bottom of the column. */
  beforeId?: string;
}

/**
 * The position for a task dropped into a column, directly above `beforeId` or
 * at the bottom. Null when the drop would leave it exactly where it is, so a
 * card picked up and put back writes nothing.
 *
 * `columnTasks` is every task in the column, not just the visible ones: while
 * the board is filtered, `beforeId` is the next visible card, and the task
 * lands directly above it whatever hidden cards sit in between.
 */
export function dropPosition(
  columnTasks: readonly Task[],
  task: Task,
  beforeId?: string,
): number | null {
  const sorted = [...columnTasks].sort(comparePosition);
  const from = sorted.findIndex((row) => row.id === task.id);
  const rest = sorted.filter((row) => row.id !== task.id);
  const before = beforeId === undefined ? -1 : rest.findIndex((row) => row.id === beforeId);
  const to = before === -1 ? rest.length : before;
  if (from === to) return null;
  return positionBetween(rest[to - 1]?.position, rest[to]?.position);
}

export interface CardSpan {
  id: string;
  top: number;
  bottom: number;
}

/**
 * The card a pointer at height `y` would drop above: the first whose middle is
 * below the pointer. Undefined past the last card's middle, meaning the bottom.
 * Cards must be in screen order and exclude the one being dragged.
 */
export function insertionBefore(cards: readonly CardSpan[], y: number): string | undefined {
  return cards.find((card) => y < (card.top + card.bottom) / 2)?.id;
}
