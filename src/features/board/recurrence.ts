import type { Task } from '../../domain/types';

/**
 * Recurring chores.
 *
 * A recurring task is one row that comes back round, not a new row each time.
 * Ticking it leaves its due date alone (the round it covered) and records
 * doneAt; its return date is worked out from the two, and when that date
 * arrives the same task is unticked with the new due date (reviveRecurring()
 * in actions.ts). Nothing is ever duplicated, so there is no way for two
 * clients to spawn the same chore twice.
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
 * The first date on a repeating task's schedule after both its due date and
 * `now`, and the date its schedule counts from. Undefined for a one-off.
 *
 * With `now` as the day the task was done, it is when a done repeat comes back
 * (returnDate(), reviveRecurring()). Done early, the chore skips only the
 * occurrence it was due for; done late, missed occurrences are skipped too, so
 * it does not come straight back overdue. A repeating task with no due date
 * counts from `now`.
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
 * When a done task was ticked. A task ticked before doneAt existed falls back
 * to its last change, which the migration also used.
 */
export function doneAtOf(task: Task): Date {
  return new Date(task.doneAt ?? task.updatedAt);
}

/**
 * The day a done repeating task comes back: the next date on its schedule
 * after both the round it covered and the day it was done. Undefined for an
 * open task or a one-off.
 */
export function returnDate(task: Task): string | undefined {
  if (!task.done) return undefined;
  return nextOccurrence(task, doneAtOf(task))?.dueDate;
}

/** Done, recurring, and its return date has come round. These are the tasks to bring back. */
export function isDueAgain(task: Task, now: Date): boolean {
  const date = returnDate(task);
  return date !== undefined && date <= toIsoDate(now);
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
