import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import en from './locales/en.json';
import { formatList, isolateNumber } from './format';
import { LOCALES, i18n, localeInfo } from './i18n';
import { pseudoLocalize, pseudoString } from './pseudo';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => flatten(child, prefix === '' ? key : `${prefix}.${key}`));
}

const KEYS = new Set(flatten(en));
const PLURAL = /_(zero|one|two|few|many|other)$/;

/** A key is there if it is, or if its plural forms are. */
function has(key: string): boolean {
  return KEYS.has(key) || KEYS.has(`${key}_other`);
}

/** Quoted strings in a snippet that look like keys: "search.noResults.query". */
function keysIn(snippet: string): string[] {
  return [...snippet.matchAll(/['"]([a-zA-Z][\w]*(?:\.[\w]+)+)['"]/g)].map((match) => match[1] as string);
}

/**
 * Keys used in the source: the first argument of t() or i18n.t(), and
 * i18nKey on <Trans>, including both sides of a ternary. Template-literal keys
 * (t(`kitchen.section.${key}`)) are checked by the compiler instead: keys are
 * typed from en.json, see i18next.d.ts.
 */
function usedKeys(): { key: string; file: string }[] {
  const used: { key: string; file: string }[] = [];
  for (const path of sourceFiles(SRC)) {
    const text = readFileSync(path, 'utf8');
    const file = relative(SRC, path);
    for (const match of text.matchAll(/\b(?:i18n\.)?t\(\s*((?:'[^']*'|"[^"]*"|[^,()'"`])+)/g)) {
      for (const key of keysIn(match[1] as string)) used.push({ key, file });
    }
    for (const match of text.matchAll(/i18nKey=(?:"([^"]+)"|\{([^{}]+)\})/g)) {
      const keys = match[1] !== undefined ? [match[1]] : keysIn(match[2] as string);
      for (const key of keys) used.push({ key, file });
    }
  }
  return used;
}

describe('translations', () => {
  it('finds keys in the source at all', () => {
    // Guards the scanner itself: if the patterns stop matching, the next test would pass vacuously.
    expect(usedKeys().length).toBeGreaterThan(300);
  });

  it('has every key the source uses', () => {
    const missing = usedKeys().filter(({ key }) => !has(key));
    expect(missing).toEqual([]);
  });

  it('has every key that en.json nests with $t()', () => {
    const nested = flatten(en).flatMap((key) => {
      const value = i18n.getResource('en', 'translation', key) as string;
      return [...value.matchAll(/\$t\(([\w.]+)/g)].map((match) => match[1] as string);
    });
    expect(nested.filter((key) => !has(key))).toEqual([]);
  });

  it('gives every plural both English forms', () => {
    const plurals = [...KEYS].filter((key) => PLURAL.test(key)).map((key) => key.replace(PLURAL, ''));
    const incomplete = [...new Set(plurals)].filter((key) => !KEYS.has(`${key}_one`) || !KEYS.has(`${key}_other`));
    expect(incomplete).toEqual([]);
  });

  it('picks plural forms by count', () => {
    expect(i18n.t('common.recipes', { count: 1 })).toBe('1 recipe');
    expect(i18n.t('common.recipes', { count: 3 })).toBe('3 recipes');
    expect(i18n.t('common.recipes', { count: 1200 })).toBe('1,200 recipes');
  });

  it('uses the plural categories of the language it is in', () => {
    const he = i18n.getFixedT('he');
    expect(he('kitchen.duration.hours', { count: 1 })).toBe('שעה');
    expect(he('kitchen.duration.hours', { count: 2 })).toBe('שעתיים');
    expect(he('kitchen.duration.hours', { count: 3 })).toBe('3 שעות');
    expect(he('common.recipes', { count: 1200 })).toBe('1,200 מתכונים');
  });
});

/* ------------------------------------------------------ other locales -- */

const LOCALE_DIR = join(__dirname, 'locales');
const OTHER_LOCALES = readdirSync(LOCALE_DIR)
  .filter((name) => name.endsWith('.json') && name !== 'en.json')
  .map((name) => {
    const code = name.replace(/\.json$/, '');
    const values = new Map<string, string>();
    const collect = (value: unknown, prefix: string): void => {
      if (typeof value === 'string') values.set(prefix, value);
      else for (const [key, child] of Object.entries(value as Record<string, unknown>)) collect(child, prefix === '' ? key : `${prefix}.${key}`);
    };
    collect(JSON.parse(readFileSync(join(LOCALE_DIR, name), 'utf8')), '');
    return { code, values, categories: new Intl.PluralRules(code).resolvedOptions().pluralCategories as string[] };
  });

const EN_VALUES = new Map(flatten(en).map((key) => [key, i18n.getResource('en', 'translation', key) as string]));
/** Keys en.json gives plural forms, without the suffix: "common.recipes". */
const EN_PLURALS = new Set([...KEYS].filter((key) => PLURAL.test(key)).map((key) => key.replace(PLURAL, '')));

/** The en key a locale's key answers to: itself, or for a plural form of any category, en's _other. */
function enKeyFor(key: string): string | undefined {
  if (KEYS.has(key)) return key;
  const base = key.replace(PLURAL, '');
  return base !== key && EN_PLURALS.has(base) ? `${base}_other` : undefined;
}

/** {{placeholders}}, with their format, and tags: what a translation must carry over from English. */
function markers(value: string): { placeholders: string[]; tags: string[] } {
  return {
    placeholders: [...new Set(value.match(/\{\{[^}]*\}\}/g) ?? [])].sort(),
    tags: (value.match(/<\/?[\w]+\s*\/?>/g) ?? []).sort(),
  };
}

describe.each(OTHER_LOCALES)('locale file $code', ({ code, values, categories }) => {
  it('is wired up in i18n.ts', () => {
    expect(LOCALES.map((locale) => locale.code)).toContain(code);
  });

  it('has every key en.json has', () => {
    const missing = [...KEYS].filter((key) => {
      const base = key.replace(PLURAL, '');
      return EN_PLURALS.has(base) ? !values.has(`${base}_other`) : !values.has(key);
    });
    expect(missing).toEqual([]);
  });

  it('has no keys en.json lacks, apart from its own plural categories', () => {
    const extra = [...values.keys()].filter((key) => {
      if (KEYS.has(key)) return false;
      const match = PLURAL.exec(key);
      return match === null || !EN_PLURALS.has(key.replace(PLURAL, '')) || !categories.includes(match[1] as string);
    });
    expect(extra).toEqual([]);
  });

  it('keeps every placeholder and tag of the English', () => {
    const changed = [...values].flatMap(([key, value]) => {
      const enKey = enKeyFor(key);
      if (enKey === undefined) return [];
      const want = markers(EN_VALUES.get(enKey) as string);
      const got = markers(value);
      // A plural form may say its number in words ("one recipe", "two hours"), so it can leave out {{count}}.
      const optional = (placeholder: string): boolean => PLURAL.test(key) && /^\{\{count\b/.test(placeholder);
      const placeholders = want.placeholders.filter((placeholder) => !optional(placeholder) || got.placeholders.includes(placeholder));
      return JSON.stringify(got.placeholders) === JSON.stringify(placeholders) && JSON.stringify(got.tags) === JSON.stringify(want.tags) ? [] : [{ key, en: EN_VALUES.get(enKey), [code]: value }];
    });
    expect(changed).toEqual([]);
  });

  it(`gives every plural each category Intl reports`, () => {
    const incomplete = [...EN_PLURALS].flatMap((base) => {
      const absent = categories.filter((category) => !values.has(`${base}_${category}`));
      return absent.length === 0 ? [] : [`${base}: ${absent.join(', ')}`];
    });
    expect(incomplete).toEqual([]);
  });
});

describe('locales', () => {
  it('starts with English, left to right', () => {
    expect(LOCALES[0]).toMatchObject({ code: 'en', dir: 'ltr' });
    expect(localeInfo('xx').code).toBe('en');
  });

  it('sets the same lang and dir before first paint as the provider does after', () => {
    // The second inline script in index.html, run against each locale this build knows.
    const html = readFileSync(join(SRC, '..', 'index.html'), 'utf8');
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] as string).find((body) => body.includes('pref:locale'));
    expect(script).toBeDefined();
    // The theme half of the script asks for the system setting, which jsdom does not have.
    window.matchMedia ??= (query: string) => ({ matches: false, media: query }) as MediaQueryList;
    for (const locale of [...LOCALES, { code: 'ar', dir: 'rtl' }, { code: 'he-IL', dir: 'rtl' }, { code: 'fr', dir: 'ltr' }]) {
      localStorage.setItem('nestead:device:pref:locale', JSON.stringify(locale.code));
      new Function(script as string)();
      expect([document.documentElement.lang, document.documentElement.dir]).toEqual([locale.code, locale.dir]);
    }
    localStorage.clear();
  });
});

describe('right-to-left formatting', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('leaves left-to-right lists and numbers as they are', () => {
    expect(formatList(['Soup', 'Bread'])).toBe('Soup and Bread');
    expect(isolateNumber('1½')).toBe('1½');
  });

  it('isolates each list item and starts the list right to left', async () => {
    await i18n.changeLanguage('he');
    const list = formatList(['Soup', 'Bread']);
    expect(list.startsWith('\u200f')).toBe(true);
    expect(list).toContain('\u2068Soup\u2069');
    expect(list).toContain('\u2068Bread\u2069');
    expect(isolateNumber('1½')).toBe('\u20661½\u2069');
  });
});

describe('pseudo-locale', () => {
  it('wraps, accents and lengthens, and leaves placeholders and tags alone', () => {
    const out = pseudoString('Delete “<bdi>{{name}}</bdi>” for everyone?');
    expect(out.startsWith('[!! ')).toBe(true);
    expect(out.endsWith(' !!]')).toBe(true);
    expect(out).toContain('<bdi>{{name}}</bdi>');
    expect(out).toContain('Délété');
    expect(out.length).toBeGreaterThan('Delete “<bdi>{{name}}</bdi>” for everyone?'.length * 1.2);
  });

  it('keeps every key', () => {
    expect(flatten(pseudoLocalize(en))).toEqual(flatten(en));
  });
});
