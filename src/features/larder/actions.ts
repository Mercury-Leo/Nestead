import type { DataStore } from '../../data/types';
import type { AnyRecipe, ListItem, NewRow, PantryItem, Recipe } from '../../domain/types';
import { keyForText } from '../../domain/kitchen/fit';
import type { PantryIndex } from '../../domain/kitchen/fit';
import { planAddOwn, planAddRecipe, planRemoveGroup, planRemoveRecipe } from '../../domain/kitchen/list';
import type { ListPlan } from '../../domain/kitchen/list';
import { pantryRow } from '../../domain/kitchen/pantry';

/**
 * The kitchen's writes. Screens decide what to do; these do it through the
 * store, so every write goes the same way whichever screen asked.
 */

/** Returns the ids of the rows it created. */
async function applyPlan(store: DataStore, plan: ListPlan): Promise<string[]> {
  for (const id of plan.remove) await store.listItems.remove(id);
  for (const { id, patch } of plan.update) await store.listItems.update(id, patch);
  const created: string[] = [];
  for (const row of plan.create) created.push((await store.listItems.create(row)).id);
  return created;
}

/**
 * Adds only what is missing, at these servings. Re-adding replaces.
 * Returns the ids of the items this recipe now puts on the list, new or not.
 */
export async function addRecipeToList(
  store: DataStore,
  items: readonly ListItem[],
  recipe: AnyRecipe,
  servings: number,
  pantry: PantryIndex,
): Promise<string[]> {
  const plan = planAddRecipe(items, recipe, servings, pantry);
  const created = await applyPlan(store, plan);
  // Updates also cover items that lost this recipe's share; those were not added.
  const topped = plan.update.filter(({ patch }) => patch.parts?.some((part) => part.recipeId === recipe.id) === true).map(({ id }) => id);
  return [...topped, ...created];
}

export async function removeRecipeFromList(store: DataStore, items: readonly ListItem[], recipeId: string): Promise<void> {
  await applyPlan(store, planRemoveRecipe(items, recipeId));
}

/** Things typed into one group of the list by hand. */
export async function addOwnToList(store: DataStore, items: readonly ListItem[], names: readonly string[], groupId: string): Promise<void> {
  await applyPlan(store, planAddOwn(items, names, groupId));
}

/** Deletes a family-made group; its items move to General first. */
export async function removeListGroup(store: DataStore, items: readonly ListItem[], groupId: string): Promise<void> {
  await applyPlan(store, planRemoveGroup(items, groupId));
  await store.listGroups.remove(groupId);
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
