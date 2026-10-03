import { Link, useLocation } from 'react-router-dom';
import { Leaf } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../auth/session';
import { Brand } from '../components/Brand';
import { ThemeToggle } from '../components/theme/ThemeToggle';
import { cx, ForwardChevron, Tag } from '../components/ui';
import { useCollection } from '../data/useCollection';
import { useKitchen } from '../features/larder/KitchenContext';
import { ruleLabels } from '../features/larder/labels';
import { formatNumber } from '../i18n';
import { SECTIONS, isPinnable, locate } from './sections';
import type { Section, SectionPage } from './sections';
import s from './Shell.module.css';

/**
 * The sidebar on desktop and the tab bar on phones, both drawn from SECTIONS
 * (sections.ts). Links are plain <Link>s with aria-current set here: NavLink
 * would also mark a section header as the current page.
 */

type Here = ReturnType<typeof locate>;

/** Live counts by page path, beside pages in the sidebar. */
function useSectionCounts(): Record<string, number> {
  const { store } = useSession();
  const tasks = useCollection(store.tasks);
  const kitchen = useKitchen();
  return {
    '/': tasks.filter((task) => !task.done).length,
    '/lists': kitchen.listItems.filter((item) => !item.checked).length,
    '/library': kitchen.recipes.length,
    '/pantry': kitchen.have.length,
  };
}

function Count({ value }: { value: number | undefined }): JSX.Element | null {
  if (value === undefined || value === 0) return null;
  return <span className={cx(s.navCount, 'tabular')}>{formatNumber(value)}</span>;
}

/** The rules that filter every search, as one link to the profile. */
function DietCard(): JSX.Element {
  const { t } = useTranslation();
  const { profile } = useKitchen();
  const rules = ruleLabels(t, profile);
  return (
    // The words that name the block and the link stay for screen readers.
    <Link to="/profile" className={s.dietCard}>
      <Leaf size={18} strokeWidth={2} aria-hidden className={s.dietIcon} />
      <span className="visually-hidden">{t('nav.filtering')}</span>
      {rules.length === 0 ? (
        <span className={s.dietNone}>{t('nav.noRules')}</span>
      ) : (
        <span className={s.dietChips}>
          {rules.map((rule) => (
            <Tag key={rule}>
              <bdi>{rule}</bdi>
            </Tag>
          ))}
        </span>
      )}
      <span className="visually-hidden">{t('nav.editDiet')}</span>
      <ForwardChevron size={18} strokeWidth={2} aria-hidden className={s.dietChevron} />
    </Link>
  );
}

/** One section: a single line, or a header that opens to its pages while you're in it. */
function SidebarSection({ section, here, counts }: { section: Section; here: Here; counts: Record<string, number> }): JSX.Element {
  const { t } = useTranslation();
  const open = here?.section === section;
  const single = section.pages.length === 1;
  const first = section.pages[0];
  const current = open && single;
  return (
    <li>
      <Link to={first.path} className={cx(s.navItem, current && s.navActive, open && !single && s.navOpen)} aria-current={current ? 'page' : undefined}>
        <section.icon size={20} strokeWidth={2} aria-hidden />
        <span className={s.navLabel}>{t(section.labelKey)}</span>
        {single && <Count value={counts[first.path]} />}
      </Link>
      {open && !single && (
        <ul className={s.subNav}>
          {section.pages.map((page: SectionPage) => {
            const active = here?.page === page;
            return (
              <li key={page.path}>
                <Link to={page.path} className={cx(s.navItem, s.subItem, active && s.navActive)} aria-current={active ? 'page' : undefined}>
                  <page.icon size={18} strokeWidth={2} aria-hidden />
                  <span className={s.navLabel}>{t(page.labelKey)}</span>
                  <Count value={counts[page.path]} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {open && section.id === 'larder' && <DietCard />}
    </li>
  );
}

export function Sidebar(): JSX.Element {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const here = locate(pathname);
  const counts = useSectionCounts();
  return (
    <aside className={s.sidebar}>
      <Brand />
      <nav aria-label={t('nav.main')} className={s.sideNav}>
        <ul className={s.nav}>
          {SECTIONS.filter(isPinnable).map((section) => (
            <SidebarSection key={section.id} section={section} here={here} counts={counts} />
          ))}
        </ul>
        {/* Sections never pinned (Family) sit at the foot, above the theme. */}
        <ul className={cx(s.nav, s.navFoot)}>
          {SECTIONS.filter((section) => !isPinnable(section)).map((section) => (
            <SidebarSection key={section.id} section={section} here={here} counts={counts} />
          ))}
        </ul>
      </nav>
      <ThemeToggle compact className={s.theme} />
    </aside>
  );
}

export function TabBar(): JSX.Element {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const here = locate(pathname);
  return (
    <nav className={s.tabbar} aria-label={t('nav.main')}>
      {SECTIONS.filter(isPinnable).map((section) => {
        const active = here?.section === section;
        return (
          <Link key={section.id} to={section.pages[0].path} className={cx(s.tab, active && s.tabActive)} aria-current={active ? 'true' : undefined}>
            <span className={s.tabIcon}>
              <section.icon size={22} strokeWidth={2} aria-hidden />
            </span>
            <span className={s.tabLabel}>{t(section.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
