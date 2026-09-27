import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readDevicePreference } from '../data/local/localStore';
import en from './locales/en.json';

/**
 * The i18next instance. English is bundled; other languages are split out and
 * fetched the first time they are used, so nobody downloads a language they
 * do not read. Adding one means adding locales/<code>.json, a line in LOCALES
 * and a line in LOADERS. There is no language detector; the locale is the
 * person's choice, stored per device.
 */

export type Direction = 'ltr' | 'rtl';

export interface LocaleInfo {
  code: string;
  dir: Direction;
  /** Shown in the language picker, in the language itself. */
  name: string;
  /**
   * The locale Intl formats dates, numbers and lists with. English copy is
   * British ("favourite", "centred"), and en-GB also keeps lists as "a, b and
   * c", as they read before there were translations.
   */
  intl: string;
}

export const LOCALES: readonly LocaleInfo[] = [
  { code: 'en', dir: 'ltr', name: 'English', intl: 'en-GB' },
  { code: 'he', dir: 'rtl', name: 'עברית', intl: 'he' },
];

export const DEFAULT_LOCALE = 'en';

/** Keep in step with the script in index.html, which reads it before first paint. */
export const LOCALE_PREFERENCE = 'locale';

export function localeInfo(code: string): LocaleInfo {
  return LOCALES.find((locale) => locale.code === code) ?? (LOCALES[0] as LocaleInfo);
}

/** The stored choice if this build has it, else English. */
export function readLocale(): string {
  const value = readDevicePreference(LOCALE_PREFERENCE);
  return typeof value === 'string' && LOCALES.some((locale) => locale.code === value) ? value : DEFAULT_LOCALE;
}

/**
 * Other locales are typed loosely: their plural keys follow their own
 * language's categories (Hebrew adds _two), so they cannot match en.json's
 * shape exactly. Keys used in code stay typed from en.json (i18next.d.ts), and
 * i18n.test.ts checks every locale file against it.
 */
type Translation = Record<string, unknown>;

/** Every locale but English, as a separate chunk. */
const LOADERS: Record<string, () => Promise<{ default: Translation }>> = {
  he: () => import('./locales/he.json'),
};

const initialLocale = readLocale();

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  // Resources are in memory, so the first render already has its strings.
  initAsync: false,
  // React escapes what it renders.
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { transKeepBasicHtmlNodesFor: ['br', 'strong', 'em', 'b', 'i', 'bdi', 'kbd'] },
});

export const i18n = i18next;

/** Puts a locale's strings in memory, fetching them the first time. */
export async function loadLocale(code: string): Promise<void> {
  const load = LOADERS[code];
  if (load === undefined || i18next.hasResourceBundle(code, 'translation')) return;
  const { default: translation } = await load();
  i18next.addResourceBundle(code, 'translation', translation);
}

/**
 * Settles once the stored locale's strings are in memory. main.tsx renders
 * after it, so a Hebrew page never shows English first. If they cannot be
 * fetched the page renders anyway, in English.
 */
export const localeReady: Promise<void> = loadLocale(initialLocale).catch((error: unknown) => {
  console.warn('Could not load the chosen language:', error);
});
