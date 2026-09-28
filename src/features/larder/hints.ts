import { useSyncExternalStore } from 'react';
import { readDevicePreference, writeDevicePreference } from '../../data/local/localStore';

/**
 * Helper copy you only need once ("tap a time to start a timer") shows until
 * you have done what it explains, then stays hidden on this device. It is
 * device state, like the theme, so it never goes near the DataStore.
 *
 * - timers: a timer started in cook mode. Hides the detail footnote, the
 *   Steps aside in the recipe form and cook mode's empty-tray line.
 * - cookKeys, cookSwipe: moving between steps with the arrow keys, or a swipe.
 * - pantrySwipe: a pantry row swiped away. pantryAdd: an item added with Enter.
 */
export type Hint = 'timers' | 'cookKeys' | 'cookSwipe' | 'pantrySwipe' | 'pantryAdd';

const KEY = 'hintsUsed';
const listeners = new Set<() => void>();

function used(): string[] {
  const value = readDevicePreference(KEY);
  return Array.isArray(value) ? value.filter((hint): hint is string => typeof hint === 'string') : [];
}

export function markHintUsed(hint: Hint): void {
  const current = used();
  if (current.includes(hint)) return;
  writeDevicePreference(KEY, [...current, hint]);
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True until the hint's action has been done once on this device. */
export function useHint(hint: Hint): boolean {
  return useSyncExternalStore(subscribe, () => !used().includes(hint));
}
