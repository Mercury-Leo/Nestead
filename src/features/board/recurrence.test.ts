import { describe, expect, it } from 'vitest';
import type { BoardColumn, Task } from '../../domain/types';
import { addDays, isDueAgain, isOverdue, nextDueDate, reviveColumn, toIsoDate } from './recurrence';

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

function column(name: string, isDone: boolean, position: number): BoardColumn {
  return {
    id: name,
    familyId: 'f',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    name,
    position,
    isDone,
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

describe('nextDueDate', () => {
  it('is the interval from completion, not from the old due date', () => {
    // Done three weeks late: the next one is a week from now, so a neglected
    // chore does not immediately come back overdue.
    const late = task({ recurEveryDays: 7, dueDate: '2026-09-01' });
    expect(nextDueDate(late, NOW)).toBe('2026-09-29');
  });

  it('is undefined for a task that does not repeat', () => {
    expect(nextDueDate(task(), NOW)).toBeUndefined();
  });
});

describe('isDueAgain', () => {
  it('is true for a done recurring task whose date has arrived', () => {
    expect(isDueAgain(task({ done: true, recurEveryDays: 7, dueDate: '2026-09-22' }), NOW)).toBe(true);
  });

  it('is true when the date has passed', () => {
    expect(isDueAgain(task({ done: true, recurEveryDays: 7, dueDate: '2026-09-01' }), NOW)).toBe(true);
  });

  it('is false before the date arrives', () => {
    expect(isDueAgain(task({ done: true, recurEveryDays: 7, dueDate: '2026-09-29' }), NOW)).toBe(false);
  });

  it('is false while the task is still outstanding', () => {
    expect(isDueAgain(task({ done: false, recurEveryDays: 7, dueDate: '2026-09-01' }), NOW)).toBe(false);
  });

  it('is false for a one-off task, however old', () => {
    expect(isDueAgain(task({ done: true, dueDate: '2020-01-01' }), NOW)).toBe(false);
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

describe('reviveColumn', () => {
  it('picks the first column that is not a done column', () => {
    const columns = [column('To do', false, 1000), column('Doing', false, 2000), column('Done', true, 3000)];
    expect(reviveColumn(columns)?.name).toBe('To do');
  });

  it('skips a leading done column', () => {
    const columns = [column('Done', true, 1000), column('To do', false, 2000)];
    expect(reviveColumn(columns)?.name).toBe('To do');
  });

  it('is undefined when every column is a done column', () => {
    expect(reviveColumn([column('Done', true, 1000)])).toBeUndefined();
  });
});
