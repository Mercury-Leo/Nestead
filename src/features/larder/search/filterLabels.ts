import type { TFunction } from 'i18next';
import { KCAL_MAX, KCAL_MIN, activeFilters } from '../../../domain/kitchen/search';
import type { ActiveFilter, SearchFilters, SearchQuery, Suggestion, TimeBucket } from '../../../domain/kitchen/search';
import { formatNumber } from '../../../i18n';
import { timeLabel } from '../labels';

/**
 * The search screen's words for filters, from the translation file. The
 * domain's own labels (ActiveFilter.label, Suggestion.label) are English and
 * kept for its tests; these are rebuilt from the same filter state.
 */

/** A removable chip's words: "≤ 2 to buy", "Under 30 min", "Up to 600 kcal". */
export function activeFilterLabel(t: TFunction, filter: ActiveFilter, filters: SearchFilters): string {
  if (filter.key === 'buy' && filters.maxBuy !== null) {
    return filters.maxBuy === 0 ? t('search.active.buyZero') : t('search.active.buy', { count: filters.maxBuy });
  }
  if (filter.key.startsWith('time:')) return timeLabel(t, filter.key.slice('time:'.length) as TimeBucket);
  if (filter.key === 'kcal') {
    return filters.kcalMin > KCAL_MIN
      ? t('search.active.kcalRange', { min: filters.kcalMin, max: filters.kcalMax })
      : t('search.active.kcalUpTo', { max: filters.kcalMax });
  }
  if (filter.key === 'rating' && filters.minRating !== null) return t('search.active.rating', { rating: formatNumber(filters.minRating) });
  if (filter.key === 'source') return filters.library ? t('search.active.libraryOnly') : t('search.active.webOnly');
  return filter.label;
}

/**
 * A "loosen a filter" button's words, from what the suggestion changes: the
 * pantry switch, one ingredient, or one filter.
 */
export function loosenLabel(t: TFunction, option: Suggestion, query: SearchQuery, filters: SearchFilters): string {
  if (query.pantry && !option.query.pantry) return t('search.loosen.pantryOff');
  const token = query.tokens.find((existing) => !option.query.tokens.includes(existing));
  if (token !== undefined) return t('search.loosen.remove', { label: token });
  const kept = new Set(activeFilters(option.filters).map((filter) => filter.key));
  const removed = activeFilters(filters).find((filter) => !kept.has(filter.key));
  return removed !== undefined ? t('search.loosen.remove', { label: activeFilterLabel(t, removed, filters) }) : option.label;
}

/** "0 items to buy", "under 30 min": the filters in "Nothing matches … with …". */
export function filterPhrases(t: TFunction, filters: SearchFilters): string[] {
  const phrases: string[] = [];
  if (filters.maxBuy !== null) {
    phrases.push(filters.maxBuy === 0 ? t('search.phrase.zeroToBuy') : t('search.phrase.atMostToBuy', { count: filters.maxBuy }));
  }
  for (const bucket of filters.time) phrases.push(t(`search.phrase.${bucket}`));
  if (filters.minRating !== null) phrases.push(t('search.phrase.rating', { rating: formatNumber(filters.minRating) }));
  if (filters.kcalMax < KCAL_MAX) phrases.push(t('search.phrase.upToKcal', { kcal: filters.kcalMax }));
  if (filters.kcalMin > KCAL_MIN) phrases.push(t('search.phrase.atLeastKcal', { kcal: filters.kcalMin }));
  if (!filters.library) phrases.push(t('search.phrase.webOnly'));
  if (!filters.web) phrases.push(t('search.phrase.libraryOnly'));
  return phrases;
}

/** The calorie group's aside: "300–600", "up to 600", "any". */
export function calorieLabel(t: TFunction, filters: SearchFilters): string {
  if (filters.kcalMin > KCAL_MIN) return t('search.filter.kcalRange', { min: filters.kcalMin, max: filters.kcalMax });
  return filters.kcalMax < KCAL_MAX ? t('search.filter.kcalUpTo', { max: filters.kcalMax }) : t('search.filter.kcalAny');
}
