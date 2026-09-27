import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { writeDevicePreference } from '../data/local/localStore';
import { DEFAULT_LOCALE, LOCALE_PREFERENCE, i18n, loadLocale, localeInfo, readLocale } from './i18n';
import type { Direction, LocaleInfo } from './i18n';

interface LocaleValue {
  locale: string;
  dir: Direction;
  info: LocaleInfo;
  setLocale: (code: string) => void;
}

const LocaleContext = createContext<LocaleValue | null>(null);

/**
 * Owns lang and dir on <html>. index.html sets them first from the stored
 * choice so a right-to-left page never lays out left to right; from then on
 * this keeps them, and i18next's language, matched to the choice.
 */
export function LocaleProvider({ children }: { children: ReactNode }): JSX.Element {
  // English if the stored choice's strings could not be fetched (main.tsx
  // waited for them), rather than right to left with English words.
  const [locale, setLocaleState] = useState(() => {
    const stored = readLocale();
    return i18n.hasResourceBundle(stored, 'translation') ? stored : DEFAULT_LOCALE;
  });
  const info = localeInfo(locale);

  useEffect(() => {
    document.documentElement.lang = info.code;
    document.documentElement.dir = info.dir;
    if (i18n.language !== info.code) void i18n.changeLanguage(info.code);
  }, [info]);

  // The strings arrive before the switch, so the page never shows the new
  // direction with the old language.
  const setLocale = useCallback((code: string) => {
    const next = localeInfo(code).code;
    loadLocale(next).then(
      () => {
        setLocaleState(next);
        writeDevicePreference(LOCALE_PREFERENCE, next);
      },
      (error: unknown) => console.warn('Could not load the chosen language:', error),
    );
  }, []);

  const value = useMemo(() => ({ locale: info.code, dir: info.dir, info, setLocale }), [info, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (value === null) throw new Error('useLocale needs a LocaleProvider');
  return value;
}
