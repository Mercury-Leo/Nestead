import type { BoardColumn, Task } from '../../domain/types';

/**
 * Recurring chores.
 *
 * A recurring task is one row that comes back round, not a new row each time.
 * Completing it moves its due date to the next date on its schedule; when that
 * date arrives the same task becomes not-done again. Nothing is ever
 * duplicated, so there is no way for two clients to spawn the same chore twice.
 *
 * The schedule counts from the task's due date, kept in recurFrom: a monthly
 * chore due on 5 July comes round on the 5th of every month, whenever it is
 * actually done. recurFrom is kept apart from dueDate so a chore on the 31st
 * goes back to the 31st after a shorter month has clamped it to the 30th.
 *
 * Due dates are plain YYYY-MM-DD, which compares correctly as a string.
 */

export interface RepeatOption {
  /** Its words are board.repeat.<key> in the translation file. */
  key: 'never' | 'day' | 'week' | 'twoWeeks' | 'month' | 'threeMonths';
  /** Days between occurrences. */
  days?: number;
  /** Calendar months between occurrences, so the day of the month stays put. */
  months?: number;
}

export const REPEAT_OPTIONS: readonly RepeatOption[] = [
  { key: 'never' },
  { key: 'day', days: 1 },
  { key: 'week', days: 7 },
  { key: 'twoWeeks', days: 14 },
  { key: 'month', months: 1 },
  { key: 'threeMonths', months: 3 },
];

type Schedule = Pick<Task, 'recurEveryDays' | 'recurEveryMonths'>;

/** The option a task's schedule was set from. Undefined if none matches. */
export function repeatOf(task: Schedule): RepeatOption | undefined {
  return REPEAT_OPTIONS.find(
    (option) => option.days === task.recurEveryDays && option.months === task.recurEveryMonths,
  );
}

export function repeats(task: Schedule): boolean {
  return (task.recurEveryDays ?? 0) > 0 || (task.recurEveryMonths ?? 0) > 0;
}

/**
 * The schedule fields to write when a task is set to repeat by an option, or
 * to stop repeating. The schedule counts from the due date, if there is one.
 */
export function schedulePatch(
  option: RepeatOption | undefined,
  dueDate: string | undefined,
): Pick<Task, 'recurEveryDays' | 'recurEveryMonths' | 'recurFrom'> {
  const on = option !== undefined && repeats({ recurEveryDays: option.days, recurEveryMonths: option.months });
  return {
    recurEveryDays: on ? option.days : undefined,
    recurEveryMonths: on ? option.months : undefined,
    recurFrom: on ? dueDate : undefined,
  };
}

/** Local calendar date, because "today" means the user's today. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Local midnight on a YYYY-MM-DD date, the inverse of toIsoDate. */
export function fromIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The same day of the month, months later. A day the target month lacks
 * becomes its last day: 31 January plus a month is 28 or 29 February.
 */
export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(date.getDate(), lastDay));
  return next;
}

/**
 * The due date a task should carry once it has just been completed, and the
 * date its schedule counts from.
 *
 * It is the first date on the schedule after both the current due date and
 * today. Done early, the chore skips only the occurrence it was due for; done
 * late, missed occurrences are skipped too, so it does not come straight back
 * overdue. A repeating task with no due date counts from the day it is done.
 */
export function nextOccurrence(
  task: Schedule & Pick<Task, 'dueDate' | 'recurFrom'>,
  now: Date,
): { dueDate: string; recurFrom: string } | undefined {
  if (!repeats(task)) return undefined;
  const today = toIsoDate(now);
  const recurFrom = task.recurFrom ?? task.dueDate ?? today;
  const after = task.dueDate !== undefined && task.dueDate > today ? task.dueDate : today;
  const anchor = fromIsoDate(recurFrom);
  const months = task.recurEveryMonths ?? 0;
  const days = task.recurEveryDays ?? 0;

  // Each date is worked out from the anchor, never from the one before, so a
  // clamped month does not pull every later month down with it.
  for (let n = 0; ; n += 1) {
    const date = toIsoDate(months > 0 ? addMonths(anchor, n * months) : addDays(anchor, n * days));
    if (date > after) return { dueDate: date, recurFrom };
  }
}

/**
 * Done, recurring, and its next occurrence has come round. These are the tasks
 * to bring back.
 */
export function isDueAgain(task: Task, now: Date): boolean {
  if (!repeats(task)) return false;
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
