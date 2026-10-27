import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '../../auth/session';
import { retryCollections, useCollectionState } from '../../data/useCollection';
import type { AnyRecipe, DietProfile, ListGroup, ListItem, Recipe } from '../../domain/types';
import { offlineProvider } from './seed/webIndex';
import type { RecipeSearchProvider } from './seed/webIndex';

/**
 * Everything the kitchen screens share, read once for the whole app: the
 * sidebar counts, the library, search and the shopping list all look at the
 * same rows, so they are subscribed to once here rather than per screen.
 */

export interface Kitchen {
  loaded: boolean;
  /** A first read failed: the kitchen screens show LoadFailed until it lands. */
  failed: boolean;
  /** Reads the kitchen's failed collections again now. */
  retry: () => void;
  recipes: Recipe[];
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
  const profiles = useCollectionState(store.dietProfiles);
  const list = useCollectionState(store.listItems);
  const groups = useCollectionState(store.listGroups);

  const value = useMemo<Kitchen>(() => {
    const sorted = [...recipes.rows].sort(byNewest);
    const byId = new Map<string, AnyRecipe>(sorted.map((recipe) => [recipe.id, { ...recipe, inLibrary: true }]));
    for (const recipe of offlineProvider.all()) byId.set(recipe.id, recipe);

    const all = [recipes, profiles, list, groups];
    return {
      loaded: all.every((rows) => rows.loaded),
      failed: all.some((rows) => rows.failed && !rows.loaded),
      retry: () => retryCollections(store.recipes, store.dietProfiles, store.listItems, store.listGroups),
      recipes: sorted,
      // Oldest wins if two devices ever raced to create one.
      profile: [...profiles.rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null,
      listItems: [...list.rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      listGroups: [...groups.rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
      provider: offlineProvider,
      web: offlineProvider.all(),
      findRecipe: (id) => byId.get(id),
    };
  }, [store, recipes, profiles, list, groups]);

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}
