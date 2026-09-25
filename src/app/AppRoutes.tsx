import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BoardPage } from '../features/board/BoardPage';
import { useKitchen } from '../features/larder/KitchenContext';

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

function Loading(): JSX.Element {
  return <p className="centred">Loading…</p>;
}

/** Every screen, by path. */
export function AppRoutes(): JSX.Element {
  const { loaded } = useKitchen();
  // Kitchen screens wait for their first read, so no empty state or "not
  // found" flashes up before the rows arrive. The board does not wait.
  const page = (node: ReactNode): ReactNode => (loaded ? <Suspense fallback={<Loading />}>{node}</Suspense> : <Loading />);

  return (
    <Routes>
      <Route path="/" element={<BoardPage />} />
      <Route path="/library" element={page(<Library />)} />
      <Route path="/search" element={page(<Search />)} />
      <Route path="/recipe/:id" element={page(<RecipeDetail />)} />
      <Route path="/recipe/:id/cook" element={page(<CookMode />)} />
      <Route path="/add" element={page(<AddRecipe />)} />
      <Route path="/import" element={page(<ImportRecipe />)} />
      <Route path="/pantry" element={page(<Pantry />)} />
      <Route path="/lists" element={page(<ShoppingList />)} />
      <Route path="/profile" element={page(<DietProfilePage />)} />
      {/* Not a kitchen screen, so it does not wait for the kitchen's first read. */}
      <Route path="/family" element={<Suspense fallback={<Loading />}><FamilyPage /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
