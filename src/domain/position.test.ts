import { describe, expect, it } from 'vitest';
import { POSITION_STEP, comparePosition, positionBetween } from './position';
import type { Base, Positioned } from './types';

function row(position: number, createdAt = '2026-01-01T00:00:00.000Z', id = 'a'): Base & Positioned {
  return { id, familyId: 'f', createdAt, updatedAt: createdAt, position };
}

describe('positionBetween', () => {
  it('starts at POSITION_STEP for an empty column', () => {
    expect(positionBetween(undefined, undefined)).toBe(POSITION_STEP);
  });

  it('appends after the last row', () => {
    expect(positionBetween(1000, undefined)).toBe(2000);
  });

  it('prepends before the first row', () => {
    expect(positionBetween(undefined, 1000)).toBe(0);
  });

  it('lands between two neighbours', () => {
    const between = positionBetween(1000, 2000);
    expect(between).toBeGreaterThan(1000);
    expect(between).toBeLessThan(2000);
  });

  it('keeps room after repeated inserts at the same spot', () => {
    let after = 2000;
    for (let i = 0; i < 20; i += 1) {
      const next = positionBetween(1000, after);
      expect(next).toBeGreaterThan(1000);
      expect(next).toBeLessThan(after);
      after = next;
    }
  });
});

describe('comparePosition', () => {
  it('orders by position', () => {
    const rows = [row(3000), row(1000), row(2000)].sort(comparePosition);
    expect(rows.map((r) => r.position)).toEqual([1000, 2000, 3000]);
  });

  it('breaks ties by createdAt, then id, so every client agrees', () => {
    const older = row(1000, '2026-01-01T00:00:00.000Z', 'z');
    const newer = row(1000, '2026-01-02T00:00:00.000Z', 'a');
    expect([newer, older].sort(comparePosition)).toEqual([older, newer]);

    const left = row(1000, '2026-01-01T00:00:00.000Z', 'a');
    const right = row(1000, '2026-01-01T00:00:00.000Z', 'b');
    expect([right, left].sort(comparePosition)).toEqual([left, right]);
  });
});
