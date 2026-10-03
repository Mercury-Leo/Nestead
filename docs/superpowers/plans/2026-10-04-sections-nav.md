# Sections Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat six-item nav with sections (Board, Lists, Larder, Family). On phones, four pinned sections and More go in the bar, and a section's pages show as pills. On desktop, the sidebar opens up the section you're in.

**Architecture:** A React-free `src/app/sections.ts` holds every section and its pages, plus pure helpers: `locate()`, `resolvePins()` and `togglePin()`. `Nav.tsx` renders the sidebar, tab bar, More sheet and page pills from that list. Pins are a per-family device preference (`navPins`) read and written with the existing preference helpers. Routes, URLs, the `DataStore` and the schema do not change.

**Tech Stack:** React 18, TypeScript strict, react-router 6, i18next (keys typed from `en.json`), lucide-react, CSS modules, Vitest 2 + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-04-sections-nav-design.md`

## Global Constraints

- **URLs stay as they are.** `/`, `/lists`, `/library`, `/search`, `/pantry`, `/profile`, `/family`, `/recipe/:id`, `/recipe/:id/cook`, `/add` and `/import` keep their paths. Don't touch `AppRoutes.tsx`.
- **The bar has at most four pinned sections plus More** (`MAX_PINS = 4`). Family has `pinnable: false`.
- **Pins are saved per family, on the device.** Use `readPreference(store.familyId, 'navPins')` and `writePreference(...)` from `src/data/local/localStore.ts`, never the `DataStore`.
- **Every UI string goes through `t()`.** New keys go in both `src/i18n/locales/en.json` and `he.json`; `src/i18n/i18n.test.ts` checks the locales against each other. English kept in code on purpose needs an `i18n:` comment (`src/i18n/literals.test.ts`).
- **Styling rules:**
  - CSS modules only, with colours from tokens in `src/styles/tokens.css`. Components never branch on the theme.
  - Logical properties (`inset-inline-*`, `margin-inline-*`) so Hebrew mirrors.
  - Touch targets at least 44px tall.
- **`aria-current="page"` marks the current page link.** A phone tab or the More button uses `aria-current="true"` for the current section. Use react-router's `Link`, not `NavLink`: `NavLink` sets `aria-current="page"` by itself, and that would mark a Larder header as the current page too.
- **Before editing `src/app/`, read the "Rules & gotchas" in `src/app/README.md`**, and update the README in the same branch (Task 5).
- **Commits.** Several sessions share this checkout, so check `git status` first and stage only your own paths. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't push: a push to `main` deploys.

## File map

| File | Responsibility |
| --- | --- |
| `src/app/sections.ts` (new) | The sections and their pages; `locate()`, `resolvePins()`, `togglePin()`, `DEFAULT_PINS`, `MAX_PINS`, `PINS_PREFERENCE`. No React. |
| `src/app/sections.test.ts` (new) | Unit tests for the above, plus a check that every route in `AppRoutes.tsx` has a section. |
| `src/app/Nav.tsx` (rewrite) | `Sidebar`, `TabBar`, `MoreSheet` (internal), `PagePills`, `useSectionCounts()`, `usePins()`. |
| `src/app/Nav.test.tsx` (new) | jsdom tests for the sidebar, tab bar, More sheet and pills. |
| `src/app/Shell.tsx` | Renders `<PagePills />` at the top of `<main>` when the tab bar shows. |
| `src/app/Shell.module.css` | Sidebar sections and sub-items, the More button, the sheet grid, pills. |
| `src/i18n/locales/en.json`, `he.json` | New `nav.*` keys; `nav.profile` removed. |
| `src/app/README.md`, `CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/LARDER.md` | Docs (Task 5). |

---

### Task 1: The section list and its rules

**Files:**
- Create: `src/app/sections.ts`
- Create: `src/app/sections.test.ts`
- Modify: `src/i18n/locales/en.json` (the `"nav"` object, lines 18-31)
- Modify: `src/i18n/locales/he.json` (the `"nav"` object, lines 19-32)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (used by Tasks 2-4):
  - `type NavKey = \`nav.${keyof (typeof en)['nav']}\``
  - `type SectionId = 'board' | 'lists' | 'larder' | 'family'`
  - `interface SectionPage { path: string; labelKey: NavKey; icon: LucideIcon; end?: boolean; also?: readonly string[] }`
  - `interface Section { id: SectionId; labelKey: NavKey; icon: LucideIcon; pages: readonly [SectionPage, ...SectionPage[]]; pinnable?: false }`
  - `const SECTIONS: readonly Section[]`
  - `const MAX_PINS = 4`
  - `const PINS_PREFERENCE = 'navPins'`
  - `const DEFAULT_PINS: readonly SectionId[]`
  - `isPinnable(section: Section): boolean`
  - `locate(pathname: string): { section: Section; page: SectionPage } | undefined`. The returned objects are the same objects as in `SECTIONS`, so `===` works.
  - `resolvePins(stored: unknown, max?: number): SectionId[]`
  - `type PinRefusal = 'barFull' | 'keepOne'`
  - `togglePin(pins: readonly SectionId[], id: SectionId, max?: number): { pins: SectionId[]; refused?: PinRefusal }`
  - New i18n keys: `nav.diet`, `nav.family`, `nav.more`, `nav.editBar`, `nav.done`, `nav.pinnedCount` (`{{pinned}}`, `{{max}}`), `nav.barFull`, `nav.keepOne`, `nav.notPinnable` (`{{section}}`), `nav.sectionPages` (`{{section}}`).

