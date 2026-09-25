import type { AnyRecipe, IngredientLine, Step } from '../../../domain/types';
import { catalogFor } from '../../../domain/kitchen/calories';
import { detectDurations } from '../../../domain/kitchen/durations';
import { containsPhrase } from '../../../domain/kitchen/normalize';

/** Reading a recipe step for cook mode. */

/** A step's short name: its own, or the verb of its first timer. */
export function stepTitle(step: Step | undefined, index: number): string | undefined {
  if (step === undefined) return undefined;
  if (step.title !== undefined) return step.title;
  const first = detectDurations(step.text, index + 1)[0];
  if (first === undefined) return undefined;
  const verb = /^[A-Za-z]+/.exec(first.phrase)?.[0];
  return verb !== undefined && !/^\d/.test(verb) && verb.length > 2 ? verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase() : undefined;
}

/** A step's ingredients: listed on the step, or named in its text. */
export function stepIngredients(recipe: AnyRecipe, step: Step | undefined): IngredientLine[] {
  if (step === undefined) return [];
  if (step.ingredientIds !== undefined) {
    return step.ingredientIds.map((id) => recipe.ingredients.find((line) => line.id === id)).filter((line) => line !== undefined);
  }
  return recipe.ingredients.filter((line) => {
    const item = catalogFor(line);
    const names = [line.item, ...(item === undefined ? [] : [item.name, ...item.aliases, ...item.groups])];
    return names.some((name) => containsPhrase(step.text, name));
  });
}
