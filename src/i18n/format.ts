import { i18n, localeInfo } from './i18n';

/**
 * Dates, numbers and lists in the current locale, through Intl. Interpolated
 * numbers in translations use {{n, number}}, which i18next also formats with
 * Intl; these are for everything outside a translation string.
 */

function intl(): string {
  return localeInfo(i18n.language).intl;
}

/**
 * Intl formatters are slow to build and free to reuse, and a busy screen
 * formats hundreds of values a render: every card's due date, every recipe's
 * numbers, again on each frame of a drag. One per kind, locale and options,
 * for the life of the page.
 */
const formatters = new Map<string, unknown>();

function formatter<T>(key: string, options: object | undefined, make: () => T): T {
  const full = `${key}|${options === undefined ? '' : JSON.stringify(options)}`;
  let found = formatters.get(full) as T | undefined;
  if (found === undefined) {
    found = make();
    formatters.set(full, found);
  }
  return found;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  const locale = intl();
  return formatter(`number|${locale}`, options, () => new Intl.NumberFormat(locale, options)).format(value);
}

/** A calendar date. ISO strings like "2026-09-26" are read as that local day, not UTC midnight. */
export function formatDate(value: Date | string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  const locale = intl();
  // A DateTimeFormat keeps the time zone it was made in; keyed by the offset, a
  // device that changes zone mid-session gets a new one.
  const key = `date|${locale}|${date.getTimezoneOffset()}`;
  return formatter(key, options, () => new Intl.DateTimeFormat(locale, options)).format(date);
}

/** "in 3 days", "yesterday". */
export function formatRelative(value: number, unit: Intl.RelativeTimeFormatUnit, options: Intl.RelativeTimeFormatOptions = { numeric: 'auto' }): string {
  const locale = intl();
  return formatter(`relative|${locale}`, options, () => new Intl.RelativeTimeFormat(locale, options)).format(value, unit);
}

/** Whole days from today to a calendar date: 0 today, 1 tomorrow, -1 yesterday. */
export function daysFromToday(isoDate: string, now = new Date()): number {
  const day = new Date(`${isoDate}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((day.getTime() - today.getTime()) / 86_400_000);
}

const DIGITS = new Map<string, string[]>();

/**
 * The same text with its digits in the locale's own ("٤٧:٣٢" for "47:32"),
 * for numbers the domain has already shaped: clocks, "1½", "2–3".
 */
export function localizeDigits(text: string): string {
  const locale = intl();
  let digits = DIGITS.get(locale);
  if (digits === undefined) {
    const format = new Intl.NumberFormat(locale, { useGrouping: false });
    digits = Array.from({ length: 10 }, (_, d) => format.format(d));
    DIGITS.set(locale, digits);
  }
  const map = digits;
  return text.replace(/[0-9]/g, (d) => map[Number(d)] as string);
}

const RLM = '\u200f';
const LRI = '\u2066';
const FSI = '\u2068';
const PDI = '\u2069';

/**
 * A number the domain has shaped ("1½", "2–3"), kept left to right in a
 * right-to-left locale. The fraction sign has no direction of its own, so
 * Hebrew text would otherwise show "1½" as "½1".
 */
export function isolateNumber(text: string): string {
  return localeInfo(i18n.language).dir === 'rtl' ? LRI + text + PDI : text;
}

/**
 * "a, b and c", or with type "disjunction", "a, b or c". In a right-to-left
 * locale a list of English recipe names still reads right to left, first
 * item on the right: each item is isolated so it keeps its own direction, and
 * a leading RLM makes a <bdi> around the list resolve to RTL (dir=auto looks
 * at the first strong character and does not skip isolates).
 */
function listFormat(type: Intl.ListFormatType): Intl.ListFormat {
  const locale = intl();
  return formatter(`list|${locale}|${type}`, undefined, () => new Intl.ListFormat(locale, { type }));
}

export function formatList(items: readonly string[], type: Intl.ListFormatType = 'conjunction'): string {
  if (localeInfo(i18n.language).dir === 'ltr') return listFormat(type).format(items);
  return RLM + listFormat(type).format(items.map((item) => FSI + item + PDI));
}

/** The same list in pieces, so each item can be styled on its own: bold phrases joined by plain "and". */
export function formatListParts(items: readonly string[], type: Intl.ListFormatType = 'conjunction'): { type: 'element' | 'literal'; value: string }[] {
  return listFormat(type).formatToParts(items);
}