- [ ] **Step 1: Add the translation keys**

In `src/i18n/locales/en.json`, replace the `"nav"` object with the one below. Keep `"profile"` for now: `Nav.tsx` still uses it until Task 2.

```json
  "nav": {
    "home": "Nestead home",
    "main": "Main",
    "board": "Board",
    "lists": "Lists",
    "library": "Library",
    "search": "Search",
    "pantry": "Pantry",
    "profile": "Profile",
    "diet": "Diet",
    "larder": "Larder",
    "family": "Family",
    "more": "More",
    "editBar": "Edit bar",
    "done": "Done",
    "pinnedCount": "{{pinned}} of {{max}} in the bar",
    "barFull": "The bar is full. Unpin one first.",
    "keepOne": "Keep at least one in the bar.",
    "notPinnable": "{{section}}, always under More",
    "sectionPages": "{{section}} pages",
    "filtering": "Filtering every search",
    "noRules": "No diet rules yet.",
    "editDiet": "Edit diet profile"
  },
```

In `src/i18n/locales/he.json`, replace the `"nav"` object:

```json
  "nav": {
    "home": "Nestead – דף הבית",
    "main": "ניווט ראשי",
    "board": "לוח",
    "lists": "קניות",
    "library": "ספרייה",
    "search": "חיפוש",
    "pantry": "מזווה",
    "profile": "תזונה",
    "diet": "תזונה",
    "larder": "מטבח",
    "family": "משפחה",
    "more": "עוד",
    "editBar": "עריכת הסרגל",
    "done": "סיום",
    "pinnedCount": "{{pinned}} מתוך {{max}} בסרגל",
    "barFull": "הסרגל מלא. יש להסיר אחד קודם.",
    "keepOne": "צריך להשאיר לפחות אחד בסרגל.",
    "notPinnable": "{{section}}, תמיד תחת עוד",
    "sectionPages": "דפי {{section}}",
    "filtering": "חלים על כל חיפוש",
    "noRules": "עדיין אין כללי תזונה.",
    "editDiet": "עריכת פרופיל התזונה"
  },
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/sections.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import he from '../i18n/locales/he.json';
import { DEFAULT_PINS, MAX_PINS, SECTIONS, locate, resolvePins, togglePin } from './sections';

/** "section/page path" for a pathname, or undefined: short to compare. */
function where(pathname: string): string | undefined {
  const hit = locate(pathname);
  return hit === undefined ? undefined : `${hit.section.id}${hit.page.path}`;
}

describe('locate', () => {
  it('lights the board on / only', () => {
    expect(where('/')).toBe('board/');
    expect(where('/board-thing')).toBeUndefined();
  });

  it('counts recipe pages, adding and importing as Library', () => {
    for (const path of ['/library', '/recipe/abc', '/recipe/abc/cook', '/add', '/import']) {
      expect(where(path), path).toBe('larder/library');
    }
  });

  it("finds Larder's other pages", () => {
    expect(where('/search')).toBe('larder/search');
    expect(where('/pantry')).toBe('larder/pantry');
    expect(where('/profile')).toBe('larder/profile');
  });

  it('finds Lists and Family', () => {
    expect(where('/lists')).toBe('lists/lists');
    expect(where('/family')).toBe('family/family');
  });

  it('matches whole path segments, not prefixes of words', () => {
    expect(where('/nope')).toBeUndefined();
    expect(where('/listsx')).toBeUndefined();
    expect(where('/recipes')).toBeUndefined();
  });

  it('gives every route in AppRoutes a section', () => {
    const source = readFileSync(join(__dirname, 'AppRoutes.tsx'), 'utf8');
    const paths = [...source.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1] as string).filter((path) => path !== '*');
    // Guards the pattern: if it stops matching, the next line would pass vacuously.
    expect(paths.length).toBeGreaterThan(5);
    expect(paths.filter((path) => locate(path.replace(/:\w+/g, 'x')) === undefined)).toEqual([]);
  });
});

describe('the section list', () => {
  it('has unique section ids and page paths', () => {
    const ids = SECTIONS.map((section) => section.id);
    const paths = SECTIONS.flatMap((section) => section.pages.map((page) => page.path));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('has a label for every section and page in every locale', () => {
    const names = SECTIONS.flatMap((section) => [section.labelKey, ...section.pages.map((page) => page.labelKey)]).map((key) => key.slice('nav.'.length));
    for (const name of names) {
      expect(en.nav, name).toHaveProperty(name);
      expect(he.nav, name).toHaveProperty(name);
    }
  });

  it('never pins Family', () => {
    expect(SECTIONS.find((section) => section.id === 'family')?.pinnable).toBe(false);
  });
});

describe('resolvePins', () => {
  it('starts from the first pinnable sections', () => {
    // Activities joins these when it lands.
    expect(DEFAULT_PINS).toEqual(['board', 'lists', 'larder']);
  });

  it('falls back to the defaults for nothing, junk or an empty list', () => {
    expect(resolvePins(undefined)).toEqual(DEFAULT_PINS);
    expect(resolvePins('board')).toEqual(DEFAULT_PINS);
    expect(resolvePins([])).toEqual(DEFAULT_PINS);
    expect(resolvePins(['nope', 'family'])).toEqual(DEFAULT_PINS);
  });

  it('drops unknown, duplicate and unpinnable ids', () => {
    expect(resolvePins(['family', 'nope', 'lists', 'lists', 3])).toEqual(['lists']);
  });

  it('keeps the list order, not the order they were pinned in', () => {
    expect(resolvePins(['larder', 'board'])).toEqual(['board', 'larder']);
  });

  it('keeps at most the maximum', () => {
    expect(resolvePins(['board', 'lists', 'larder'], 2)).toEqual(['board', 'lists']);
    expect(resolvePins(SECTIONS.map((section) => section.id)).length).toBeLessThanOrEqual(MAX_PINS);
  });
});

describe('togglePin', () => {
  it('unpins a pinned section', () => {
    expect(togglePin(['board', 'lists', 'larder'], 'lists')).toEqual({ pins: ['board', 'larder'] });
  });

  it('pins an unpinned section in list order', () => {
    expect(togglePin(['larder'], 'board')).toEqual({ pins: ['board', 'larder'] });
  });

  it('refuses to unpin the last one', () => {
    expect(togglePin(['board'], 'board')).toEqual({ pins: ['board'], refused: 'keepOne' });
  });

  it('refuses a pin past the maximum, without swapping one out', () => {
    expect(togglePin(['board', 'lists'], 'larder', 2)).toEqual({ pins: ['board', 'lists'], refused: 'barFull' });
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/app/sections.test.ts`
Expected: FAIL, with "Failed to resolve import "./sections"" or a similar error saying the module can't be found.

