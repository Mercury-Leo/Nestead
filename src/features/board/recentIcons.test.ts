import { beforeEach, describe, expect, it } from 'vitest';
import { readDevicePreference, writeDevicePreference } from '../../data/local/localStore';
import { RECENT_ICON_LIMIT, readRecentIcons, rememberIcon, withRecentIcon } from './recentIcons';

beforeEach(() => localStorage.clear());

describe('recent icons', () => {
  it('puts the newest first and keeps each icon once', () => {
    expect(withRecentIcon([], '🧽')).toEqual(['🧽']);
    expect(withRecentIcon(['🧹', '🧽', '🐈'], '🐈')).toEqual(['🐈', '🧹', '🧽']);
  });

  it(`keeps the last ${RECENT_ICON_LIMIT}`, () => {
    const full = ['🧹', '🧼', '🍽️', '🗑️', '🧺', '🛏️', '🛒', '🍳'];
    expect(withRecentIcon(full, '🧽')).toEqual(['🧽', ...full.slice(0, RECENT_ICON_LIMIT - 1)]);
  });

  it('remembers picks for this device, whichever family is open', () => {
    rememberIcon('🧽');
    rememberIcon('🐈');
    rememberIcon('🧽');

    expect(readRecentIcons()).toEqual(['🧽', '🐈']);
    expect(readDevicePreference('recentTaskIcons')).toEqual(['🧽', '🐈']);
  });

  it('ignores what it cannot use in the stored list', () => {
    writeDevicePreference('recentTaskIcons', 'nope');
    expect(readRecentIcons()).toEqual([]);

    // Not a string, no longer offered, a repeat.
    writeDevicePreference('recentTaskIcons', ['🧽', 3, '🦖', '🧽', '🐈']);
    expect(readRecentIcons()).toEqual(['🧽', '🐈']);
  });
});
