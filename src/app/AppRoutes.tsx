import { Suspense, lazy, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoadFailed } from '../components/LoadFailed';
import { BoardPage } from '../features/board/BoardPage';
import { useKitchen } from '../features/larder/KitchenContext';
import { loadShows, loadedShows } from './warm';

// The board is home, so kitchen screens load when first visited, not up front.
const Library = lazy(() => import('../features/larder/library/Library').then((m) => ({ default: m.Library })));
const Search = lazy(() => import('../features/larder/search/Search').then((m) => ({ default: m.Search })));
const RecipeDetail = lazy(() => import('../features/larder/detail/RecipeDetail').then((m) => ({ default: m.RecipeDetail })));
const Pantry = lazy(() => import('../features/larder/pantry/Pantry').then((m) => ({ default: m.Pantry })));
const ShoppingList = lazy(() => import('../features/lists/ShoppingList').then((m) => ({ default: m.ShoppingList })));
const DietProfilePage = lazy(() => import('../features/larder/profile/DietProfile').then((m) => ({ default: m.DietProfilePage })));
const CookMode = lazy(() => import('../features/larder/cook/CookMode'));
const AddRecipe = lazy(() => import('../features/larder/add/AddRecipe'));
const ImportRecipe = lazy(() => import('../features/larder/import/ImportRecipe'));
const FamilyPage = lazy(() => import('../features/family/FamilyPage').then((m) => ({ default: m.FamilyPage })));
// Shows also starts loading as someone heads for its link (warm.ts).
const LazyShows = lazy(() => loadShows().then((m) => ({ default: m.Shows })));
const HistoryPage = lazy(() => import('../features/board/history/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const AddressesPage = lazy(() => import('../features/family/addresses/AddressesPage').then((m) => ({ default: m.AddressesPage })));

function Loading(): JSX.Element {
  const { t } = useTranslation();
  return <p className="centred">{t('common.loading')}</p>;
}

/**
 * Shows, rendered at once when its code has already arrived (warmed from its
 * link): lazy() suspends on its first render even then, which paints Loading
 * for a frame. Chosen once per visit, so a later render never swaps the
 * component and resets the page.
 */
function ShowsRoute(): JSX.Element {
  const [loaded] = useState(loadedShows);
  return loaded === undefined ? <LazyShows /> : <loaded.Shows />;
}

/** Every screen, by path. */
export function AppRoutes(): JSX.Element {
  const { loaded, failed, retry } = useKitchen();
  // Kitchen screens wait for their first read, so no empty state or "not
  // found" flashes up before the rows arrive, and none stands in for rows
  // that failed to arrive. The board does not wait.
  const waiting = failed ? <LoadFailed onRetry={retry} /> : <Loading />;
  const page = (node: ReactNode): ReactNode => (loaded ? <Suspense fallback={<Loading />}>{node}</Suspense> : waiting);

  return (
    <Routes>
      <Route path="/" element={<BoardPage />} />
      {/* Not a kitchen screen: it waits for its own first read. */}
      <Route path="/history" element={<Suspense fallback={<Loading />}><HistoryPage /></Suspense>} />
      <Route path="/library" element={page(<Library />)} />
      <Route path="/search" element={page(<Search />)} />
      <Route path="/recipe/:id" element={page(<RecipeDetail />)} />
      <Route path="/recipe/:id/cook" element={page(<CookMode />)} />
      <Route path="/add" element={page(<AddRecipe />)} />
      <Route path="/import" element={page(<ImportRecipe />)} />
      <Route path="/pantry" element={page(<Pantry />)} />
      <Route path="/lists" element={page(<ShoppingList />)} />
      <Route path="/profile" element={page(<DietProfilePage />)} />
      {/* Not kitchen screens, so they do not wait for the kitchen's first read. Shows waits for its own. */}
      <Route path="/shows" element={<Suspense fallback={<Loading />}><ShowsRoute /></Suspense>} />
      <Route path="/family" element={<Suspense fallback={<Loading />}><FamilyPage /></Suspense>} />
      <Route path="/addresses" element={<Suspense fallback={<Loading />}><AddressesPage /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