- [ ] **Step 4: Write `src/app/sections.ts`**

```ts
import { BookOpen, CookingPot, LayoutGrid, Leaf, ListChecks, Milk, Search, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type en from '../i18n/locales/en.json';

/**
 * Every section of the app and its pages, in order. The sidebar, the tab bar,
 * the More sheet and the page pills all render from this list, so a new
 * section is one entry here plus its routes in AppRoutes.tsx
 * (sections.test.ts fails for a route no page claims).
 */

export type NavKey = `nav.${keyof (typeof en)['nav']}`;

export type SectionId = 'board' | 'lists' | 'larder' | 'family';

export interface SectionPage {
  path: string;
  labelKey: NavKey;
  icon: LucideIcon;
  /** Lit on this exact path only (the board's "/"). */
  end?: boolean;
  /** Other paths whose pages count as this one: recipe pages are Library. */
  also?: readonly string[];
}

export interface Section {
  id: SectionId;
  labelKey: NavKey;
  icon: LucideIcon;
  /** The first page is where the section opens. */
  pages: readonly [SectionPage, ...SectionPage[]];
  /** Never in the phone's bar; always under More and at the foot of the sidebar. */
  pinnable?: false;
}

export const SECTIONS: readonly Section[] = [
  { id: 'board', labelKey: 'nav.board', icon: LayoutGrid, pages: [{ path: '/', labelKey: 'nav.board', icon: LayoutGrid, end: true }] },
  // The shopping list is for everything, not only food, so it is not part of the Larder.
  { id: 'lists', labelKey: 'nav.lists', icon: ListChecks, pages: [{ path: '/lists', labelKey: 'nav.lists', icon: ListChecks }] },
  {
    id: 'larder',
    labelKey: 'nav.larder',
    icon: CookingPot,
    pages: [
      { path: '/library', labelKey: 'nav.library', icon: BookOpen, also: ['/recipe', '/add', '/import'] },
      { path: '/search', labelKey: 'nav.search', icon: Search },
      { path: '/pantry', labelKey: 'nav.pantry', icon: Milk },
      { path: '/profile', labelKey: 'nav.diet', icon: Leaf },
    ],
  },
  { id: 'family', labelKey: 'nav.family', icon: Users, pages: [{ path: '/family', labelKey: 'nav.family', icon: Users }], pinnable: false },
];

/** Sections in the phone's bar, besides More. */
export const MAX_PINS = 4;

/** The device preference holding the pinned section ids, per family. */
export const PINS_PREFERENCE = 'navPins';

export function isPinnable(section: Section): boolean {
  return section.pinnable !== false;
}

export const DEFAULT_PINS: readonly SectionId[] = SECTIONS.filter(isPinnable)
  .slice(0, MAX_PINS)
  .map((section) => section.id);

/** How long a prefix of `pathname` this page claims, or -1 if none. */
function claim(page: SectionPage, pathname: string): number {
  if (page.end === true) return pathname === page.path ? page.path.length : -1;
  let best = -1;
  for (const prefix of [page.path, ...(page.also ?? [])]) {
    const hit = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (hit && prefix.length > best) best = prefix.length;
  }
  return best;
}

/** The section and page lit for a path: the longest claim wins. */
export function locate(pathname: string): { section: Section; page: SectionPage } | undefined {
  let found: { section: Section; page: SectionPage } | undefined;
  let best = -1;
  for (const section of SECTIONS) {
    for (const page of section.pages) {
      const length = claim(page, pathname);
      if (length > best) {
        best = length;
        found = { section, page };
      }
    }
  }
  return found;
}

/**
 * The pins to show from a stored value: known, pinnable ids in list order, at
 * most `max` of them; the defaults if that leaves none. A section removed from
 * the code drops out of the bar on its own.
 */
export function resolvePins(stored: unknown, max: number = MAX_PINS): SectionId[] {
  const wanted = new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []);
  const pins = SECTIONS.filter((section) => isPinnable(section) && wanted.has(section.id))
    .slice(0, max)
    .map((section) => section.id);
  return pins.length > 0 ? pins : DEFAULT_PINS.slice(0, max);
}

export type PinRefusal = 'barFull' | 'keepOne';

/** Pins or unpins one section. A full bar or a last pin is refused, never swapped. */
export function togglePin(pins: readonly SectionId[], id: SectionId, max: number = MAX_PINS): { pins: SectionId[]; refused?: PinRefusal } {
  if (pins.includes(id)) {
    if (pins.length === 1) return { pins: [...pins], refused: 'keepOne' };
    return { pins: pins.filter((pin) => pin !== id) };
  }
  if (pins.length >= max) return { pins: [...pins], refused: 'barFull' };
  return { pins: resolvePins([...pins, id], max) };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/app/sections.test.ts src/i18n`
