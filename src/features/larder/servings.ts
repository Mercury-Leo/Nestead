import { useState } from 'react';
import type { AnyRecipe, IngredientLine } from '../../domain/types';
import { formatAmount, scaleQty } from '../../domain/kitchen/quantity';

/**
 * The servings chosen on a recipe page. Cook mode reads the same number, so
 * quantities there follow what was picked on the detail page. Kept for the
 * page's lifetime only: next visit starts from the recipe's own count.
 */
const chosen = new Map<string, number>();

export function servingsFor(recipe: Pick<AnyRecipe, 'id' | 'servings'>): number {
  return chosen.get(recipe.id) ?? recipe.servings;
}

export function useServings(recipe: Pick<AnyRecipe, 'id' | 'servings'>): [number, (servings: number) => void] {
  const [servings, setServings] = useState(() => servingsFor(recipe));
  return [
    servings,
    (next) => {
      chosen.set(recipe.id, next);
      setServings(next);
    },
  ];
}

/** "300 g" at the recipe's own servings becomes "450 g" at 6 of 4. */
export function scaledAmount(line: IngredientLine, factor: number): string {
  const qtyMax = line.qtyMax === undefined ? undefined : (scaleQty(line.qtyMax, factor) ?? undefined);
  return formatAmount(scaleQty(line.qty, factor), line.unit, qtyMax);
}
