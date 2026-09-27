import { describe, expect, it } from 'vitest';
import type { Task } from '../../domain/types';
import { dropPosition, insertionBefore } from './dragDrop';

function task(id: string, position: number, columnId = 'todo'): Task {
  return {
    id,
    familyId: 'f',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    title: id,
    columnId,
    position,
    done: false,
  };
}

const a = task('a', 1000);
const b = task('b', 2000);
const c = task('c', 3000);
const column = [c, a, b]; // Deliberately unsorted.

describe('dropPosition', () => {
  it('lands between the card above and the card it is dropped on', () => {
    expect(dropPosition(column, c, 'b')).toBe(1500);
  });

  it('goes above the first card', () => {
    expect(dropPosition(column, c, 'a')).toBe(0);
  });

  it('goes below the last card when there is no card to drop above', () => {
    expect(dropPosition(column, a, undefined)).toBe(4000);
  });

  it('ignores its own old place when moving down', () => {
    // a dropped above c: between b and c, not between a and c.
    expect(dropPosition(column, a, 'c')).toBe(2500);
  });

  it('writes nothing when put back where it was', () => {
    expect(dropPosition(column, b, 'c')).toBeNull();
    expect(dropPosition(column, c, undefined)).toBeNull();
    expect(dropPosition(column, a, 'b')).toBeNull();
  });

  it('places a task from another column', () => {
    const incoming = task('x', 1000, 'done');
    expect(dropPosition(column, incoming, 'a')).toBe(0);
    expect(dropPosition(column, incoming, 'b')).toBe(1500);
    expect(dropPosition(column, incoming, undefined)).toBe(4000);
  });

  it('starts an empty column', () => {
    expect(dropPosition([], task('x', 1000, 'done'), undefined)).toBe(1000);
  });

  it('lands directly above the target even past hidden cards', () => {
    // Filtered to a and c only: dropping x above c must not land above b too.
    expect(dropPosition(column, task('x', 500, 'done'), 'c')).toBe(2500);
  });

  it('falls back to the bottom when the target card has gone', () => {
    expect(dropPosition(column, task('x', 500, 'done'), 'deleted')).toBe(4000);
  });
});

describe('insertionBefore', () => {
  const cards = [
    { id: 'a', top: 0, bottom: 40 },
    { id: 'b', top: 50, bottom: 90 },
  ];

  it('picks the first card whose middle is below the pointer', () => {
    expect(insertionBefore(cards, 5)).toBe('a');
    expect(insertionBefore(cards, 25)).toBe('b');
    expect(insertionBefore(cards, 60)).toBe('b');
  });

  it('means the bottom past the last middle', () => {
    expect(insertionBefore(cards, 75)).toBeUndefined();
    expect(insertionBefore([], 10)).toBeUndefined();
  });
});