Expected: PASS. The `src/i18n` suites must still pass with the new keys.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/sections.ts src/app/sections.test.ts src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Nav: one list of sections and their pages, with pin rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The sidebar, by section

**Files:**
- Modify: `src/app/Nav.tsx`: replace `useNavItems()`, `isActive()` and `Sidebar`; `TabBar` is replaced in Task 3.
- Modify: `src/app/Shell.module.css`: the sidebar block.
- Modify: `src/i18n/locales/en.json`, `he.json`: remove `nav.profile`.
- Create: `src/app/Nav.test.tsx`

**Interfaces:**
- Consumes: `SECTIONS`, `locate`, `isPinnable`, `Section`, `SectionPage` from Task 1.
- Produces:
  - `useSectionCounts(): Record<string, number>`, keyed by page path (internal to `Nav.tsx`).
  - `export function Sidebar(): JSX.Element`, unchanged for `Shell.tsx`.
  - The `render()` test helper in `Nav.test.tsx`, which Tasks 3 and 4 extend.

- [ ] **Step 1: Write the failing tests**

Create `src/app/Nav.test.tsx`:

```tsx
import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SessionContext } from '../auth/session';
import type { Session } from '../auth/session';
import { ThemeProvider } from '../components/theme/theme';
import { createLocalStore } from '../data/local/localStore';
import type { Member } from '../domain/types';
import { KitchenProvider } from '../features/larder/KitchenContext';
import { LocaleProvider, i18n } from '../i18n';
import { Sidebar } from './Nav';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const alex: Member = { id: 'm-alex', familyId: 'f-test', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };

function session(): Session {
  return { store: createLocalStore('f-test'), me: alex, members: [alex], signOut: async () => {} };
}

/** Shows the router's path, so a test can see where a click went. */
function Where(): JSX.Element {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

let unmount: (() => void) | null = null;

async function render(node: ReactNode, path: string): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <ThemeProvider>
          <SessionContext.Provider value={session()}>
            <KitchenProvider>
              <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                {node}
                <Where />
              </MemoryRouter>
            </KitchenProvider>
          </SessionContext.Provider>
        </ThemeProvider>
      </LocaleProvider>,
    );
  });
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

/** The link whose visible text is `label`. */
function link(host: HTMLElement, label: string): HTMLAnchorElement | undefined {
  return [...host.querySelectorAll('a')].find((a) => a.textContent?.trim().startsWith(label));
}

beforeAll(() => {
  window.matchMedia ??= (query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList;
  // jsdom has no modal dialogs; the Sheet opens and closes its <dialog> with these.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  unmount?.();
  unmount = null;
  localStorage.clear();
});

describe('the sidebar', () => {
  it("lists every section, and the current section's pages", async () => {
    const host = await render(<Sidebar />, '/pantry');
    for (const key of ['nav.board', 'nav.lists', 'nav.larder', 'nav.library', 'nav.search', 'nav.pantry', 'nav.diet', 'nav.family'] as const) {
      expect(link(host, i18n.t(key)), key).toBeDefined();
    }
    expect(link(host, i18n.t('nav.pantry'))?.getAttribute('aria-current')).toBe('page');
    // The section header is not the page.
    expect(link(host, i18n.t('nav.larder'))?.getAttribute('aria-current')).toBeNull();
  });

  it("folds sections you're not in", async () => {
    const host = await render(<Sidebar />, '/');
    expect(link(host, i18n.t('nav.board'))?.getAttribute('aria-current')).toBe('page');
    expect(link(host, i18n.t('nav.larder'))?.getAttribute('href')).toBe('/library');
    expect(link(host, i18n.t('nav.pantry'))).toBeUndefined();
  });

  it('counts recipe pages as Library', async () => {
    const host = await render(<Sidebar />, '/recipe/abc');
    expect(link(host, i18n.t('nav.library'))?.getAttribute('aria-current')).toBe('page');
  });

  it('shows the diet rules only in the Larder', async () => {
    const inLarder = await render(<Sidebar />, '/library');
    expect(inLarder.textContent).toContain(i18n.t('nav.editDiet'));
    unmount?.();
    const onBoard = await render(<Sidebar />, '/');
    expect(onBoard.textContent).not.toContain(i18n.t('nav.editDiet'));
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/app/Nav.test.tsx`
Expected: FAIL. The current sidebar has no Larder or Family link, Diet is labelled "Profile", and every page is always listed.

- [ ] **Step 3: Rewrite the top of `Nav.tsx` and `Sidebar`**

Replace everything in `src/app/Nav.tsx` above `export function TabBar` with the code below, and leave `TabBar` as it is for now. Then make the existing `TabBar` compile by giving it a temporary list from `SECTIONS`. Task 3 replaces it entirely.

```tsx
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
```

For the temporary `TabBar`, replace its first lines (`const items = useNavItems();` and `isActive(...)`) so that it renders one tab per page, each linking to that page. Here is the temporary version. Task 3 deletes it:

