import type { AnyRecipe, IngredientLine, Unit } from '../../../domain/types';
import { estimateKcal } from '../../../domain/kitchen/calories';
import { dietTags } from '../../../domain/kitchen/diet';
import { isIngredientHeading, parseIngredientLine, parseNumber } from '../../../domain/kitchen/parse';
import { totalMinutes } from '../../../domain/kitchen/search';
import { i18n } from '../../../i18n';
import { formatMinutes } from '../labels';
import type { ImportedRecipe } from '../../../../server/import';

/**
 * Turning what the import endpoint read into a recipe, and describing what was
 * and was not found. Pure, so the preview and its tests agree.
 */

export function fromImported(imported: ImportedRecipe): AnyRecipe {
  // Pages list headings ("For the sauce:", "תיבול:") among the ingredients; they are not ones to buy.
  const ingredients = imported.ingredients.filter((raw) => !isIngredientHeading(raw)).map((raw, index) => ({ ...parseIngredientLine(raw), id: `imp-i${index + 1}` }));
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
  const t = i18n.t;
  // The title and photo are on show beside this list, so only a missing photo is mentioned.
  const lines: ReadLine[] = [];
  if (stated.servings) lines.push({ ok: true, text: t('import.read.servings', { count: recipe.servings }) });
  lines.push(
    stated.times
      ? { ok: true, text: t('import.read.times', { prep: formatMinutes(t, recipe.prepMin), cook: formatMinutes(t, recipe.cookMin) }) }
      : { ok: false, text: t('import.read.noTimes') },
    { ok: true, text: t('import.read.ingredients', { count: recipe.ingredients.length }) },
    { ok: true, text: t('import.read.tools', { count: recipe.equipment.length }) },
    { ok: true, text: t('import.read.steps', { count: recipe.steps.length }) },
  );
  if (!stated.photo) lines.push({ ok: false, text: t('import.read.noPhoto') });
  if (recipe.kcalEstimated) {
    lines.push({
      ok: false,
      text: recipe.kcalPerServing !== undefined ? t('import.read.kcalEstimate', { kcal: recipe.kcalPerServing }) : t('import.read.kcalNone'),
    });
  }
  const fix = recipe.ingredients.filter((line) => line.needsFix === true).length;
  if (fix > 0) lines.push({ ok: false, text: t('import.read.needsQty', { count: fix }) });
  return lines;
}

const PANS = /\b(pan|skillet|pot|dish|tray|wok|tin|dutch oven|casserole)\b/i;

/**
 * True when most ingredient lines match nothing in the catalog, as with a
 * recipe in a language it has no names for (anything but English and Hebrew). The diet
 * and pantry checks see nothing in such lines, so "no nuts found" would mean
 * only "no nuts recognised": the preview must not vouch for the recipe.
 */
export function mostlyUnrecognised(recipe: Pick<AnyRecipe, 'ingredients'>): boolean {
  const unknown = recipe.ingredients.filter((line) => line.canonicalId === undefined).length;
  return unknown * 2 > recipe.ingredients.length;
}

/**
 * Diet tags the engine vouches for, plus Weeknight and One-pan where they fit.
 * No diet tags for a recipe it mostly could not read: an unrecognised line
 * carries no flags, so every "-free" tag would pass unearned.
 * i18n: these become the recipe's stored tags, so they stay in English like
 * the diet engine's own (dietTags in domain/kitchen/diet.ts).
 */
export function suggestedTags(recipe: AnyRecipe): { tag: string; preselected: boolean }[] {
  const tags = mostlyUnrecognised(recipe) ? [] : dietTags(recipe).map((tag) => ({ tag, preselected: true }));
  if (totalMinutes(recipe) > 0 && totalMinutes(recipe) <= 40) tags.push({ tag: 'Weeknight', preselected: false });
  if (recipe.equipment.filter((item) => PANS.test(item)).length === 1) tags.push({ tag: 'One-pan', preselected: false });
  return tags;
}
