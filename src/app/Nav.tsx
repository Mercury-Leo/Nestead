import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, LayoutGrid, Leaf, ListChecks, Milk, Search as SearchIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSession } from '../auth/session';
import { Brand } from '../components/Brand';
import { ThemeToggle } from '../components/theme/ThemeToggle';
import { cx, Tag } from '../components/ui';
import { useCollection } from '../data/useCollection';
import { ruleLabels } from '../domain/kitchen/diet';
import { useKitchen } from '../features/larder/KitchenContext';
import s from './Shell.module.css';

/** The sidebar on desktop and the tab bar on phones: the same items, two layouts. */

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

export function Sidebar(): JSX.Element {
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

      <ThemeToggle compact className={s.theme} />
    </aside>
  );
}

export function TabBar(): JSX.Element {
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