```tsx
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
```

- [ ] **Step 4: Update the sidebar CSS**

In `src/app/Shell.module.css`, delete `.navGroupStart` and `.navGroup`. In `.dietCard`, change `margin-top: auto;` to `margin-top: 8px;`. Then add the following after `.navCount { … }`:

```css
.sideNav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

/* Sections never pinned (Family) sit at the foot of the sidebar. */
.navFoot {
  margin-top: auto;
}

/* A section header while you're in one of its pages. */
.navOpen {
  color: var(--ink);
  font-weight: 700;
}

.navOpen svg {
  color: var(--accent);
}

.subNav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 6px;
  padding: 0;
  list-style: none;
}

.subItem {
  min-height: 44px;
  padding-inline-start: 26px;
  font-size: 15px;
}
```

- [ ] **Step 5: Remove `nav.profile`**

Nothing uses `nav.profile` any more. Run `git grep -n "nav.profile" src` to confirm the only hits are in the two locale files. Then delete the `"profile": …` line from the `"nav"` object in both `en.json` and `he.json`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run src/app src/i18n`
Expected: PASS.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `t(section.labelKey)` fails to type-check, `NavKey` probably resolved to `string`. Check that `import type en from '../i18n/locales/en.json'` is in `sections.ts`, and don't cast it away.

- [ ] **Step 8: Commit**

```bash
git add src/app/Nav.tsx src/app/Nav.test.tsx src/app/Shell.module.css src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Nav: the sidebar lists sections and opens the one you're in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The tab bar, pins and the More sheet

**Files:**
- Modify: `src/app/Nav.tsx`: replace the temporary `TabBar`; add `usePins()` and `MoreSheet`.
- Modify: `src/app/Shell.module.css`: the More button and the sheet grid.
- Modify: `src/app/Nav.test.tsx`: add a `describe('the tab bar')` block.

**Interfaces:**
- Consumes: `SECTIONS`, `isPinnable`, `locate`, `resolvePins`, `togglePin`, `MAX_PINS`, `PINS_PREFERENCE`, `SectionId` and `PinRefusal` from Task 1. Also `readPreference(familyId, name)` and `writePreference(familyId, name, value)` from `src/data/local/localStore.ts`, and `Sheet` and `Button` from `src/components/ui`.
- Produces: `export function TabBar(): JSX.Element`, unchanged for `Shell.tsx`.

- [ ] **Step 1: Write the failing tests**

In `src/app/Nav.test.tsx`, change the import to `import { Sidebar, TabBar } from './Nav';`. Then add these helpers below `link()` and this block at the end of the file:

```tsx
async function click(element: Element | null | undefined): Promise<void> {
  if (element === null || element === undefined) throw new Error('nothing to click');
  await act(async () => {
    (element as HTMLElement).click();
  });
}

function bar(host: HTMLElement): HTMLElement {
  return host.querySelector(`nav[aria-label="${i18n.t('nav.main')}"]`) as HTMLElement;
}

function moreButton(host: HTMLElement): HTMLButtonElement {
  return [...bar(host).querySelectorAll('button')].find((b) => b.textContent === i18n.t('nav.more')) as HTMLButtonElement;
}

/** The sheet's button whose text or label starts with `label`. */
function sheetButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('dialog button')].find((b) =>
    (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().startsWith(label),
  ) as HTMLButtonElement | undefined;
}

describe('the tab bar', () => {
  it('shows the pinned sections and More, and lights the current section', async () => {
    const host = await render(<TabBar />, '/recipe/abc');
    const labels = [...bar(host).querySelectorAll('a')].map((a) => a.textContent);
    expect(labels).toEqual([i18n.t('nav.board'), i18n.t('nav.lists'), i18n.t('nav.larder')]);
    expect(link(bar(host), i18n.t('nav.larder'))?.getAttribute('aria-current')).toBe('true');
    expect(moreButton(host).getAttribute('aria-haspopup')).toBe('dialog');
    expect(moreButton(host).getAttribute('aria-current')).toBeNull();
  });

  it("lights More in a section that isn't pinned", async () => {
    const host = await render(<TabBar />, '/family');
    expect(moreButton(host).getAttribute('aria-current')).toBe('true');
  });

  it('opens More, and a tile goes to its section and closes the sheet', async () => {
    const host = await render(<TabBar />, '/');
    await click(moreButton(host));
    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
    await click(link(dialog as HTMLElement, i18n.t('nav.family')));
    expect(host.querySelector('[data-testid="where"]')?.textContent).toBe('/family');
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  });

  it('unpins from Edit bar, and keeps the choice', async () => {
    let host = await render(<TabBar />, '/');
    await click(moreButton(host));
    await click(sheetButton(i18n.t('nav.editBar')));
    const lists = sheetButton(i18n.t('nav.lists'));
    expect(lists?.getAttribute('aria-pressed')).toBe('true');
    await click(lists);
    expect(link(bar(host), i18n.t('nav.lists'))).toBeUndefined();
    expect(document.querySelector('dialog')?.textContent).toContain(i18n.t('nav.pinnedCount', { pinned: 2, max: 4 }));

    unmount?.();
    host = await render(<TabBar />, '/');
    expect(link(bar(host), i18n.t('nav.lists'))).toBeUndefined();
    expect(link(bar(host), i18n.t('nav.board'))).toBeDefined();
  });

  it('refuses to unpin the last section, and says so', async () => {
    const host = await render(<TabBar />, '/');
    await click(moreButton(host));
    await click(sheetButton(i18n.t('nav.editBar')));
    await click(sheetButton(i18n.t('nav.lists')));
    await click(sheetButton(i18n.t('nav.larder')));
    await click(sheetButton(i18n.t('nav.board')));
    expect(link(bar(host), i18n.t('nav.board'))).toBeDefined();
    expect(document.querySelector('dialog')?.textContent).toContain(i18n.t('nav.keepOne'));
  });

  it("doesn't let Family be pinned", async () => {
    const host = await render(<TabBar />, '/');
    await click(moreButton(host));
    await click(sheetButton(i18n.t('nav.editBar')));
    const family = sheetButton(i18n.t('nav.family'));
    expect(family?.disabled).toBe(true);
    expect(family?.getAttribute('aria-label')).toBe(i18n.t('nav.notPinnable', { section: i18n.t('nav.family') }));
  });
});
```

