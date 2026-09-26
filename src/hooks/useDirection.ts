import { useSyncExternalStore } from 'react';

export type Direction = 'ltr' | 'rtl';

/**
 * The document's reading direction, from <html dir>, kept live.
 *
 * index.html sets it before first paint and the locale provider keeps it in
 * sync, but this watches the attribute itself rather than the provider, so it
 * also follows a manual `document.documentElement.dir = 'rtl'`.
 *
 * For behaviour that CSS can't flip: swipe gestures and arrow keys that mean
 * forward and back.
 */
export function useDirection(): Direction {
  return useSyncExternalStore(subscribe, readDirection, () => 'ltr');
}

export function readDirection(): Direction {
  return document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
  return () => observer.disconnect();
}
