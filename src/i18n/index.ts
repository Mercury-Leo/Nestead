/**
 * Translation and locale. Screens use useTranslation() from react-i18next for
 * strings and the helpers in ./format for dates, numbers and lists.
 */
export { DEFAULT_LOCALE, LOCALES, LOCALE_PREFERENCE, i18n, localeInfo, readLocale } from './i18n';
export type { Direction, LocaleInfo } from './i18n';
export { LocaleProvider, useLocale } from './LocaleProvider';
export { daysFromToday, formatDate, formatList, formatListParts, formatNumber, formatRelative, localizeDigits } from './format';
