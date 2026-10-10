import { describe, expect, it } from 'vitest';
import type { Task } from '../../domain/types';
import {
  REPEAT_OPTIONS,
  addDays,
  addMonths,
  doneAtOf,
  fromIsoDate,
  isDueAgain,
  isOverdue,
  nextOccurrence,
  repeatOf,
  returnDate,
  schedulePatch,
  toIsoDate,
} from './recurrence';

const NOW = new Date(2026, 8, 22); // 22 September 2026, local time.

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't',
    familyId: 'f',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    title: 'Take the bins out',
    columnId: 'c',
    position: 1000,
    done: false,
    ...overrides,
  };
}

describe('toIsoDate', () => {
  it('formats the local calendar date, not UTC', () => {
    // Late evening: a UTC-based conversion would roll this into the 23rd for
    // anyone east of Greenwich, and show tomorrow's chores tonight.
    expect(toIsoDate(new Date(2026, 8, 22, 23, 30))).toBe('2026-09-22');
  });

  it('pads single digits', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(toIsoDate(addDays(new Date(2026, 8, 22), 30))).toBe('2026-10-22');
  });

  it('crosses a year boundary', () => {
    expect(toIsoDate(addDays(new Date(2026, 11, 20), 30))).toBe('2027-01-19');
  });

  it('does not mutate its argument', () => {
    const original = new Date(2026, 8, 22);
    addDays(original, 7);
    expect(toIsoDate(original)).toBe('2026-09-22');
  });
});

describe('fromIsoDate', () => {
  it('is local midnight on that date', () => {
    expect(fromIsoDate('2026-07-05').getTime()).toBe(new Date(2026, 6, 5).getTime());
  });

  it('round-trips through toIsoDate', () => {
    expect(toIsoDate(fromIsoDate('2027-02-28'))).toBe('2027-02-28');
  });
});

describe('addMonths', () => {
  it('keeps the day of the month', () => {
    expect(toIsoDate(addMonths(new Date(2026, 6, 5), 1))).toBe('2026-08-05');
  });

  it('crosses a year boundary', () => {
    expect(toIsoDate(addMonths(new Date(2026, 10, 5), 3))).toBe('2027-02-05');
  });

  it('clamps to the last day of a shorter month', () => {
    expect(toIsoDate(addMonths(new Date(2027, 0, 31), 1))).toBe('2027-02-28');
    expect(toIsoDate(addMonths(new Date(2028, 0, 31), 1))).toBe('2028-02-29');
  });
});

describe('nextOccurrence', () => {
  const monthly = { recurEveryMonths: 1, dueDate: '2026-07-05', recurFrom: '2026-07-05' };

  it('keeps a monthly chore on the same day of the month', () => {
    // Due 5 July, done on the day: next due 5 August.
    expect(nextOccurrence(task(monthly), new Date(2026, 6, 5))?.dueDate).toBe('2026-08-05');
  });

  it('counts from the due date, not the day it was done', () => {
    // Done two weeks late, on the 19th: still the 5th next month.
    expect(nextOccurrence(task(monthly), new Date(2026, 6, 19))?.dueDate).toBe('2026-08-05');
  });

  it('done early, skips only the occurrence it was due for', () => {
    expect(nextOccurrence(task(monthly), new Date(2026, 5, 20))?.dueDate).toBe('2026-08-05');
  });

  it('skips missed occurrences rather than coming back overdue', () => {
    // Due 5 July, not done until 10 September: 5 August and 5 September have
    // gone, so the next one is 5 October.
    expect(nextOccurrence(task(monthly), new Date(2026, 8, 10))?.dueDate).toBe('2026-10-05');
  });

  it('keeps the schedule it counts from', () => {
    expect(nextOccurrence(task(monthly), NOW)?.recurFrom).toBe('2026-07-05');
  });

  it('goes back to the 31st after a short month', () => {
    // Clamped to 28 February, but March is the 31st again.
    const endOfMonth = task({ recurEveryMonths: 1, dueDate: '2027-02-28', recurFrom: '2027-01-31' });
    expect(nextOccurrence(endOfMonth, new Date(2027, 1, 28))?.dueDate).toBe('2027-03-31');
  });

  it('repeats by days from the due date', () => {
    const weekly = task({ recurEveryDays: 7, dueDate: '2026-09-21', recurFrom: '2026-09-07' });
    expect(nextOccurrence(weekly, NOW)?.dueDate).toBe('2026-09-28');
  });

  it('counts from the due date when there is no recurFrom yet', () => {
    const weekly = task({ recurEveryDays: 7, dueDate: '2026-09-20' });
    expect(nextOccurrence(weekly, NOW)).toEqual({ dueDate: '2026-09-27', recurFrom: '2026-09-20' });
  });

  it('with no due date, counts from the day it is done', () => {
    expect(nextOccurrence(task({ recurEveryDays: 7 }), NOW)).toEqual({
      dueDate: '2026-09-29',
      recurFrom: '2026-09-22',
    });
  });

  it('is undefined for a task that does not repeat', () => {
    expect(nextOccurrence(task({ dueDate: '2026-09-22' }), NOW)).toBeUndefined();
  });
});

describe('repeatOf', () => {
  it('finds the option a schedule came from', () => {
    expect(repeatOf(task({ recurEveryMonths: 3 }))?.key).toBe('threeMonths');
    expect(repeatOf(task({ recurEveryDays: 14 }))?.key).toBe('twoWeeks');
  });

  it('is never for a task that does not repeat', () => {
    expect(repeatOf(task())?.key).toBe('never');
  });
});

