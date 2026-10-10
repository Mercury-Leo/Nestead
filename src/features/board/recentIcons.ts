import { readDevicePreference, writeDevicePreference } from '../../data/local/localStore';
import { ALL_TASK_ICONS } from './icons';

/**
 * The icons last picked on this device, newest first, so the picker can offer
 * them before the rest. Device state, like the theme: each phone or laptop has
 * its own, whoever is signed in, and it never goes near the DataStore.
 */
const KEY = 'recentTaskIcons';
export const RECENT_ICON_LIMIT = 8;

/** `icon` moved to the front, without repeats, at most `RECENT_ICON_LIMIT` long. */
export function withRecentIcon(recent: readonly string[], icon: string): string[] {
  return [icon, ...recent.filter((other) => other !== icon)].slice(0, RECENT_ICON_LIMIT);
}

/** The stored list, keeping only icons the picker still offers. */
export function readRecentIcons(): string[] {
  const value = readDevicePreference(KEY);
  if (!Array.isArray(value)) return [];
  const known = new Set(ALL_TASK_ICONS);
  const icons = value.filter((icon): icon is string => typeof icon === 'string' && known.has(icon));
  return [...new Set(icons)].slice(0, RECENT_ICON_LIMIT);
}

export function rememberIcon(icon: string): void {
  writeDevicePreference(KEY, withRecentIcon(readRecentIcons(), icon));
}
