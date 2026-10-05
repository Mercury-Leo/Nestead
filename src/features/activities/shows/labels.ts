import type { TFunction } from 'i18next';
import type { ShowKind, ShowStatus } from '../../../domain/types';

/** Stored statuses are kebab-case; translation keys are camelCase. */
export const STATUS_KEY = { 'to-watch': 'toWatch', watching: 'watching', watched: 'watched', dropped: 'dropped' } as const satisfies Record<ShowStatus, string>;

export function statusLabel(t: TFunction, status: ShowStatus): string {
  return t(`shows.status.${STATUS_KEY[status]}`);
}

export function kindLabel(t: TFunction, kind: ShowKind): string {
  return t(`shows.kind.${kind}`);
}

/**
 * IMDb's genres, as the service stores them, to their translation keys. A
 * genre not listed here (one IMDb adds later) shows as stored, in English.
 */
export const GENRE_KEY = {
  Action: 'action',
  Adult: 'adult',
  Adventure: 'adventure',
  Animation: 'animation',
  Biography: 'biography',
  Comedy: 'comedy',
  Crime: 'crime',
  Documentary: 'documentary',
  Drama: 'drama',
  Family: 'family',
  Fantasy: 'fantasy',
  'Film-Noir': 'filmNoir',
  'Game-Show': 'gameShow',
  History: 'history',
  Horror: 'horror',
  Music: 'music',
  Musical: 'musical',
  Mystery: 'mystery',
  News: 'news',
  'Reality-TV': 'realityTv',
  Romance: 'romance',
  'Sci-Fi': 'sciFi',
  Short: 'short',
  Sport: 'sport',
  'Talk-Show': 'talkShow',
  Thriller: 'thriller',
  War: 'war',
  Western: 'western',
} as const;

function knownGenre(genre: string): genre is keyof typeof GENRE_KEY {
  return Object.hasOwn(GENRE_KEY, genre);
}

/** A genre in the screen's language. */
export function genreLabel(t: TFunction, genre: string): string {
  return knownGenre(genre) ? t(`shows.genre.${GENRE_KEY[genre]}`) : genre;
}

/** IMDb's page for a title. The id is checked by the server and the database (tt and digits). */
export function imdbUrl(imdbId: string): string {
  return `https://www.imdb.com/title/${encodeURIComponent(imdbId)}/`;
}
