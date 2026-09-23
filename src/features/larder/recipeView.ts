import type { AnyRecipe, DietProfile } from '../../domain/types';
import { checkDiet } from '../../domain/kitchen/diet';
import type { DietCheck } from '../../domain/kitchen/diet';
import { pantryFit } from '../../domain/kitchen/fit';
import type { PantryFit, PantryIndex } from '../../domain/kitchen/fit';
import { formatDuration } from '../../domain/kitchen/quantity';
import { displayRating, totalMinutes } from '../../domain/kitchen/search';

/** Everything a card or row shows about a recipe, worked out once. */
export interface RecipeView {
  recipe: AnyRecipe;
  fit: PantryFit;
  diet: DietCheck;
  rating: number | undefined;
  total: string;
  /** "540 kcal", "280 kcal/slice". */
  kcal: string | null;
  need: string[];
}

export function recipeView(
  recipe: AnyRecipe,
  pantry: PantryIndex,
  profile: Pick<DietProfile, 'presets' | 'custom'> | null,
  known?: { fit?: PantryFit; diet?: DietCheck },
): RecipeView {
  const fit = known?.fit ?? pantryFit(recipe, pantry);
  return {
    recipe,
    fit,
    diet: known?.diet ?? checkDiet(recipe, profile),
    rating: displayRating(recipe),
    total: formatDuration(totalMinutes(recipe)),
    kcal:
      recipe.kcalPerServing === undefined
        ? null
        : `${recipe.kcalPerServing} kcal${recipe.servingUnit !== undefined ? `/${recipe.servingUnit}` : ''}`,
    need: fit.missingLines.map((line) => line.item),
  };
}

/** Where a recipe links to. Web ids contain a colon, so they are encoded. */
export function recipePath(recipe: Pick<AnyRecipe, 'id'>, suffix = ''): string {
  return `/recipe/${encodeURIComponent(recipe.id)}${suffix}`;
}

export function siteOf(recipe: Pick<AnyRecipe, 'source'>): string | null {
  return recipe.source.kind === 'web' ? recipe.source.site : null;
}
