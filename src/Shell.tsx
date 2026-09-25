import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BookOpen, LayoutGrid, Leaf, ListChecks, Milk, Search as SearchIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSession } from './auth/session';
import { Brand } from './components/Brand';
import { ErrorBoundary } from './components/ErrorBoundary';
import { cx, Tag } from './components/ui';
import { useCollection } from './data/useCollection';
import { BoardPage } from './features/board/BoardPage';
import { ruleLabels } from './domain/kitchen/diet';
import { useKitchen } from './features/larder/KitchenContext';
import { TimerHost } from './features/larder/timers/TimerHost';
import s from './Shell.module.css';

// The board is home, so kitchen screens load when first visited, not up front.
const Library = lazy(() => import('./features/larder/Library').then((m) => ({ default: m.Library })));
const Search = lazy(() => import('./features/larder/search/Search').then((m) => ({ default: m.Search })));
const RecipeDetail = lazy(() => import('./features/larder/detail/RecipeDetail').then((m) => ({ default: m.RecipeDetail })));
const Pantry = lazy(() => import('./features/larder/pantry/Pantry').then((m) => ({ default: m.Pantry })));
const ShoppingList = lazy(() => import('./features/lists/ShoppingList').then((m) => ({ default: m.ShoppingList })));
const DietProfilePage = lazy(() => import('./features/larder/profile/DietProfile').then((m) => ({ default: m.DietProfilePage })));
const CookMode = lazy(() => import('./features/larder/cook/CookMode'));
const AddRecipe = lazy(() => import('./features/larder/add/AddRecipe'));
const ImportRecipe = lazy(() => import('./features/larder/import/ImportRecipe'));
const FamilyPage = lazy(() => import('./features/family/FamilyPage').then((m) => ({ default: m.FamilyPage })));

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  end?: boolean;
  /** The first of the kitchen items, under the "Larder" heading. */
  larder?: boolean;
}

function useNavItems(): NavItem[] {
  const { store } = useSession();
  const tasks = useCollection(store.tasks);
  const kitchen = useKitchen();
  return [
    { to: '/', label: 'Board', icon: LayoutGrid, count: tasks.filter((task) => !task.done).length, end: true },
    // The shopping list is for everything, not only food, so it sits with the board.
    { to: '/lists', label: 'Lists', icon: ListChecks, count: kitchen.listItems.filter((item) => !item.checked).length },
    { to: '/library', label: 'Library', icon: BookOpen, count: kitchen.recipes.length, larder: true },
    { to: '/search', label: 'Search', icon: SearchIcon },
    { to: '/pantry', label: 'Pantry', icon: Milk, count: kitchen.have.length },
    { to: '/profile', label: 'Profile', icon: Leaf },
  ];
}

/** Recipe pages count as Library for the purposes of which tab is lit. */
function isActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/library') return ['/library', '/recipe', '/add', '/import'].some((p) => pathname.startsWith(p));
  return item.end === true ? pathname === item.to : pathname.startsWith(item.to);
}

function Sidebar(): JSX.Element {
  const items = useNavItems();
  const { pathname } = useLocation();
  const { profile } = useKitchen();
  const rules = ruleLabels(profile);

  return (
    <aside className={s.sidebar}>
      <Brand />
      <nav aria-label="Main">
        <ul className={s.nav}>
          {items.map((item) => {
            const active = isActive(item, pathname);
            return (
              <li key={item.to} className={cx(item.larder === true && s.navGroupStart)}>
                {item.larder === true && <p className={s.navGroup}>Larder</p>}
                <NavLink to={item.to} end={item.end} className={cx(s.navItem, active && s.navActive)} aria-current={active ? 'page' : undefined}>
                  <item.icon size={20} strokeWidth={2} aria-hidden />
                  <span className={s.navLabel}>{item.label}</span>
                  {item.count !== undefined && item.count > 0 && <span className={cx(s.navCount, 'tabular')}>{item.count}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={s.dietCard}>
        <p className={s.eyebrow}>Filtering every search</p>
        {rules.length === 0 ? (
          <p className={s.dietNone}>No diet rules yet.</p>
        ) : (
          <div className={s.dietChips}>
            {rules.map((rule) => (
              <Tag key={rule}>{rule}</Tag>
            ))}
          </div>
        )}
        <NavLink to="/profile" className={s.dietLink}>
          Edit diet profile
        </NavLink>
      </div>
    </aside>
  );
}

function TabBar(): JSX.Element {
  const items = useNavItems();
  const { pathname } = useLocation();
  return (
    <nav className={s.tabbar} aria-label="Main">
      {items.map((item) => {
        const active = isActive(item, pathname);
        return (
          <NavLink key={item.to} to={item.to} end={item.end} className={cx(s.tab, active && s.tabActive)} aria-current={active ? 'page' : undefined}>
            <span className={s.tabIcon}>
              <item.icon size={22} strokeWidth={2} aria-hidden />
            </span>
            <span className={s.tabLabel}>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function Loading(): JSX.Element {
  return <p className="centred">Loading…</p>;
}

export function Shell(): JSX.Element {
  const { pathname } = useLocation();
  const cooking = /^\/recipe\/[^/]+\/cook/.test(pathname);
  // Recipe pages have their own sticky actions, so the tab bar steps aside.
  const noTabBar = cooking || pathname.startsWith('/recipe/');

  const { loaded } = useKitchen();
  // Kitchen screens wait for their first read, so no empty state or "not
  // found" flashes up before the rows arrive. The board does not wait.
  const page = (node: ReactNode): ReactNode => (loaded ? <Suspense fallback={<Loading />}>{node}</Suspense> : <Loading />);

  return (
    <div className={cx(s.shell, cooking && s.fullscreen, noTabBar && s.noTabBar)}>
      {!cooking && <Sidebar />}
      <main className={s.main} id="main">
        <ErrorBoundary resetKey={pathname}>
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
        </ErrorBoundary>
      </main>
      {!noTabBar && <TabBar />}
      <TimerHost />
    </div>
  );
}
