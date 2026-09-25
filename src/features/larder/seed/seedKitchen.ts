import type { DataStore } from '../../../data/types';
import type { NewRow, Recipe } from '../../../domain/types';
import { planAddOwn } from '../../../domain/kitchen/list';
import { pantryRow } from '../../../domain/kitchen/pantry';
import { DEFAULT_STAPLES } from '../setup';
import { SEED_CUSTOM_RULES, SEED_HAVE, SEED_LIST, SEED_OWN, SEED_PRESETS, listRow } from './kitchen';
import { SEED_LIBRARY } from './recipes';

/** The demo family: the full Larder seed, so every screen has something on it. */
export async function seedDemoKitchen(store: DataStore): Promise<void> {
  if ((await store.dietProfiles.list()).length > 0) return;

  await store.dietProfiles.create({ presets: SEED_PRESETS, custom: [...SEED_CUSTOM_RULES], conflictMode: 'hide' });
  for (const name of DEFAULT_STAPLES) await store.pantry.create(pantryRow(name, 'staple'));
  for (const name of SEED_HAVE) await store.pantry.create(pantryRow(name, 'have'));

  // Oldest first, so the library's "Recently added" puts the first one on top.
  const ids = new Map<string, string>();
  for (const recipe of [...SEED_LIBRARY].reverse()) {
    const { id: slug, inLibrary: _inLibrary, ...content } = recipe;
    const created = await store.recipes.create(content as NewRow<Recipe>);
    ids.set(slug, created.id);
  }

  for (const spec of SEED_LIST) {
    await store.listItems.create(listRow(spec, ids.get(spec.recipeId) ?? spec.recipeId));
  }
  for (const { name, groupId } of SEED_OWN) {
    for (const row of planAddOwn([], [name], groupId).create) await store.listItems.create(row);
  }
}

/** Development only: empty the kitchen so the demo seed runs again. */
export async function clearKitchen(store: DataStore): Promise<void> {
  for (const row of await store.listItems.list()) await store.listItems.remove(row.id);
  for (const row of await store.listGroups.list()) await store.listGroups.remove(row.id);
  for (const row of await store.recipes.list()) await store.recipes.remove(row.id);
  for (const row of await store.pantry.list()) await store.pantry.remove(row.id);
  for (const row of await store.dietProfiles.list()) await store.dietProfiles.remove(row.id);
}