describe('schedulePatch', () => {
  const option = (key: string) => REPEAT_OPTIONS.find((row) => row.key === key);

  it('counts a new schedule from the due date', () => {
    expect(schedulePatch(option('month'), '2026-07-05')).toEqual({
      recurEveryDays: undefined,
      recurEveryMonths: 1,
      recurFrom: '2026-07-05',
    });
  });

  it('clears every schedule field for never', () => {
    expect(schedulePatch(option('never'), '2026-07-05')).toEqual({
      recurEveryDays: undefined,
      recurEveryMonths: undefined,
      recurFrom: undefined,
    });
  });

  it('switching from months to days clears the months', () => {
    expect(schedulePatch(option('week'), undefined).recurEveryMonths).toBeUndefined();
  });
});

/** Local time, as an ISO timestamp: the tick happened on that local day. */
const at = (year: number, month: number, day: number, hour = 12): string => new Date(year, month - 1, day, hour).toISOString();

describe('doneAtOf', () => {
  it('is doneAt', () => {
    expect(doneAtOf(task({ done: true, doneAt: at(2026, 9, 20) })).toISOString()).toBe(at(2026, 9, 20));
  });

  it('falls back to updatedAt for a task ticked before doneAt existed', () => {
    expect(doneAtOf(task({ done: true, updatedAt: '2026-09-03T10:00:00.000Z' })).toISOString()).toBe('2026-09-03T10:00:00.000Z');
  });
});

describe('returnDate', () => {
  const weekly = { recurEveryDays: 7, recurFrom: '2026-09-01' };

  it('is the next round after the one it covered, done on time', () => {
    expect(returnDate(task({ ...weekly, done: true, dueDate: '2026-09-15', doneAt: at(2026, 9, 15) }))).toBe('2026-09-22');
  });

  it('skips only the covered round when done early', () => {
    expect(returnDate(task({ ...weekly, done: true, dueDate: '2026-09-15', doneAt: at(2026, 9, 13) }))).toBe('2026-09-22');
  });

  it('skips missed rounds when done late, so it does not come straight back overdue', () => {
    expect(returnDate(task({ ...weekly, done: true, dueDate: '2026-09-01', doneAt: at(2026, 9, 17) }))).toBe('2026-09-22');
  });

  it('keeps a monthly chore on the 31st through a short month', () => {
    const monthly = { recurEveryMonths: 1, recurFrom: '2026-01-31' };
    expect(returnDate(task({ ...monthly, done: true, dueDate: '2026-10-31', doneAt: at(2026, 10, 31) }))).toBe('2026-11-30');
    expect(returnDate(task({ ...monthly, done: true, dueDate: '2026-11-30', doneAt: at(2026, 11, 30) }))).toBe('2026-12-31');
  });

  it('counts from the day it was done when the repeat has no due date', () => {
    expect(returnDate(task({ recurEveryDays: 7, done: true, doneAt: at(2026, 9, 10) }))).toBe('2026-09-17');
  });

  it('returns a repeat the migration moved back a day on the date it showed before', () => {
    // Before the change: done on 23 Sep, due date already moved on to the 29th.
    // The migration made it the 28th.
    expect(returnDate(task({ ...weekly, done: true, dueDate: '2026-09-28', doneAt: at(2026, 9, 23) }))).toBe('2026-09-29');
    const monthly = { recurEveryMonths: 1, recurFrom: '2026-01-31' };
    expect(returnDate(task({ ...monthly, done: true, dueDate: '2026-11-29', doneAt: at(2026, 10, 31) }))).toBe('2026-11-30');
  });

  it('is undefined for an open task or a one-off', () => {
    expect(returnDate(task({ ...weekly, done: false, dueDate: '2026-09-15' }))).toBeUndefined();
    expect(returnDate(task({ done: true, dueDate: '2026-09-15', doneAt: at(2026, 9, 15) }))).toBeUndefined();
  });
});

describe('isDueAgain', () => {
  const weekly = { recurEveryDays: 7, recurFrom: '2026-09-01', dueDate: '2026-09-15' };

  it('is true on the return date', () => {
    expect(isDueAgain(task({ ...weekly, done: true, doneAt: at(2026, 9, 15) }), NOW)).toBe(true);
  });

  it('is true after the return date', () => {
    expect(isDueAgain(task({ ...weekly, done: true, doneAt: at(2026, 9, 15) }), new Date(2026, 8, 25))).toBe(true);
  });

  it('is false before the return date', () => {
    expect(isDueAgain(task({ ...weekly, done: true, doneAt: at(2026, 9, 15) }), new Date(2026, 8, 21, 23, 59))).toBe(false);
  });

  it('is false while the task is still outstanding', () => {
    expect(isDueAgain(task({ ...weekly, done: false }), NOW)).toBe(false);
  });

  it('is false for a one-off task, however old', () => {
    expect(isDueAgain(task({ done: true, dueDate: '2020-01-01', doneAt: at(2020, 1, 1) }), NOW)).toBe(false);
  });
});

describe('isOverdue', () => {
  it('flags an outstanding task past its date', () => {
    expect(isOverdue(task({ dueDate: '2026-09-21' }), NOW)).toBe(true);
  });

  it('does not flag one due today', () => {
    expect(isOverdue(task({ dueDate: '2026-09-22' }), NOW)).toBe(false);
  });

  it('does not flag a completed task', () => {
    expect(isOverdue(task({ done: true, dueDate: '2020-01-01' }), NOW)).toBe(false);
  });

  it('does not flag a task with no due date', () => {
    expect(isOverdue(task(), NOW)).toBe(false);
  });
});