You can't reach a full bar through the UI until there are five pinnable sections. The `togglePin(…, 2)` test in Task 1 covers that refusal.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/app/Nav.test.tsx`
Expected: the sidebar tests PASS and the tab bar tests FAIL. The bar has no More button yet.

- [ ] **Step 3: Replace the temporary `TabBar` with the real one**

In `src/app/Nav.tsx`, add to the imports:

```tsx
import { useState } from 'react';
import { Ellipsis, Pin } from 'lucide-react';
import { readPreference, writePreference } from '../data/local/localStore';
import { Button, Sheet } from '../components/ui';
import { MAX_PINS, PINS_PREFERENCE, resolvePins, togglePin } from './sections';
import type { PinRefusal, SectionId } from './sections';
```

Merge these into the existing import lines rather than repeating a module. For example, `Ellipsis, Leaf, Pin` from `lucide-react` becomes one line, and `Button, cx, ForwardChevron, Sheet, Tag` from `../components/ui` becomes another.

Then replace the temporary `TabBar` with:

```tsx
/** The sections in this person's bar on this device. */
function usePins(): [SectionId[], (pins: SectionId[]) => void] {
  const { store } = useSession();
  const [pins, setPins] = useState(() => resolvePins(readPreference(store.familyId, PINS_PREFERENCE)));
  const save = (next: SectionId[]): void => {
    setPins(next);
    writePreference(store.familyId, PINS_PREFERENCE, next);
  };
  return [pins, save];
}

/** Every section as a tile; Edit bar turns the tiles into pin toggles. */
function MoreSheet({ open, onClose, pins, onPins }: { open: boolean; onClose: () => void; pins: SectionId[]; onPins: (pins: SectionId[]) => void }): JSX.Element {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [refused, setRefused] = useState<PinRefusal | undefined>(undefined);

  const close = (): void => {
    setEditing(false);
    setRefused(undefined);
    onClose();
  };
  const toggle = (id: SectionId): void => {
    const result = togglePin(pins, id);
    onPins(result.pins);
    setRefused(result.refused);
  };

  let status = '';
  if (editing) status = refused === undefined ? t('nav.pinnedCount', { pinned: pins.length, max: MAX_PINS }) : t(`nav.${refused}`);

  return (
    <Sheet open={open} onClose={close} title={t('nav.more')}>
      <div className={s.moreHead}>
        <p className={s.moreStatus} aria-live="polite">
          {status}
        </p>
        <Button
          variant="ghost"
          onClick={() => {
            setEditing(!editing);
            setRefused(undefined);
          }}
        >
          {editing ? t('nav.done') : t('nav.editBar')}
        </Button>
      </div>
      <ul className={s.moreGrid}>
        {SECTIONS.map((section) => {
          const label = t(section.labelKey);
          const pinned = pins.includes(section.id);
          const face = (
            <>
              <section.icon size={22} strokeWidth={2} aria-hidden />
              <span>{label}</span>
              {editing && pinned && <Pin size={14} strokeWidth={2} aria-hidden className={s.morePin} />}
            </>
          );
          let tile: JSX.Element;
          if (!editing) {
            tile = (
              <Link to={section.pages[0].path} className={s.moreTile} onClick={close}>
                {face}
              </Link>
            );
          } else if (!isPinnable(section)) {
            tile = (
              <button type="button" className={cx(s.moreTile, s.moreTileFixed)} disabled aria-label={t('nav.notPinnable', { section: label })}>
                {face}
              </button>
            );
          } else {
            tile = (
              <button type="button" className={cx(s.moreTile, pinned && s.moreTileOn)} aria-pressed={pinned} onClick={() => toggle(section.id)}>
                {face}
              </button>
            );
          }
          return <li key={section.id}>{tile}</li>;
        })}
      </ul>
    </Sheet>
  );
}

export function TabBar(): JSX.Element {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const here = locate(pathname);
  const [pins, setPins] = usePins();
  const [moreOpen, setMoreOpen] = useState(false);
  // In a section that isn't pinned, More stands in for it.
  const moreCurrent = here !== undefined && !pins.includes(here.section.id);

  return (
    <>
      <nav className={s.tabbar} aria-label={t('nav.main')}>
        {SECTIONS.filter((section) => pins.includes(section.id)).map((section) => {
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
        <button
          type="button"
          className={cx(s.tab, s.tabButton, moreCurrent && s.tabActive)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={moreCurrent ? 'true' : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <span className={s.tabIcon}>
            <Ellipsis size={22} strokeWidth={2} aria-hidden />
          </span>
          <span className={s.tabLabel}>{t('nav.more')}</span>
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} pins={pins} onPins={setPins} />
    </>
  );
}
```

