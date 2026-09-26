import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
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
