import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readDevicePreference } from '../data/local/localStore';
import en from './locales/en.json';
import he from './locales/he.json';
import { pseudoLocalize } from './pseudo';

/**
 * The i18next instance. Translations are bundled, not fetched: adding a
 * language means adding locales/<code>.json and a line in LOCALES. There is no
 * language detector; the locale is the person's choice, stored per device.
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

/** Dev-only: every string wrapped and lengthened, laid out right to left. */
const PSEUDO: LocaleInfo = { code: 'en-XA', dir: 'rtl', name: '[!! Pseudo !!]', intl: 'en-GB' };

export const LOCALES: readonly LocaleInfo[] = [
  { code: 'en', dir: 'ltr', name: 'English', intl: 'en-GB' },
  { code: 'he', dir: 'rtl', name: 'עברית', intl: 'he' },
  ...(import.meta.env.DEV ? [PSEUDO] : []),
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

const resources: Record<string, { translation: Translation }> = {
  en: { translation: en },
  he: { translation: he },
};
if (import.meta.env.DEV) resources[PSEUDO.code] = { translation: pseudoLocalize(en) };

void i18next.use(initReactI18next).init({
  resources,
  lng: readLocale(),
  fallbackLng: DEFAULT_LOCALE,
  // Resources are in memory, so the first render already has its strings.
  initAsync: false,
  // React escapes what it renders.
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { transKeepBasicHtmlNodesFor: ['br', 'strong', 'em', 'b', 'i', 'bdi', 'kbd'] },
});

export const i18n = i18next;
