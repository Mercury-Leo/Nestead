import type { AnyRecipe, IngredientLine, RecipeContent, RecipeSource, Step, Unit } from '../../../domain/types';
import { estimateKcal } from '../../../domain/kitchen/calories';
import { localId, parseIngredientLine, parseNumber } from '../../../domain/kitchen/parse';
import { formatQty } from '../../../domain/kitchen/quantity';

/**
 * The recipe form's model. Rows hold what was typed; `toRecipe` turns that into
 * a recipe, and `fromRecipe` the other way for editing.
 */

export interface IngredientRow {
  key: string;
  qty: string;
  unit: Unit;
  item: string;
}

export interface StepRow {
  key: string;
  text: string;
  /** Kept from the recipe being edited, so step titles and ingredient links survive. */
  title?: string;
  ingredientIds?: string[];
}

export interface Draft {
  title: string;
  servings: number;
  prepMin: string;
  cookMin: string;
  tags: string[];
  ingredients: IngredientRow[];
  equipment: string[];
  steps: StepRow[];
  source: RecipeSource;
  description?: string;
  photoId?: string;
  photoUrl?: string;
  servingUnit?: string;
  sourceRating?: number;
  userRating?: number;
  /** Calories the source gave; kept rather than replaced by an estimate. */
  statedKcal?: number;
}

export const UNITS: Exclude<Unit, null>[] = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'pinch', 'clove', 'can', 'bunch', 'head', 'slice', 'sheet'];

export function emptyIngredient(): IngredientRow {
  return { key: localId('r'), qty: '', unit: null, item: '' };
}

export function emptyStep(): StepRow {
  return { key: localId('s'), text: '' };
}

export function emptyDraft(): Draft {
  return {
    title: '',
    servings: 4,
    prepMin: '',
    cookMin: '',
    tags: [],
    ingredients: [emptyIngredient()],
    equipment: [],
    steps: [emptyStep()],
    source: { kind: 'mine' },
  };
}

function qtyText(line: IngredientLine): string {
  if (line.qty === null) return '';
  const qty = formatQty(line.qty, line.unit);
  return line.qtyMax !== undefined ? `${qty}-${formatQty(line.qtyMax, line.unit)}` : qty;
}

export function rowFromLine(line: IngredientLine): IngredientRow {
  return {
    key: line.id,
    qty: qtyText(line),
    unit: line.unit,
    item: line.note !== undefined ? `${line.item}, ${line.note}` : line.item,
  };
}

export function fromRecipe(recipe: AnyRecipe): Draft {
  const draft: Draft = {
    title: recipe.title,
    servings: recipe.servings,
    prepMin: String(recipe.prepMin),
    cookMin: String(recipe.cookMin),
    tags: [...recipe.tags],
    ingredients: [...recipe.ingredients.map(rowFromLine), emptyIngredient()],
    equipment: [...recipe.equipment],
    steps: [
      ...recipe.steps.map((step) => {
        const row: StepRow = { key: step.id, text: step.text };
        if (step.title !== undefined) row.title = step.title;
        if (step.ingredientIds !== undefined) row.ingredientIds = step.ingredientIds;
        return row;
      }),
      emptyStep(),
    ],
    source: recipe.source,
  };
  if (recipe.description !== undefined) draft.description = recipe.description;
  if (recipe.photoId !== undefined) draft.photoId = recipe.photoId;
  if (recipe.photoUrl !== undefined) draft.photoUrl = recipe.photoUrl;
  if (recipe.servingUnit !== undefined) draft.servingUnit = recipe.servingUnit;
  if (recipe.sourceRating !== undefined) draft.sourceRating = recipe.sourceRating;
  if (recipe.userRating !== undefined) draft.userRating = recipe.userRating;
  if (recipe.kcalPerServing !== undefined && !recipe.kcalEstimated) draft.statedKcal = recipe.kcalPerServing;
  return draft;
}

/** "1 1/2" -> 1.5, "2-3" -> 2 to 3, "" -> nothing. */
function readQty(text: string): { qty: number | null; qtyMax?: number } {
  const range = /^\s*(.+?)\s*(?:-|–|to)\s*(.+?)\s*$/.exec(text);
  if (range !== null) {
    const low = parseNumber(range[1] as string);
    const high = parseNumber(range[2] as string);
    if (low !== null && high !== null) return { qty: low, qtyMax: high };
  }
  return { qty: parseNumber(text) };
}

export function lineFromRow(row: IngredientRow): IngredientLine {
  // The item box may carry a note after a comma: "chickpeas, drained".
  const parsed = parseIngredientLine(row.item);
  const { qty, qtyMax } = readQty(row.qty);
  const line: IngredientLine = { id: row.key, qty, unit: row.unit, item: parsed.item || row.item.trim() };
  if (qtyMax !== undefined) line.qtyMax = qtyMax;
  if (parsed.note !== undefined) line.note = parsed.note;
  if (parsed.canonicalId !== undefined) line.canonicalId = parsed.canonicalId;
  if (qty === null) line.needsFix = true;
  return line;
}

export interface DraftErrors {
  title?: string;
  ingredients?: string;
  steps?: string;
}

export function validate(draft: Draft): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.title.trim() === '') errors.title = 'Give the recipe a title.';
  if (!draft.ingredients.some((row) => row.item.trim() !== '')) errors.ingredients = 'Add at least one ingredient.';
  if (!draft.steps.some((row) => row.text.trim() !== '')) errors.steps = 'Add at least one step.';
  return errors;
}

function minutes(text: string): number {
  const value = Math.round(Number(text));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function toRecipe(draft: Draft): RecipeContent {
  const ingredients = draft.ingredients.filter((row) => row.item.trim() !== '').map(lineFromRow);
  const steps: Step[] = draft.steps
    .filter((row) => row.text.trim() !== '')
    .map((row) => {
      const step: Step = { id: row.key, text: row.text.trim() };
      if (row.title !== undefined) step.title = row.title;
      // Links to ingredients that were removed are dropped.
      const kept = row.ingredientIds?.filter((id) => ingredients.some((line) => line.id === id));
      if (kept !== undefined && kept.length > 0) step.ingredientIds = kept;
      return step;
    });

  const recipe: RecipeContent = {
    title: draft.title.trim(),
    source: draft.source,
    servings: Math.max(1, draft.servings),
    prepMin: minutes(draft.prepMin),
    cookMin: minutes(draft.cookMin),
    ingredients,
    equipment: draft.equipment,
    steps,
    tags: draft.tags,
    kcalEstimated: false,
  };
  if (draft.description !== undefined) recipe.description = draft.description;
  if (draft.photoId !== undefined) recipe.photoId = draft.photoId;
  if (draft.photoUrl !== undefined) recipe.photoUrl = draft.photoUrl;
  if (draft.servingUnit !== undefined) recipe.servingUnit = draft.servingUnit;
  if (draft.sourceRating !== undefined) recipe.sourceRating = draft.sourceRating;
  if (draft.userRating !== undefined) recipe.userRating = draft.userRating;

  if (draft.statedKcal !== undefined) {
    recipe.kcalPerServing = draft.statedKcal;
  } else {
    const estimate = estimateKcal(recipe);
    if (estimate !== null) {
      recipe.kcalPerServing = estimate;
      recipe.kcalEstimated = true;
    }
  }
  return recipe;
}
