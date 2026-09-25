import { beforeEach, describe, expect, it } from 'vitest';
import { writeDevicePreference } from '../data/localStore';
import { readThemeChoice, resolveTheme } from './theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('follows the system until someone picks', () => {
    expect(readThemeChoice()).toBe('system');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('keeps an explicit choice whatever the system says', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('reads the stored choice, and ignores anything it does not know', () => {
    writeDevicePreference('theme', 'dark');
    expect(readThemeChoice()).toBe('dark');
    writeDevicePreference('theme', 'sepia');
    expect(readThemeChoice()).toBe('system');
  });

  it('stores under the key index.html reads before first paint', () => {
    writeDevicePreference('theme', 'light');
    expect(JSON.parse(localStorage.getItem('nestead:device:pref:theme') ?? 'null')).toBe('light');
  });
});
