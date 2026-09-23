import type { AnyRecipe, IngredientLine, Unit } from '../../../domain/types';
import { estimateKcal } from '../../../domain/kitchen/calories';
import { dietTags } from '../../../domain/kitchen/diet';
import { parseIngredientLine, parseNumber } from '../../../domain/kitchen/parse';
import { formatDuration } from '../../../domain/kitchen/quantity';
import { totalMinutes } from '../../../domain/kitchen/search';
import type { ImportedRecipe } from '../../../../server/import';

/**
 * Turning what the import endpoint read into a recipe, and describing what was
 * and was not found. Pure, so the preview and its tests agree.
 */

export function fromImported(imported: ImportedRecipe): AnyRecipe {
  const ingredients = imported.ingredients.map((raw, index) => ({ ...parseIngredientLine(raw), id: `imp-i${index + 1}` }));
  const recipe: AnyRecipe = {
    id: `import:${imported.url}`,
    title: imported.title,
    source: { kind: 'web', url: imported.url, site: imported.site },
    servings: imported.servings ?? 4,
    prepMin: imported.prepMin ?? 0,
    cookMin: imported.cookMin ?? 0,
    ingredients,
    equipment: imported.equipment,
    steps: imported.steps.map((text, index) => ({ id: `imp-s${index + 1}`, text })),
    tags: [],
    kcalEstimated: false,
    inLibrary: false,
  };
  if (imported.description !== undefined) recipe.description = imported.description;
  if (imported.image !== undefined) recipe.photoUrl = imported.image;
  if (imported.servingUnit !== undefined) recipe.servingUnit = imported.servingUnit;
  if (imported.rating !== undefined) recipe.sourceRating = imported.rating;
  if (imported.kcal !== undefined) {
    recipe.kcalPerServing = imported.kcal;
  } else {
    const estimate = estimateKcal(recipe);
    if (estimate !== null) {
      recipe.kcalPerServing = estimate;
      recipe.kcalEstimated = true;
    }
  }
  return recipe;
}

export interface Fix {
  qty: string;
  unit: Unit;
}

/** The recipe with the quantities someone typed into the flagged rows. */
export function applyFixes(recipe: AnyRecipe, fixes: Readonly<Record<string, Fix>>, tags: readonly string[]): AnyRecipe {
  const ingredients = recipe.ingredients.map((line): IngredientLine => {
    const fix = fixes[line.id];
    if (fix === undefined) return line;
    const qty = parseNumber(fix.qty);
    const fixed: IngredientLine = { ...line, qty, unit: fix.unit };
    if (qty !== null) delete fixed.needsFix;
    return fixed;
  });
  const updated: AnyRecipe = { ...recipe, ingredients, tags: [...tags] };
  if (recipe.kcalEstimated) {
    const estimate = estimateKcal(updated);
    if (estimate !== null) updated.kcalPerServing = estimate;
  }
  return updated;
}

export interface ReadLine {
  ok: boolean;
  text: string;
}

/** "What we read": the checklist under the preview. */
export function whatWeRead(recipe: AnyRecipe, stated: { photo: boolean; servings: boolean; times: boolean }): ReadLine[] {
  const firstPart = ['Title', ...(stated.photo ? ['photo'] : [])];
  const servings = stated.servings ? `${recipe.servings} servings` : null;
  const titleLine = servings === null ? firstPart.join(' and ') : `${firstPart.join(', ')} and ${servings}`;
  const plural = (n: number, word: string, many = `${word}s`): string => `${n} ${n === 1 ? word : many}`;
  const lines: ReadLine[] = [
    { ok: true, text: titleLine },
    stated.times
      ? { ok: true, text: `Prep ${formatDuration(recipe.prepMin)} · cook ${formatDuration(recipe.cookMin)}` }
      : { ok: false, text: 'Times not listed — add them before saving' },
    {
      ok: true,
      text: `${plural(recipe.ingredients.length, 'ingredient')}, ${plural(recipe.equipment.length, 'piece of equipment', 'pieces of equipment')}, ${plural(recipe.steps.length, 'step')}`,
    },
  ];
  if (!stated.photo) lines.push({ ok: false, text: 'No photo — a placeholder will stand in' });
  if (recipe.kcalEstimated) {
    lines.push({
      ok: false,
      text:
        recipe.kcalPerServing !== undefined
          ? `Calories not listed — we’ll show an estimate (~${recipe.kcalPerServing} kcal)`
          : 'Calories not listed — not enough to estimate them',
    });
  }
  const fix = recipe.ingredients.filter((line) => line.needsFix === true).length;
  if (fix > 0) lines.push({ ok: false, text: `${plural(fix, 'ingredient')} ${fix === 1 ? 'needs' : 'need'} a quantity` });
  return lines;
}

const PANS = /\b(pan|skillet|pot|dish|tray|wok|tin|dutch oven|casserole)\b/i;

/** Diet tags the engine vouches for, plus Weeknight and One-pan where they fit. */
export function suggestedTags(recipe: AnyRecipe): { tag: string; preselected: boolean }[] {
  const tags = dietTags(recipe).map((tag) => ({ tag, preselected: true }));
  if (totalMinutes(recipe) > 0 && totalMinutes(recipe) <= 40) tags.push({ tag: 'Weeknight', preselected: false });
  if (recipe.equipment.filter((item) => PANS.test(item)).length === 1) tags.push({ tag: 'One-pan', preselected: false });
  return tags;
}
