import type { AnyRecipe, DietProfile, IngredientLine } from '../types';
import { catalogFor } from './calories';
import { checkDiet } from './diet';
import type { DietCheck } from './diet';
import { pantryFit } from './fit';
import type { PantryFit, PantryIndex } from './fit';
import { containsPhrase, normalizeText } from './normalize';

/**
 * Search over the library and the web index: by ingredients or by name, with
 * pantry-fit ranking, filters, diet hiding and "loosen a filter" suggestions.
 */

export type SortKey = 'fit' | 'fewest' | 'rating' | 'kcal' | 'time';
export type TimeBucket = 'under30' | '30to60' | 'over60';

export const SORT_LABELS: Record<SortKey, string> = {
  fit: 'Best pantry fit',
  fewest: 'Fewest items to buy',
  rating: 'Star rating',
  kcal: 'Calories (lowest first)',
  time: 'Total time (shortest first)',
};

export const SORT_SHORT: Record<SortKey, string> = {
  fit: 'Best fit',
  fewest: 'Fewest to buy',
  rating: 'Rating',
  kcal: 'Calories',
  time: 'Total time',
};

export const TIME_LABELS: Record<TimeBucket, string> = {
  under30: 'Under 30 min',
  '30to60': '30–60 min',
  over60: 'Over 1 h',
};

export const KCAL_MIN = 200;
export const KCAL_MAX = 800;

export interface SearchQuery {
  mode: 'ingredients' | 'name';
  /** Ingredient tokens, in "By ingredients" mode. */
  tokens: string[];
  /** Free text, in "By recipe name" mode. */
  text: string;
  /** "Cook from my pantry". */
  pantry: boolean;
}

export interface SearchFilters {
  sort: SortKey;
  /** At most this many to buy; null is Any. */
  maxBuy: number | null;
  time: TimeBucket[];
  kcalMin: number;
  kcalMax: number;
  /** Minimum star rating; null is Any. */
  minRating: number | null;
  library: boolean;
  web: boolean;
  /** "Matches my profile". Off means the diet profile is ignored. */
  matchProfile: boolean;
  conflictMode: 'hide' | 'warn';
}

export function defaultFilters(conflictMode: 'hide' | 'warn' = 'hide'): SearchFilters {
  return {
    sort: 'fit',
    maxBuy: null,
    time: [],
    kcalMin: KCAL_MIN,
    kcalMax: KCAL_MAX,
    minRating: null,
    library: true,
    web: true,
    matchProfile: true,
    conflictMode,
  };
}

export interface SearchContext {
  library: readonly AnyRecipe[];
  web: readonly AnyRecipe[];
  pantry: PantryIndex;
  profile: Pick<DietProfile, 'presets' | 'custom'> | null;
}

export interface SearchHit {
  recipe: AnyRecipe;
  fit: PantryFit;
  diet: DietCheck;
  tokensMatched: number;
}

export interface SearchOutcome {
  results: SearchHit[];
  hidden: SearchHit[];
}

export function totalMinutes(recipe: Pick<AnyRecipe, 'prepMin' | 'cookMin'>): number {
  return recipe.prepMin + recipe.cookMin;
}

/** The rating shown: the family's own if set, otherwise the source's. */
export function displayRating(recipe: Pick<AnyRecipe, 'userRating' | 'sourceRating'>): number | undefined {
  return recipe.userRating ?? recipe.sourceRating;
}

/** Does this line count as the ingredient a person typed? */
export function lineMatchesToken(line: IngredientLine, token: string): boolean {
  const key = normalizeText(token);
  if (key === '') return false;
  const item = catalogFor(line);
  if (item !== undefined) {
    // Whole names only: "lemon" is lemons, never lemongrass. Groups let
    // "rice" find arborio and jasmine.
    return [item.name, ...item.aliases, ...item.groups].map(normalizeText).includes(key);
  }
  return containsPhrase(line.item, token);
}

export function tokensMatched(recipe: Pick<AnyRecipe, 'ingredients'>, tokens: readonly string[]): number {
  return tokens.filter((token) => recipe.ingredients.some((line) => lineMatchesToken(line, token))).length;
}

/** 1->1, 2->2, 3->2, 4->3. */
export function tokensNeeded(count: number): number {
  return Math.ceil((2 / 3) * count);
}

function inTimeBuckets(minutes: number, buckets: readonly TimeBucket[]): boolean {
  if (buckets.length === 0) return true;
  return buckets.some((bucket) =>
    bucket === 'under30' ? minutes < 30 : bucket === '30to60' ? minutes >= 30 && minutes <= 60 : minutes > 60,
  );
}

function candidates(ctx: SearchContext, filters: SearchFilters): AnyRecipe[] {
  const library = filters.library ? ctx.library : [];
  // A web recipe already saved to the library shows once, as the library copy.
  const savedUrls = new Set(
    ctx.library.flatMap((recipe) => (recipe.source.kind === 'web' ? [recipe.source.url] : [])),
  );
  const web = filters.web
    ? ctx.web.filter((recipe) => recipe.source.kind !== 'web' || !savedUrls.has(recipe.source.url))
    : [];
  return [...library, ...web];
}