- [ ] **Step 4: Add the CSS**

Append the following to `src/app/Shell.module.css`, before the `/* --- desktop -- */` banner:

```css
/* The More tab is a <button>; it looks like the links beside it. */
.tabButton {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

/* ---------------------------------------------------------- more sheet -- */

.moreHead {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.moreStatus {
  min-height: 1.4em;
  margin: 0;
  color: var(--ink-2);
  font-size: 14px;
}

.moreGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.moreTile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 84px;
  padding: 12px 6px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--card);
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.moreTile svg {
  color: var(--ink-2);
}

.moreTileOn {
  border-color: var(--accent-soft);
  background: var(--accent-tint);
  color: var(--accent-ink);
}

.moreTileOn svg {
  color: var(--accent);
}

.moreTileFixed {
  border-style: dashed;
  color: var(--ink-3);
  cursor: default;
}

.morePin {
  position: absolute;
  top: 8px;
  inset-inline-end: 8px;
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/app src/i18n src/data/boundary.test.ts`
Expected: PASS. `boundary.test.ts` confirms that importing the preference helpers into `src/app/` is allowed.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/Nav.tsx src/app/Nav.test.tsx src/app/Shell.module.css
git commit -m "Nav: the phone bar holds pinned sections and More, which edits them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Page pills on phones

**Files:**
- Modify: `src/app/Nav.tsx`: add `PagePills`.
- Modify: `src/app/Shell.tsx`
- Modify: `src/app/Shell.module.css`
- Modify: `src/app/Nav.test.tsx`

**Interfaces:**
- Consumes: `locate` from Task 1, and the test helpers from Tasks 2 and 3.
- Produces: `export function PagePills(): JSX.Element | null`, used by `Shell.tsx`.

- [ ] **Step 1: Write the failing tests**

In `src/app/Nav.test.tsx`, change the import to `import { PagePills, Sidebar, TabBar } from './Nav';` and append:

```tsx
describe('the page pills', () => {
  it("show a section's pages, with the current one marked", async () => {
    const host = await render(<PagePills />, '/pantry');
    const pills = host.querySelector(`nav[aria-label="${i18n.t('nav.sectionPages', { section: i18n.t('nav.larder') })}"]`);
    expect([...(pills?.querySelectorAll('a') ?? [])].map((a) => a.textContent)).toEqual([
      i18n.t('nav.library'),
      i18n.t('nav.search'),
      i18n.t('nav.pantry'),
      i18n.t('nav.diet'),
    ]);
    expect(link(pills as HTMLElement, i18n.t('nav.pantry'))?.getAttribute('aria-current')).toBe('page');
  });

  it('stay away from sections with one page', async () => {
    for (const path of ['/', '/lists', '/family']) {
      const host = await render(<PagePills />, path);
      expect(host.querySelector('nav'), path).toBeNull();
      unmount?.();
      unmount = null;
    }
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/app/Nav.test.tsx`
Expected: FAIL, because there is no `PagePills` export.

- [ ] **Step 3: Write `PagePills`**

Add this to `src/app/Nav.tsx`, after `TabBar`:

```tsx
/** On phones, a section's pages as pills at the top of the page. The sidebar lists them on desktop. */
export function PagePills(): JSX.Element | null {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const here = locate(pathname);
  if (here === undefined || here.section.pages.length < 2) return null;
  return (
    <nav className={s.pills} aria-label={t('nav.sectionPages', { section: t(here.section.labelKey) })}>
      {here.section.pages.map((page) => {
        const active = here.page === page;
        return (
          <Link key={page.path} to={page.path} className={cx(s.pill, active && s.pillOn)} aria-current={active ? 'page' : undefined}>
            {t(page.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Render it in the shell**

In `src/app/Shell.tsx`, change the import to `import { PagePills, Sidebar, TabBar } from './Nav';`. Then make `<main>` read as follows:

```tsx
      <main className={s.main} id="main">
        {/* Where the tab bar shows, so do the pills; CSS hides them on desktop. */}
        {!noTabBar && <PagePills />}
        <ErrorBoundary resetKey={pathname}>
          <AppRoutes />
        </ErrorBoundary>
      </main>
```

- [ ] **Step 5: Add the CSS**

In `src/app/Shell.module.css`, add the following before the `/* --- desktop -- */` banner:

```css
/* -------------------------------------------------------------- pills -- */

.pills {
  display: flex;
  gap: 8px;
  margin: -8px -16px 16px;
  padding: 0 16px 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.pill {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--card);
  color: var(--ink-2);
  font-size: 14.5px;
  font-weight: 600;
  text-decoration: none;
}

