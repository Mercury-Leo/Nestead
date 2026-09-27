import { describe, expect, it } from 'vitest';
import type { ListGroup } from '../types';
import { groupDropPosition, groupEndPosition, groupStepPosition, orderGroups } from './list';

function group(id: string, createdAt: string, extra: Partial<ListGroup> = {}): ListGroup {
  return { id, familyId: 'f', name: id, createdAt, updatedAt: createdAt, ...extra };
}

const chemist = group('chemist', '2026-09-01T00:00:00.000Z');
const hardware = group('hardware', '2026-09-02T00:00:00.000Z');

const ids = (rows: readonly ListGroup[]): string[] => orderGroups(rows).map((slot) => slot.id);

describe('orderGroups', () => {
  it('keeps the old order when nothing has been moved', () => {
    expect(ids([hardware, chemist])).toEqual(['supermarket', 'general', 'chemist', 'hardware']);
  });

  it('places the built-ins by their position rows', () => {
    const rows = [chemist, hardware, group('s', '2026-09-03T00:00:00.000Z', { builtin: 'supermarket', position: 3500 })];
    expect(ids(rows)).toEqual(['general', 'chemist', 'supermarket', 'hardware']);
  });

  it('never shows a position row as a section of its own', () => {
    const rows = [group('g', '2026-09-03T00:00:00.000Z', { builtin: 'general', position: 500 })];
    expect(orderGroups(rows).map((slot) => slot.id)).toEqual(['general', 'supermarket']);
  });

  it('matches the numbers the migration writes', () => {
    expect(orderGroups([chemist, hardware]).map((slot) => slot.position)).toEqual([1000, 2000, 3000, 4000]);
  });
});

describe('groupDropPosition', () => {
  const slots = orderGroups([chemist, hardware]);

  it('lands between its new neighbours', () => {
    expect(groupDropPosition(slots, 'hardware', 'general')).toBe(1500);
  });

  it('goes last with no group below it', () => {
    expect(groupDropPosition(slots, 'supermarket', undefined)).toBe(5000);
  });

  it('goes first above the first group', () => {
    expect(groupDropPosition(slots, 'chemist', 'supermarket')).toBe(0);
  });

  it('writes nothing when put back where it was', () => {
    expect(groupDropPosition(slots, 'general', 'chemist')).toBeNull();
    expect(groupDropPosition(slots, 'hardware', undefined)).toBeNull();
  });
});

describe('groupStepPosition', () => {
  const slots = orderGroups([chemist, hardware]);

  it('swaps with the neighbour', () => {
    expect(groupStepPosition(slots, 'general', 'up')).toBe(0);
    expect(groupStepPosition(slots, 'general', 'down')).toBe(3500);
    expect(groupStepPosition(slots, 'chemist', 'down')).toBe(5000);
  });

  it('stays put at either end', () => {
    expect(groupStepPosition(slots, 'supermarket', 'up')).toBeNull();
    expect(groupStepPosition(slots, 'hardware', 'down')).toBeNull();
  });
});

describe('groupEndPosition', () => {
  it('is after every group', () => {
    expect(groupEndPosition(orderGroups([chemist]))).toBe(4000);
  });
});
