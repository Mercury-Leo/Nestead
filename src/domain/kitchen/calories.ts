import type { AnyRecipe, IngredientLine } from '../types';
import { catalogItem } from './catalog';
import type { CatalogItem } from './catalog';
import { canonicalId } from './normalize';

/**
 * Estimates from the catalog: grams per line, calories and net carbs per
 * serving, and what the finished dish weighs. Calories per serving are
 * estimated only when a recipe does not state its own; calories per 100 g
 * spread whichever it has over the dish's weight.
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

/**
 * What the finished dish weighs in grams, or null when too few lines can be
 * weighed. Dry rice, pasta and grains take up water as they cook, and what
 * the recipe's own water and stock cannot account for (pasta boiled and
 * drained, rice cooked on the side) is added. Water that boils off is not
 * taken away, so a long-simmered dish counts as heavier than it is.
 */
export function dishGrams(recipe: Pick<AnyRecipe, 'ingredients'>): number | null {
  let grams = 0;
  let weighed = 0;
  let takenUp = 0;
  let water = 0;
  for (const line of recipe.ingredients) {
    const weight = lineGrams(line);
    if (weight === null) continue;
    const item = catalogFor(line);
    grams += weight;
    weighed += 1;
    takenUp += weight * (item?.waterUptake ?? 0);
    if (item?.cookingWater === true) water += weight;
  }
  const total = recipe.ingredients.length;
  if (total === 0 || weighed / total < MIN_RESOLVED || grams <= 0) return null;
  return grams + Math.max(0, takenUp - water);
}

/** Calories in 100 g of the finished dish rounded to 5, or null without calories or a weight. */
export function kcalPer100g(recipe: Pick<AnyRecipe, 'ingredients' | 'servings' | 'kcalPerServing'>): number | null {
  if (recipe.kcalPerServing === undefined) return null;
  const grams = dishGrams(recipe);
  if (grams === null) return null;
  const kcal = recipe.kcalPerServing * Math.max(1, recipe.servings);
  return Math.round((kcal * 100) / grams / 5) * 5;
}
