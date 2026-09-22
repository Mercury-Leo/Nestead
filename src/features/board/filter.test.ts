import { describe, expect, it } from 'vitest';
import type { Task } from '../../domain/types';
import {
  NO_FILTER,
  UNASSIGNED,
  isFiltering,
  matchesFilter,
  parseFilter,
  withKnownAssignee,
} from './filter';

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

describe('matchesFilter', () => {
  it('matches everything with no filter', () => {
    expect(matchesFilter(task(), NO_FILTER)).toBe(true);
    expect(isFiltering(NO_FILTER)).toBe(false);
  });

  it('searches title and description, ignoring case and padding', () => {
    const bins = task({ description: 'Recycling goes on Tuesdays' });
    expect(matchesFilter(bins, { query: '  BINS ', assignee: '' })).toBe(true);
    expect(matchesFilter(bins, { query: 'tuesday', assignee: '' })).toBe(true);
    expect(matchesFilter(bins, { query: 'laundry', assignee: '' })).toBe(false);
  });

  it('treats a blank query as no query', () => {
    expect(isFiltering({ query: '   ', assignee: '' })).toBe(false);
  });

  it('filters by assignee', () => {
    const mine = task({ assigneeId: 'ann' });
    expect(matchesFilter(mine, { query: '', assignee: 'ann' })).toBe(true);
    expect(matchesFilter(mine, { query: '', assignee: 'bob' })).toBe(false);
    expect(matchesFilter(mine, { query: '', assignee: UNASSIGNED })).toBe(false);
    expect(matchesFilter(task(), { query: '', assignee: UNASSIGNED })).toBe(true);
  });

  it('requires both query and assignee to match', () => {
    const mine = task({ assigneeId: 'ann' });
    expect(matchesFilter(mine, { query: 'bins', assignee: 'ann' })).toBe(true);
    expect(matchesFilter(mine, { query: 'dishes', assignee: 'ann' })).toBe(false);
  });
});

describe('parseFilter', () => {
  it('round-trips a stored filter', () => {
    const filter = { query: 'bins', assignee: 'ann' };
    expect(parseFilter(JSON.parse(JSON.stringify(filter)))).toEqual(filter);
  });

  it('falls back to no filter for junk', () => {
    expect(parseFilter(undefined)).toEqual(NO_FILTER);
    expect(parseFilter('bins')).toEqual(NO_FILTER);
    expect(parseFilter({ query: 3, assignee: null })).toEqual(NO_FILTER);
  });
});

describe('withKnownAssignee', () => {
  it('keeps members, everyone and unassigned', () => {
    for (const assignee of ['ann', '', UNASSIGNED]) {
      const filter = { query: 'x', assignee };
      expect(withKnownAssignee(filter, ['ann'])).toEqual(filter);
    }
  });

  it('drops a member who no longer exists, keeping the query', () => {
    expect(withKnownAssignee({ query: 'x', assignee: 'gone' }, ['ann'])).toEqual({
      query: 'x',
      assignee: '',
    });
  });
});
