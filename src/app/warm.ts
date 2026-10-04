import type { DataStore } from '../data/types';
import { preloadCollection } from '../data/useCollection';

type ShowsModule = typeof import('../features/activities/shows/Shows');

let shows: ShowsModule | undefined;

/** The Shows page's code. AppRoutes.tsx loads the route through this too, so a warm start and the route share one download. */
export function loadShows(): Promise<ShowsModule> {
  return import('../features/activities/shows/Shows').then((module) => (shows = module));
}

/** The Shows page's code if it has already arrived, so the route can render it without suspending. */
export function loadedShows(): ShowsModule | undefined {
  return shows;
}

/**
 * What a page needs that sign-in did not already start, begun while someone
 * heads for its link: a pointer over it, a press, or focus (Nav.tsx). By the
 * click its code and first read may have landed, so it opens with its rows
 * instead of Loading. Pages whose rows preloadStore() reads at sign-in, and
 * the board, need nothing here.
 */
const WARMERS: Readonly<Record<string, (store: DataStore) => void>> = {
  '/shows': (store) => {
    // If the download fails, the route tries again when it renders and shows the error there.
    loadShows().catch(() => undefined);
    preloadCollection(store.shows);
  },
};

export function warmPage(path: string, store: DataStore): void {
  WARMERS[path]?.(store);
}
