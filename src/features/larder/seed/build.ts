import type { AnyRecipe, RecipeContent, RecipeSource } from '../../../domain/types';
import { parseIngredientLine } from '../../../domain/kitchen/parse';

/**
 * Writing recipes by hand for the seed and the offline web index. Ingredients
 * are written as a person would and parsed, so seed data goes through exactly
 * the same parser as everything else.
 */

export interface RecipeSpec {
  slug: string;
  title: string;
  description?: string;
  source: 'mine' | { site: string };
  servings: number;
  servingUnit?: string;
  prepMin: number;
  cookMin: number;
  kcal?: number;
  kcalEstimated?: boolean;
  sourceRating?: number;
  userRating?: number;
  tags: string[];
  ingredients: string[];
  equipment: string[];
  /** Step text, optionally with the indexes of the ingredients it uses and a title. */
  steps: (string | [string, number[]] | [string, number[], string])[];
}

export function buildRecipe(spec: RecipeSpec): AnyRecipe {
  const ingredients = spec.ingredients.map((raw, index) => ({
    ...parseIngredientLine(raw),
    id: `${spec.slug}-i${index + 1}`,
  }));

  const steps = spec.steps.map((step, index) => {
    const [text, uses, title] = typeof step === 'string' ? [step, undefined, undefined] : step;
    const built: RecipeContent['steps'][number] = { id: `${spec.slug}-s${index + 1}`, text };
    if (title !== undefined) built.title = title;
    if (uses !== undefined) built.ingredientIds = uses.map((i) => `${spec.slug}-i${i + 1}`);
    return built;
  });

  const source: RecipeSource =
    spec.source === 'mine'
      ? { kind: 'mine' }
      : { kind: 'web', site: spec.source.site, url: `https://${spec.source.site}/recipes/${spec.slug}` };

  const recipe: AnyRecipe = {
    id: spec.slug,
    title: spec.title,
    source,
    servings: spec.servings,
    prepMin: spec.prepMin,
    cookMin: spec.cookMin,
    ingredients,
    equipment: spec.equipment,
    steps,
    tags: spec.tags,
    kcalEstimated: spec.kcalEstimated ?? false,
  };
  if (spec.description !== undefined) recipe.description = spec.description;
  if (spec.servingUnit !== undefined) recipe.servingUnit = spec.servingUnit;
  if (spec.kcal !== undefined) recipe.kcalPerServing = spec.kcal;
  if (spec.sourceRating !== undefined) recipe.sourceRating = spec.sourceRating;
  if (spec.userRating !== undefined) recipe.userRating = spec.userRating;
  return recipe;
}
