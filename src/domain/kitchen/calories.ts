import type { AnyRecipe, IngredientLine } from '../types';
import { catalogItem } from './catalog';
import type { CatalogItem } from './catalog';
import { canonicalId } from './normalize';

/**
 * Estimates from the catalog: grams per line, calories and net carbs per
 * serving. Used only when a recipe does not state its own calories.
 */

const ML_PER: Partial<Record<string, number>> = { tsp: 5, tbsp: 15, cup: 240 };

export function catalogFor(line: IngredientLine): CatalogItem | undefined {
  return catalogItem(line.canonicalId ?? canonicalId(line.item));
}

/** The weight of a line in grams, or null when it cannot be worked out. */
export function lineGrams(line: IngredientLine): number | null {
  if (line.qty === null) return null;
  const item = catalogFor(line);
  const density = item?.densityGPerMl ?? 1;
  const qty = line.qty;

  switch (line.unit) {
    case 'g':
      return qty;
    case 'kg':
      return qty * 1000;
    case 'ml':
      return qty * density;
    case 'l':
      return qty * 1000 * density;
    case 'tsp':
    case 'tbsp':
    case 'cup':
      return qty * (ML_PER[line.unit] as number) * density;
    case 'pinch':
      return qty * 0.35;
    case 'clove':
      return qty * 5;
    case 'can':
      return qty * (item?.gramsPerUnit ?? 400);
    default:
      return item?.gramsPerUnit === undefined ? null : qty * item.gramsPerUnit;
  }
}

interface Totals {
  value: number;
  resolved: number;
  total: number;
}

function sumPer100g(recipe: Pick<AnyRecipe, 'ingredients'>, pick: (item: CatalogItem) => number | undefined): Totals {
  let value = 0;
  let resolved = 0;
  for (const line of recipe.ingredients) {
    const item = catalogFor(line);
    const grams = lineGrams(line);
    const per100 = item === undefined ? undefined : pick(item);
    if (grams === null || per100 === undefined) continue;
    value += (grams * per100) / 100;
    resolved += 1;
  }
  return { value, resolved, total: recipe.ingredients.length };
}

/** Below this share of lines understood, an estimate would mislead. */
const MIN_RESOLVED = 0.6;

/** Calories per serving rounded to 10, or null when there is not enough data. */
export function estimateKcal(recipe: Pick<AnyRecipe, 'ingredients' | 'servings'>): number | null {
  const totals = sumPer100g(recipe, (item) => item.kcalPer100g);
  if (totals.total === 0 || totals.resolved / totals.total < MIN_RESOLVED) return null;
  return Math.round(totals.value / Math.max(1, recipe.servings) / 10) * 10;
}

export function netCarbsPerServing(recipe: Pick<AnyRecipe, 'ingredients' | 'servings'>): number | null {
  const totals = sumPer100g(recipe, (item) => item.carbsPer100g);
  if (totals.total === 0 || totals.resolved / totals.total < MIN_RESOLVED) return null;
  return totals.value / Math.max(1, recipe.servings);
}