.pillOn {
  border-color: var(--accent-soft);
  background: var(--accent-tint);
  color: var(--accent-ink);
}
```

Inside the existing `@media (min-width: 1024px)` block, next to `.tabbar { display: none; }`, add:

```css
  .pills {
    display: none;
  }
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run src/app src/i18n`
Expected: PASS.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/Nav.tsx src/app/Nav.test.tsx src/app/Shell.tsx src/app/Shell.module.css
git commit -m "Nav: a section's pages as pills on phones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Docs, the full suite and checking it in the browser

**Files:**
- Modify: `src/app/README.md`
- Modify: `CLAUDE.md` (the `src/app/` row in "Where things live")
- Modify: `README.md` (lines 8-9 and 113)
- Modify: `docs/ARCHITECTURE.md` (lines 74-75)
- Modify: `docs/LARDER.md` (line 57, the "Tab bar" bullet)

**Interfaces:**
- Consumes: everything above.
- Produces: docs only.

- [ ] **Step 1: Update `src/app/README.md`**

Make these changes:

- **Files table.** Replace the `Nav.tsx` row and add two rows:

  ```markdown
  | `sections.ts` | Every section and its pages (`SECTIONS`), `locate()` for which is lit, and the pin rules (`resolvePins()`, `togglePin()`). No React. |
  | `Nav.tsx` | `Sidebar`, `TabBar` with its More sheet, and `PagePills`, all drawn from `SECTIONS`; counts and the diet-rules link. |
  ```

  Change the `Shell.tsx` row to say that it also renders `PagePills` above the page wherever the tab bar shows.
- **"How it works".** Replace the `Nav.tsx counts…` bullet and the diet-rules bullet with:

  ```markdown
  - Sections (`sections.ts`): Board, Lists, Larder (Library, Search, Pantry, Diet) and Family. `locate()` lights a page by its path or an `also` prefix (`/recipe`, `/add` and `/import` are Library); URLs don't name sections.
  - Phone: the bar shows the pinned sections in list order, then More. More opens a `Sheet` of every section; Edit bar pins and unpins, at most `MAX_PINS` (4) and at least one, refused rather than swapped. Pins are a per-family device preference, `navPins`. More is lit in a section that isn't pinned.
  - A section with more than one page shows its pages as pills at the top of `<main>` on phones; desktop hides them, since the sidebar lists them.
  - Desktop: the sidebar lists every section; the one you're in opens to its pages, with counts. Sections that can't be pinned (Family) sit at the foot. The diet-rules link shows under Larder's pages while you're in the Larder.
  ```
- **"Rules & gotchas".** Replace the "six nav items" bullet with:

  ```markdown
  - Nav links are `<Link>` with `aria-current` set by hand: `NavLink` would also mark a section header as the current page. Pages get `"page"`; a phone tab or More gets `"true"`.
  - A route no page claims fails `sections.test.ts`.
  ```
- **New section "Adding a section"**, before "Rules & gotchas":

  ```markdown
  ## Adding a section
  1. Add its routes in `AppRoutes.tsx` (kitchen data? wrap in `page()`).
  2. Add an entry to `SECTIONS` in `sections.ts` and its id to `SectionId`; the first page is where it opens. Order matters: the first four pinnable sections are the default bar.
  3. Add its `nav.*` labels to `en.json` and `he.json`.
  4. For a count in the sidebar, add its page path to `useSectionCounts()` in `Nav.tsx`.
  5. Update the default-pins test in `sections.test.ts` if the first four changed.
  ```

- [ ] **Step 2: Update the other docs**

- **`CLAUDE.md`:** change the `src/app/` row to `| \`src/app/\` | Shell, sections (sidebar, tab bar with More, page pills), routes | [README](src/app/README.md) |`.
- **`README.md`, line 113:** change to `app/                       Shell, sections and navigation (sidebar, tab bar, More), routes.`
- **`README.md`, lines 8-9:** change "the kitchen sits beside it in the same sidebar (or tab bar on a phone)" to "the kitchen and the other sections sit beside it in the same sidebar (or tab bar on a phone)".
- **`docs/ARCHITECTURE.md`, line 75:** change to `Nav.tsx                  Sidebar, TabBar, More and page pills, from sections.ts.` Add a line under it: `sections.ts              Every section and its pages; which is lit; pin rules.`
- **`docs/LARDER.md`, line 57:** after the existing bullet, add one sentence: "Since 2026-10-04 the bar holds sections (four pinned, then More) and the Larder's pages are pills; see `src/app/README.md`."

- [ ] **Step 3: Run the full suite and the type check**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: PASS. If `.env.test` is present, this also runs the live Supabase suites. Those write to the production project (see memory: Supabase test users), and they're unrelated to this change. Run `npx vitest run src/app src/i18n src/data/boundary.test.ts src/features` instead if you want to avoid them, and report which you ran.

- [ ] **Step 4: Check it in the browser**

Start the demo dev server with the preview tool (`preview_start` with the dev-local/demo configuration in `.claude/launch.json`). Then check each of these, taking a screenshot of each:
1. **Phone, light mode.** At 375×812 on `/`, the bar shows Board, Lists, Larder and More. On `/library`, the pills show with Library current.
2. **More and Edit bar.** Open More, tap Edit bar and unpin Lists. Lists leaves the bar, the status reads "2 of 4 in the bar", and the Family tile is dashed. Reload: Lists is still unpinned. Pin it back.
3. **Recipe pages.** On `/recipe/<any id>`, there's no bar and there are no pills.
4. **Desktop.** At desktop width on `/pantry`, Larder is open with its four pages and counts. The diet card sits under them and Family is at the foot. On `/` Larder is closed and the diet card is gone. There are no pills.
5. **Dark mode and Hebrew.** Dark mode at both widths. Hebrew (Family page → language): the bar, the sheet and the pills mirror, and the labels are Hebrew.

Use `read_console_messages` to check there are no errors. Reset the viewport with `resize_window` preset `desktop` when done.

- [ ] **Step 5: Commit**

```bash
git add src/app/README.md CLAUDE.md README.md docs/ARCHITECTURE.md docs/LARDER.md
git commit -m "Docs: sections navigation, and how to add a section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Send the screenshots to the user. Don't push or merge without their go-ahead: a push to `main` deploys.
