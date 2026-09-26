import type { StoreSection } from '../types';

/**
 * Store sections in the order you walk a supermarket.
 * i18n: the names are stored on rows; screens show them from the translation file (labels.ts sectionLabel).
 */
export const SECTION_ORDER: readonly StoreSection[] = [
  'Produce',
  'Meat & fish',
  'Dairy & eggs',
  'Bakery',
  'Grains & pasta',
  'Cans & jars',
  'International aisle',
  'Spices & dried herbs',
  'Baking',
  'Frozen',
  'Drinks',
  'Other',
];

/** Rows grouped by store section, in walking order, empty sections left out. */
export function groupBySection<T extends { section: StoreSection }>(items: readonly T[]): [StoreSection, T[]][] {
  return SECTION_ORDER.map((section) => [section, items.filter((item) => item.section === section)] as [StoreSection, T[]]).filter(
    ([, rows]) => rows.length > 0,
  );
}
