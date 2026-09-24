import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '../../auth/session';
import { useCollectionState } from '../../data/useCollection';
import type { AnyRecipe, DietProfile, ListGroup, ListItem, PantryItem, Recipe } from '../../domain/types';
import { pantryIndex } from '../../domain/kitchen/fit';
import type { PantryIndex } from '../../domain/kitchen/fit';
import { offlineProvider } from './seed/webIndex';
import type { RecipeSearchProvider } from './seed/webIndex';

/**
 * Everything the kitchen screens share, read once for the whole app: the
 * sidebar counts, the library, search and the shopping list all look at the
 * same rows, so they are subscribed to once here rather than per screen.
 */

export interface Kitchen {
  loaded: boolean;
  recipes: Recipe[];
  have: PantryItem[];
  staples: PantryItem[];
  pantry: PantryIndex;
  /** The family's diet profile; null until it exists. */
  profile: DietProfile | null;
  listItems: ListItem[];
  /** The family's own list groups, oldest first. */
  listGroups: ListGroup[];
  provider: RecipeSearchProvider;
  web: readonly AnyRecipe[];
  /** A library recipe by row id, or a web recipe by its "web:" id. */
  findRecipe: (id: string) => AnyRecipe | undefined;
}

const KitchenContext = createContext<Kitchen | null>(null);

export function useKitchen(): Kitchen {
  const kitchen = useContext(KitchenContext);
  if (kitchen === null) throw new Error('useKitchen() must be used inside <KitchenProvider>');
  return kitchen;
}

/** Newest first: "Recently added". */
function byNewest(a: Recipe, b: Recipe): number {
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

export function KitchenProvider({ children }: { children: ReactNode }): JSX.Element {
  const { store } = useSession();
  const recipes = useCollectionState(store.recipes);
  const pantryRows = useCollectionState(store.pantry);
  const profiles = useCollectionState(store.dietProfiles);
  const list = useCollectionState(store.listItems);
  const groups = useCollectionState(store.listGroups);

  const value = useMemo<Kitchen>(() => {
    const sorted = [...recipes.rows].sort(byNewest);
    const byId = new Map<string, AnyRecipe>(sorted.map((recipe) => [recipe.id, { ...recipe, inLibrary: true }]));
    for (const recipe of offlineProvider.all()) byId.set(recipe.id, recipe);

    const byAdded = (a: PantryItem, b: PantryItem): number => a.createdAt.localeCompare(b.createdAt);
    return {
      loaded: recipes.loaded && pantryRows.loaded && profiles.loaded && list.loaded && groups.loaded,
      recipes: sorted,
      have: pantryRows.rows.filter((row) => row.kind === 'have').sort(byAdded),
      staples: pantryRows.rows.filter((row) => row.kind === 'staple').sort(byAdded),
      pantry: pantryIndex(pantryRows.rows),
      // Oldest wins if two devices ever raced to create one.
      profile: [...profiles.rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null,
      listItems: [...list.rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      listGroups: [...groups.rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
      provider: offlineProvider,
      web: offlineProvider.all(),
      findRecipe: (id) => byId.get(id),
    };
  }, [recipes, pantryRows, profiles, list, groups]);

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}
