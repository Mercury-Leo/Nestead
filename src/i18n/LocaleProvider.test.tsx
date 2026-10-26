import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeDevicePreference } from '../data/local/localStore';
import { LOCALE_PREFERENCE, i18n } from './i18n';
import { LocaleProvider, useLocale } from './LocaleProvider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: (() => void) | null = null;
let choose: (code: string) => void = () => undefined;

function Probe(): JSX.Element {
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();
  choose = setLocale;
  return <p data-locale={locale}>{t('common.loading')}</p>;
}

async function render(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
  });
  unmount = () => act(() => root.unmount());
  return host;
}

/** Lets the dynamic import of a locale file, and the renders after it, finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

const shown = (host: HTMLElement): string | null => host.querySelector('p')?.getAttribute('data-locale') ?? null;

beforeEach(() => {
  localStorage.clear();
  // The stored choice's strings have not arrived: main.tsx stopped waiting.
  i18n.removeResourceBundle('he', 'translation');
  writeDevicePreference(LOCALE_PREFERENCE, 'he');
});

afterEach(async () => {
  unmount?.();
  unmount = null;
  document.body.replaceChildren();
  await i18n.changeLanguage('en');
  localStorage.clear();
});

describe('LocaleProvider', () => {
  it('draws in English while the stored language is late, then switches when its strings arrive', async () => {
    const host = await render();
    expect(shown(host)).toBe('en');

    await settle();

    expect(shown(host)).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(host.textContent).toBe(i18n.getResource('he', 'translation', 'common.loading'));
  });

  it('keeps a language chosen before the late strings arrive', async () => {
    const host = await render();

    await act(async () => choose('en'));
    await settle();

    expect(shown(host)).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
