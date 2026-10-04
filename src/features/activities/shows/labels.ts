import type { TFunction } from 'i18next';
import type { ShowKind, ShowStatus } from '../../../domain/types';

/** Stored statuses are kebab-case; translation keys are camelCase. */
export const STATUS_KEY = { 'to-watch': 'toWatch', watching: 'watching', watched: 'watched' } as const satisfies Record<ShowStatus, string>;

export function statusLabel(t: TFunction, status: ShowStatus): string {
  return t(`shows.status.${STATUS_KEY[status]}`);
}

export function kindLabel(t: TFunction, kind: ShowKind): string {
  return t(`shows.kind.${kind}`);
}

/** IMDb's page for a title. The id is checked by the server and the database (tt and digits). */
export function imdbUrl(imdbId: string): string {
  return `https://www.imdb.com/title/${encodeURIComponent(imdbId)}/`;
}
