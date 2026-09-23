import type { DataStore } from '../../data/types';
import type { AnyRecipe, ListItem, NewRow, PantryItem, Recipe } from '../../domain/types';
import { keyForText } from '../../domain/kitchen/fit';
import type { PantryIndex } from '../../domain/kitchen/fit';
import { planAddRecipe, planRemoveRecipe } from '../../domain/kitchen/list';
import type { ListPlan } from '../../domain/kitchen/list';
import { pantryRow } from './seed/kitchen';

/**
 * The kitchen's writes. Screens decide what to do; these do it through the
 * store, so every write goes the same way whichever screen asked.
 */

async function applyPlan(store: DataStore, plan: ListPlan): Promise<void> {
  for (const id of plan.remove) await store.listItems.remove(id);
  for (const { id, patch } of plan.update) await store.listItems.update(id, patch);
  for (const row of plan.create) await store.listItems.create(row);
}

/** Adds only what is missing, at these servings. Re-adding replaces. */
export async function addRecipeToList(
  store: DataStore,
  items: readonly ListItem[],
  recipe: AnyRecipe,
  servings: number,
  pantry: PantryIndex,
): Promise<void> {
  await applyPlan(store, planAddRecipe(items, recipe, servings, pantry));
}

export async function removeRecipeFromList(store: DataStore, items: readonly ListItem[], recipeId: string): Promise<void> {
  await applyPlan(store, planRemoveRecipe(items, recipeId));
}

/** Keeps a web recipe in the library. Returns the new row. */
export async function saveToLibrary(store: DataStore, recipe: AnyRecipe, memberId: string): Promise<Recipe> {
  const { id: _id, inLibrary: _inLibrary, ...content } = recipe;
  const row: NewRow<Recipe> = { ...content, createdBy: memberId };
  return store.recipes.create(row);
}

/** Adds names to the pantry or staples, skipping anything already there. */
export async function addToPantry(
  store: DataStore,
  names: readonly string[],
  kind: PantryItem['kind'],
  existing: readonly PantryItem[],
): Promise<number> {
  const have = new Set(existing.filter((item) => item.kind === kind).map((item) => keyForText(item.name, item.canonicalId)));
  let added = 0;
  for (const raw of names) {
    const name = raw.trim();
    if (name === '') continue;
    const row = pantryRow(name.charAt(0).toUpperCase() + name.slice(1), kind);
    const key = keyForText(row.name, row.canonicalId);
    if (have.has(key)) continue;
    have.add(key);
    await store.pantry.create(row);
    added += 1;
  }
  return added;
}

/** "Move to pantry": bought things become Have now and leave the list. */
export async function moveToPantry(
  store: DataStore,
  items: readonly ListItem[],
  pantryItems: readonly PantryItem[],
): Promise<void> {
  const have = new Set(pantryItems.filter((p) => p.kind === 'have').map((p) => keyForText(p.name, p.canonicalId)));
  for (const item of items) {
    const key = keyForText(item.name, item.canonicalId);
    if (!have.has(key)) {
      const row: NewRow<PantryItem> = { name: item.name, section: item.section, kind: 'have' };
      if (item.canonicalId !== undefined) row.canonicalId = item.canonicalId;
      await store.pantry.create(row);
      have.add(key);
    }
    await store.listItems.remove(item.id);
  }
}
