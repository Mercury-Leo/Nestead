import type { TFunction } from 'i18next';
import type { DietProfile, PresetId, StoreSection } from '../../domain/types';
import { activePresets } from '../../domain/kitchen/diet';
import { GENERAL, SUPERMARKET } from '../../domain/kitchen/list';
import type { SortKey, TimeBucket } from '../../domain/kitchen/search';

/**
 * Words for the kitchen's fixed ids, from the translation file. The domain
 * keeps its English labels for its own use and tests; screens show these.
 */

const SECTION_KEYS = {
  Produce: 'produce',
  'Meat & fish': 'meatFish',
  'Dairy & eggs': 'dairyEggs',
  Bakery: 'bakery',
  'Grains & pasta': 'grainsPasta',
  'Cans & jars': 'cansJars',
  'International aisle': 'international',
  'Spices & dried herbs': 'spices',
  Baking: 'baking',
  Frozen: 'frozen',
  Drinks: 'drinks',
  Other: 'other',
} as const satisfies Record<StoreSection, string>;

/** A store section's name. A section this build does not know shows as stored. */
export function sectionLabel(t: TFunction, section: StoreSection): string {
  const key = (SECTION_KEYS as Partial<Record<string, (typeof SECTION_KEYS)[StoreSection]>>)[section];
  return key === undefined ? section : t(`kitchen.section.${key}`);
}

export function presetName(t: TFunction, id: PresetId): string {
  return t(`kitchen.preset.${id}.name`);
}

export function presetRule(t: TFunction, id: PresetId): string {
  return t(`kitchen.preset.${id}.rule`);
}

/** The chips shown in the sidebar and on search: presets, then the family's own rules as typed. */
export function ruleLabels(t: TFunction, profile: Pick<DietProfile, 'presets' | 'custom'> | null | undefined): string[] {
  if (profile == null) return [];
  return [...activePresets(profile).map((preset) => presetName(t, preset.id)), ...profile.custom.map((rule) => rule.label)];
}

export function sortLabel(t: TFunction, key: SortKey): string {
  return t(`kitchen.sort.${key}`);
}

export function sortShort(t: TFunction, key: SortKey): string {
  return t(`kitchen.sortShort.${key}`);
}

export function timeLabel(t: TFunction, bucket: TimeBucket): string {
  return t(`kitchen.time.${bucket}`);
}

/** The built-in list groups are named here; the family's own keep the name they were given. */
export function groupName(t: TFunction, group: { id: string; name: string }): string {
  if (group.id === SUPERMARKET) return t('kitchen.group.supermarket');
  if (group.id === GENERAL) return t('kitchen.group.general');
  return group.name;
}
