import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import he from '../i18n/locales/he.json';
import { DEFAULT_PINS, MAX_PINS, SECTIONS, locate, resolvePins, togglePin } from './sections';

/** "section/page path" for a pathname, or undefined: short to compare. */
function where(pathname: string): string | undefined {
  const hit = locate(pathname);
  return hit === undefined ? undefined : `${hit.section.id}${hit.page.path}`;
}

describe('locate', () => {
  it('lights the board on / only', () => {
    expect(where('/')).toBe('board/');
    expect(where('/board-thing')).toBeUndefined();
  });

  it('counts recipe pages, adding and importing as Library', () => {
    for (const path of ['/library', '/recipe/abc', '/recipe/abc/cook', '/add', '/import']) {
      expect(where(path), path).toBe('larder/library');
    }
  });

  it("finds Larder's other pages", () => {
    expect(where('/search')).toBe('larder/search');
    expect(where('/pantry')).toBe('larder/pantry');
    expect(where('/profile')).toBe('larder/profile');
  });

  it('finds Lists and Family', () => {
    expect(where('/lists')).toBe('lists/lists');
    expect(where('/family')).toBe('family/family');
  });

  it('matches whole path segments, not prefixes of words', () => {
    expect(where('/nope')).toBeUndefined();
    expect(where('/listsx')).toBeUndefined();
    expect(where('/recipes')).toBeUndefined();
  });

  it('gives every route in AppRoutes a section', () => {
    const source = readFileSync(join(__dirname, 'AppRoutes.tsx'), 'utf8');
    const paths = [...source.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1] as string).filter((path) => path !== '*');
    // Guards the pattern: if it stops matching, the next line would pass vacuously.
    expect(paths.length).toBeGreaterThan(5);
    expect(paths.filter((path) => locate(path.replace(/:\w+/g, 'x')) === undefined)).toEqual([]);
  });
});

describe('the section list', () => {
  it('has unique section ids and page paths', () => {
    const ids = SECTIONS.map((section) => section.id);
    const paths = SECTIONS.flatMap((section) => section.pages.map((page) => page.path));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('has a label for every section and page in every locale', () => {
    const names = SECTIONS.flatMap((section) => [section.labelKey, ...section.pages.map((page) => page.labelKey)]).map((key) => key.slice('nav.'.length));
    for (const name of names) {
      expect(en.nav, name).toHaveProperty(name);
      expect(he.nav, name).toHaveProperty(name);
    }
  });

  it('never pins Family', () => {
    expect(SECTIONS.find((section) => section.id === 'family')?.pinnable).toBe(false);
  });
});

describe('resolvePins', () => {
  it('starts from the first pinnable sections', () => {
    // Activities joins these when it lands.
    expect(DEFAULT_PINS).toEqual(['board', 'lists', 'larder']);
  });

  it('falls back to the defaults for nothing, junk or an empty list', () => {
    expect(resolvePins(undefined)).toEqual(DEFAULT_PINS);
    expect(resolvePins('board')).toEqual(DEFAULT_PINS);
    expect(resolvePins([])).toEqual(DEFAULT_PINS);
    expect(resolvePins(['nope', 'family'])).toEqual(DEFAULT_PINS);
  });

  it('drops unknown, duplicate and unpinnable ids', () => {
    expect(resolvePins(['family', 'nope', 'lists', 'lists', 3])).toEqual(['lists']);
  });

  it('keeps the list order, not the order they were pinned in', () => {
    expect(resolvePins(['larder', 'board'])).toEqual(['board', 'larder']);
  });

  it('keeps at most the maximum', () => {
    expect(resolvePins(['board', 'lists', 'larder'], 2)).toEqual(['board', 'lists']);
    expect(resolvePins(SECTIONS.map((section) => section.id)).length).toBeLessThanOrEqual(MAX_PINS);
  });
});

describe('togglePin', () => {
  it('unpins a pinned section', () => {
    expect(togglePin(['board', 'lists', 'larder'], 'lists')).toEqual({ pins: ['board', 'larder'] });
  });

  it('pins an unpinned section in list order', () => {
    expect(togglePin(['larder'], 'board')).toEqual({ pins: ['board', 'larder'] });
  });

  it('refuses to unpin the last one', () => {
    expect(togglePin(['board'], 'board')).toEqual({ pins: ['board'], refused: 'keepOne' });
  });

  it('refuses a pin past the maximum, without swapping one out', () => {
    expect(togglePin(['board', 'lists'], 'larder', 2)).toEqual({ pins: ['board', 'lists'], refused: 'barFull' });
  });
});
