import { BookOpen, Clapperboard, CookingPot, History, LayoutGrid, Leaf, ListChecks, MapPin, Milk, Search, Settings, Ticket, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type en from '../i18n/locales/en.json';

/**
 * Every section of the app and its pages, in order. The sidebar, the tab bar,
 * the More sheet and the page pills all render from this list, so a new
 * section is one entry here plus its routes in AppRoutes.tsx
 * (sections.test.ts fails for a route no page claims).
 */

export type NavKey = `nav.${keyof (typeof en)['nav']}`;

export type SectionId = 'board' | 'lists' | 'larder' | 'activities' | 'family';

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
  {
    id: 'board',
    labelKey: 'nav.board',
    icon: LayoutGrid,
    pages: [
      { path: '/', labelKey: 'nav.board', icon: LayoutGrid, end: true },
      { path: '/history', labelKey: 'nav.history', icon: History },
    ],
  },
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
  // Things the family does together; Shows is its first page.
  { id: 'activities', labelKey: 'nav.activities', icon: Ticket, pages: [{ path: '/shows', labelKey: 'nav.shows', icon: Clapperboard }] },
  {
    id: 'family',
    labelKey: 'nav.family',
    icon: Users,
    pages: [
      // The section is Family; its first page holds the family's settings.
      { path: '/family', labelKey: 'nav.settings', icon: Settings },
      { path: '/addresses', labelKey: 'nav.addresses', icon: MapPin },
    ],
    pinnable: false,
  },
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
