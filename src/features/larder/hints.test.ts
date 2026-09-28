import { afterEach, describe, expect, it } from 'vitest';
import { markHintUsed } from './hints';

describe('hints', () => {
  afterEach(() => localStorage.clear());

  it('are remembered for the device, once each', () => {
    markHintUsed('timers');
    markHintUsed('timers');
    markHintUsed('cookKeys');
    expect(JSON.parse(localStorage.getItem('nestead:device:pref:hintsUsed') ?? 'null')).toEqual(['timers', 'cookKeys']);
  });

  it('start over from a stored value that is not a list', () => {
    localStorage.setItem('nestead:device:pref:hintsUsed', '"timers"');
    markHintUsed('pantryAdd');
    expect(JSON.parse(localStorage.getItem('nestead:device:pref:hintsUsed') ?? 'null')).toEqual(['pantryAdd']);
  });
});
