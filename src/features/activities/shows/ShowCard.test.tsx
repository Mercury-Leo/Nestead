import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { OmdbDetails } from '../../../domain/shows';
import { localeReady } from '../../../i18n';
import { Facts } from './ShowCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: (() => void) | null = null;

/** The facts line's items, as the reader scans them. */
function facts(show: OmdbDetails): string[] {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Facts show={show} />));
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return [...(host.querySelector('p')?.children ?? [])].map((item) => (item.textContent ?? '').trim());
}

beforeAll(async () => {
  await localeReady;
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('Facts', () => {
  it("gives a series its seasons and an episode's length", () => {
    const items = facts({ imdbId: 'tt0386676', kind: 'series', title: 'The Office', year: 2005, totalSeasons: 9, runtimeMin: 22, imdbRating: 9 });
    expect(items.slice(0, 4)).toEqual(['2005', 'Series', '9 seasons', '22 min']);
  });

  it("gives a movie its length and no seasons", () => {
    const items = facts({ imdbId: 'tt1375666', kind: 'movie', title: 'Inception', year: 2010, runtimeMin: 148, totalSeasons: 3 });
    expect(items).toEqual(['2010', 'Movie', '148 min']);
  });

  it('leaves out what OMDb did not give', () => {
    expect(facts({ imdbId: 'tt0903747', kind: 'series', title: 'Breaking Bad' })).toEqual(['Series']);
  });
});
