import 'i18next';
import type en from './locales/en.json';

// Keys are typed from en.json, so t('a.missing.key') fails to compile.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
