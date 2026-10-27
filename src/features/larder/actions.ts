import type { DataStore } from '../../data/types';
import type { AnyRecipe, ListGroup, ListItem, NewRow, Recipe } from '../../domain/types';
import { BUILT_IN_GROUPS, planAddOwn, planAddRecipe, planRemoveGroup, planRemoveRecipe } from '../../domain/kitchen/list';
import type { GroupSlot, ListPlan } from '../../domain/kitchen/list';

/**
 * The kitchen's writes. Screens decide what to do; these do it through the
 * store, so every write goes the same way whichever screen asked.
 */

/**
 * Returns the ids of the rows it created.
 *
 * Removes and updates touch rows that already exist, so they go out together
 * rather than one round trip each. Creates stay one after another: the list
 * shows items in createdAt order, and new ones keep the plan's order.
 */
async function applyPlan(store: DataStore, plan: ListPlan): Promise<string[]> {
  // Every write has finished before this returns or throws, as when they went one by one.
  const settled = await Promise.allSettled([
    ...plan.remove.map((id) => store.listItems.remove(id)),
    ...plan.update.map(({ id, patch }) => store.listItems.update(id, patch)),
  ]);
  const failed = settled.find((result) => result.status === 'rejected');
  if (failed !== undefined) throw failed.reason;
  const created: string[] = [];
  for (const row of plan.create) created.push((await store.listItems.create(row)).id);
  return created;
}

/**
 * Adds all but the basics, at these servings. Re-adding replaces.
 * Returns the ids of the items this recipe now puts on the list, new or not.
 */
export async function addRecipeToList(
  store: DataStore,
  items: readonly ListItem[],
  recipe: AnyRecipe,
  servings: number,
): Promise<string[]> {
  const plan = planAddRecipe(items, recipe, servings);
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

/**
 * Moves a group to a new position. A built-in group has no row until it is
 * first moved; if another device made that row a moment ago, the unique
 * constraint turns this insert away and the row it made is moved instead.
 */
export async function placeListGroup(store: DataStore, slot: GroupSlot, position: number): Promise<void> {
  if (slot.row !== undefined) {
    await store.listGroups.update(slot.row.id, { position });
    return;
  }
  const builtin = BUILT_IN_GROUPS.find((group) => group.id === slot.id);
  if (builtin === undefined) return;
  const id = builtin.id as NonNullable<ListGroup['builtin']>;
  try {
    await store.listGroups.create({ name: builtin.name, builtin: id, position });
  } catch (error) {
    const existing = (await store.listGroups.list()).find((row) => row.builtin === id);
    if (existing === undefined) throw error;
    await store.listGroups.update(existing.id, { position });
  }
}

/** Keeps a web recipe in the library. Returns the new row. */
export async function saveToLibrary(store: DataStore, recipe: AnyRecipe, memberId: string): Promise<Recipe> {
  const { id: _id, inLibrary: _inLibrary, ...content } = recipe;
  const row: NewRow<Recipe> = { ...content, createdBy: memberId };
  return store.recipes.create(row);
}
