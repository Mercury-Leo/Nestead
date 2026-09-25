import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { readDevicePreference, writeDevicePreference } from '../../data/local/localStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';

/** What the person picked. "system" follows the device's light/dark setting. */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

/** Keep in step with the script in index.html, which reads it before first paint. */
const PREFERENCE = 'theme';

export function readThemeChoice(): ThemeChoice {
  const value = readDevicePreference(PREFERENCE);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'system') return systemDark ? 'dark' : 'light';
  return choice;
}

interface ThemeValue {
  choice: ThemeChoice;
  theme: Theme;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Owns data-theme on <html>, which switches the tokens in styles/tokens.css.
 * index.html sets it first so the page never flashes light; from then on this
 * keeps it matched to the choice and, on "system", to the device setting.
 */
export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [choice, setChoiceState] = useState(readThemeChoice);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = resolveTheme(choice, systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    writeDevicePreference(PREFERENCE, next);
  }, []);

  const value = useMemo(() => ({ choice, theme, setChoice }), [choice, theme, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme needs a ThemeProvider');
  return value;
}
