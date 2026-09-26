import type { BoardColumn, Task } from '../../domain/types';

/**
 * Recurring chores.
 *
 * A recurring task is one row that comes back round, not a new row each time.
 * Completing it sets the next due date; when that date arrives the same task
 * becomes not-done again. Nothing is ever duplicated, so there is no way for
 * two clients to spawn the same chore twice.
 *
 * Due dates are plain YYYY-MM-DD, which compares correctly as a string.
 */

export interface RepeatOption {
  /** Its words are board.repeat.<key> in the translation file. */
  key: 'never' | 'day' | 'week' | 'twoWeeks' | 'month' | 'threeMonths';
  /** Absent means it does not repeat. */
  days?: number;
}

export const REPEAT_OPTIONS: readonly RepeatOption[] = [
  { key: 'never' },
  { key: 'day', days: 1 },
  { key: 'week', days: 7 },
  { key: 'twoWeeks', days: 14 },
  // 30 days rather than a calendar month: a chore does not care about the
  // difference, and it keeps the interval a single number.
  { key: 'month', days: 30 },
  { key: 'threeMonths', days: 90 },
];

/** Local calendar date, because "today" means the user's today. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** The due date a task should carry once it has just been completed. */
export function nextDueDate(task: Task, now: Date): string | undefined {
  if (task.recurEveryDays === undefined) return undefined;
  return toIsoDate(addDays(now, task.recurEveryDays));
}

/**
 * Done, recurring, and its next occurrence has come round. These are the tasks
 * to bring back.
 */
export function isDueAgain(task: Task, now: Date): boolean {
  if (task.recurEveryDays === undefined) return false;
  if (!task.done) return false;
  if (task.dueDate === undefined) return false;
  return task.dueDate <= toIsoDate(now);
}

/**
 * Outstanding and past its due date. Flagged rather than acted on: an overdue
 * chore is information, not something the app should quietly change.
 */
export function isOverdue(task: Task, now: Date): boolean {
  if (task.done) return false;
  if (task.dueDate === undefined) return false;
  return task.dueDate < toIsoDate(now);
}

/** Where a revived task goes: the first column that is not a done column. */
export function reviveColumn(columns: readonly BoardColumn[]): BoardColumn | undefined {
  return columns.find((column) => !column.isDone);
}
