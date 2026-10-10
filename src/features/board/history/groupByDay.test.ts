import { describe, expect, it } from 'vitest';
import type { TaskCompletion } from '../../../domain/types';
import { groupByDay } from './groupByDay';

const NOW = new Date(2026, 9, 10, 9, 0); // Saturday 10 October 2026, 09:00 local.

function entry(id: string, at: Date): TaskCompletion {
  const iso = at.toISOString();
  return { id, familyId: 'f', createdAt: iso, updatedAt: iso, taskId: `t-${id}`, title: id };
}

describe('groupByDay', () => {
  it('groups by local day, newest first, and names today and yesterday', () => {
    const groups = groupByDay(
      [
        entry('thu', new Date(2026, 9, 8, 20, 0)),
        entry('justAfterMidnight', new Date(2026, 9, 10, 0, 1)),
        entry('justBeforeMidnight', new Date(2026, 9, 9, 23, 59)),
        entry('morning', new Date(2026, 9, 10, 8, 30)),
      ],
      NOW,
    );

    expect(groups.map((group) => [group.day, group.relative, group.entries.map((row) => row.id)])).toEqual([
      ['2026-10-10', 'today', ['morning', 'justAfterMidnight']],
      ['2026-10-09', 'yesterday', ['justBeforeMidnight']],
      ['2026-10-08', undefined, ['thu']],
    ]);
  });

  it('is empty for no entries', () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});