function compare(a: SearchHit, b: SearchHit, query: SearchQuery, sort: SortKey): number {
  const rating = (displayRating(b.recipe) ?? 0) - (displayRating(a.recipe) ?? 0);
  switch (sort) {
    case 'fit':
      if (query.pantry) {
        return b.fit.ratio - a.fit.ratio || a.fit.missing - b.fit.missing || rating;
      }
      return b.tokensMatched - a.tokensMatched || rating;
    case 'fewest':
      return a.fit.missing - b.fit.missing || b.fit.ratio - a.fit.ratio || rating;
    case 'rating':
      return rating || b.fit.ratio - a.fit.ratio;
    case 'kcal':
      return (a.recipe.kcalPerServing ?? Infinity) - (b.recipe.kcalPerServing ?? Infinity) || rating;
    case 'time':
      return totalMinutes(a.recipe) - totalMinutes(b.recipe) || rating;
  }
}

export function search(query: SearchQuery, filters: SearchFilters, ctx: SearchContext): SearchOutcome {
  const tokens = query.mode === 'ingredients' ? query.tokens.filter((token) => token.trim() !== '') : [];
  const needed = tokensNeeded(tokens.length);
  const text = query.mode === 'name' ? query.text.trim().toLowerCase() : '';

  const results: SearchHit[] = [];
  const hidden: SearchHit[] = [];

  for (const recipe of candidates(ctx, filters)) {
    const matched = tokensMatched(recipe, tokens);
    if (tokens.length > 0 && matched < needed) continue;
    if (text !== '' && !recipe.title.toLowerCase().includes(text)) continue;

    const fit = pantryFit(recipe, ctx.pantry);
    if (filters.maxBuy !== null && fit.missing > filters.maxBuy) continue;
    if (!inTimeBuckets(totalMinutes(recipe), filters.time)) continue;
    // The slider's ends mean "no limit", so a 900 kcal recipe still shows at 800.
    const kcal = recipe.kcalPerServing;
    if (kcal !== undefined) {
      if (filters.kcalMin > KCAL_MIN && kcal < filters.kcalMin) continue;
      if (filters.kcalMax < KCAL_MAX && kcal > filters.kcalMax) continue;
    }
    if (filters.minRating !== null && (displayRating(recipe) ?? 0) < filters.minRating) continue;

    const diet = checkDiet(recipe, ctx.profile);
    const hit: SearchHit = { recipe, fit, diet, tokensMatched: matched };
    if (!diet.ok && filters.matchProfile && filters.conflictMode === 'hide') hidden.push(hit);
    else results.push(hit);
  }

  results.sort((a, b) => compare(a, b, query, filters.sort));
  return { results, hidden };
}

/* ---------------------------------------------------------- suggestions -- */

export interface ActiveFilter {
  key: string;
  label: string;
  /** The filters with this one removed. */
  without: (filters: SearchFilters) => SearchFilters;
}

export function buyLabel(maxBuy: number): string {
  return maxBuy === 0 ? '0 to buy' : `≤ ${maxBuy} to buy`;
}

export function activeFilters(filters: SearchFilters): ActiveFilter[] {
  const active: ActiveFilter[] = [];
  if (filters.maxBuy !== null) {
    active.push({ key: 'buy', label: buyLabel(filters.maxBuy), without: (f) => ({ ...f, maxBuy: null }) });
  }
  for (const bucket of filters.time) {
    active.push({
      key: `time:${bucket}`,
      label: TIME_LABELS[bucket],
      without: (f) => ({ ...f, time: f.time.filter((b) => b !== bucket) }),
    });
  }
  if (filters.kcalMin > KCAL_MIN || filters.kcalMax < KCAL_MAX) {
    const label =
      filters.kcalMin > KCAL_MIN ? `${filters.kcalMin}–${filters.kcalMax} kcal` : `Up to ${filters.kcalMax} kcal`;
    active.push({ key: 'kcal', label, without: (f) => ({ ...f, kcalMin: KCAL_MIN, kcalMax: KCAL_MAX }) });
  }
  if (filters.minRating !== null) {
    active.push({ key: 'rating', label: `Rating ${filters.minRating}+`, without: (f) => ({ ...f, minRating: null }) });
  }
  if (!filters.library || !filters.web) {
    active.push({
      key: 'source',
      label: filters.library ? 'Library only' : 'Web only',
      without: (f) => ({ ...f, library: true, web: true }),
    });
  }
  return active;
}

export interface Suggestion {
  label: string;
  count: number;
  query: SearchQuery;
  filters: SearchFilters;
}

/** Up to three ways to loosen a search that found nothing, with live counts. */
export function suggestions(query: SearchQuery, filters: SearchFilters, ctx: SearchContext): Suggestion[] {
  const options: Omit<Suggestion, 'count'>[] = [];
  for (const filter of activeFilters(filters)) {
    options.push({ label: `Remove “${filter.label}”`, query, filters: filter.without(filters) });
  }
  if (query.pantry) {
    options.push({ label: 'Turn off Cook from my pantry', query: { ...query, pantry: false }, filters });
  }
  if (query.mode === 'ingredients' && query.tokens.length > 1) {
    for (const token of query.tokens) {
      options.push({
        label: `Remove “${token}”`,
        query: { ...query, tokens: query.tokens.filter((t) => t !== token) },
        filters,
      });
    }
  }

  const current = search(query, filters, ctx).results.length;
  return options
    .map((option) => ({ ...option, count: search(option.query, option.filters, ctx).results.length }))
    .filter((option) => option.count > current)
    .slice(0, 3);
}
