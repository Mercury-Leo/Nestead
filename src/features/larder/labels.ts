import type { TFunction } from 'i18next';
import type { CustomDietRule, DietProfile, ListPart, PresetId, StoreSection, Unit } from '../../domain/types';
import { activePresets, customRuleHint, profileNouns } from '../../domain/kitchen/diet';
import type { DietCheck, DietIssue, DietThing } from '../../domain/kitchen/diet';
import { timerLabelText } from '../../domain/kitchen/durations';
import type { TimerLabel } from '../../domain/kitchen/durations';
import { GENERAL, SUPERMARKET, listQtyParts } from '../../domain/kitchen/list';
import { amountParts, formatClock } from '../../domain/kitchen/quantity';
import type { AmountParts } from '../../domain/kitchen/quantity';
import type { SortKey, TimeBucket } from '../../domain/kitchen/search';
import { formatList, isolateNumber, localizeDigits } from '../../i18n';

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

/* ------------------------------------------------------------ amounts -- */

/** "1½ tsp", "2–3 cloves", "12": the domain shapes the number, the translation file names the unit. */
export function wordAmount(t: TFunction, parts: AmountParts): string {
  const number = isolateNumber(localizeDigits(parts.number));
  if (parts.unit === null) return number;
  // English uses the singular up to 1 ("½ cup", "1 cup") and the plural above; a count under 1 is read as 1.
  const unit = t(`kitchen.unit.${parts.unit}`, { count: Math.max(1, parts.count) });
  return t('kitchen.amount', { number, unit });
}

export function formatAmountT(t: TFunction, qty: number | null, unit: Unit, qtyMax?: number): string {
  const parts = amountParts(qty, unit, qtyMax);
  return parts === null ? '' : wordAmount(t, parts);
}

/** A list row's total: "200 g", or "200 g + 1 cup" when units cannot be added up. */
export function formatListQtyT(t: TFunction, parts: readonly ListPart[]): string {
  return listQtyParts(parts)
    .map((part) => wordAmount(t, part))
    .join(' + ');
}

/* ------------------------------------------------------ time and timers -- */

/** "35 min", "1 h", "1 h 20 min"; compact drops the last " min" where space is short ("1 h 20"). */
export function formatMinutes(t: TFunction, minutes: number, compact = false): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return t('kitchen.duration.minutes', { minutes: rest });
  // Hours are the count, so a language can say "an hour" or "two hours" in a word.
  if (rest === 0) return t('kitchen.duration.hours', { count: hours });
  return t(compact ? 'kitchen.duration.hoursMinutesCompact' : 'kitchen.duration.hoursMinutes', { count: hours, minutes: rest });
}

/** "47:32" in the locale's digits. */
export function formatClockDigits(seconds: number): string {
  return localizeDigits(formatClock(seconds));
}

/**
 * A timer's name: Oven, Cook and Step N from the translation file; a verb is
 * the recipe's own word ("Sear"). Timers started before labelKind existed
 * only have their English label.
 */
export function timerLabel(t: TFunction, timer: { label: string; labelKind?: TimerLabel }): string {
  const kind = timer.labelKind;
  if (kind === undefined) return timer.label;
  if (kind.kind === 'oven') return t('kitchen.timer.oven');
  if (kind.kind === 'cook') return t('kitchen.timer.cook');
  if (kind.kind === 'step') return t('kitchen.timer.step', { step: kind.step });
  return timerLabelText(kind);
}

/* --------------------------------------------------------------- diet -- */

/** "peanuts", "tree nuts"; an item or a family rule keeps its own words. */
export function dietThingWord(t: TFunction, thing: DietThing): string {
  if (thing.kind === 'flag') return t(`kitchen.flag.${thing.flag}`);
  if (thing.kind === 'item') return thing.name;
  if (thing.kind === 'rule') return thing.subject;
  return thing.kind === 'carbs' ? t('kitchen.diet.carbs') : t('kitchen.diet.meatWithDairyThing');
}

export function dietIssueWords(t: TFunction, issue: DietIssue): string {
  if (issue.kind === 'contains') {
    return t('kitchen.diet.contains', { things: formatList(issue.things.map((thing) => dietThingWord(t, thing)), 'unit') });
  }
  if (issue.kind === 'meatWithDairy') return t('kitchen.diet.meatWithDairy');
  return t('kitchen.diet.netCarbs', { grams: issue.grams });
}

/** A warning badge: "Contains peanuts, sesame · Mixes meat and dairy". */
export function dietLabel(t: TFunction, check: DietCheck): string {
  return check.issues.map((issue) => dietIssueWords(t, issue)).join(' · ');
}

/** "No nuts, sesame or cilantro found", or that no rules are set. */
export function fitsProfileText(t: TFunction, profile: Pick<DietProfile, 'presets' | 'custom'> | null | undefined): string {
  const nouns = profileNouns(profile).map((noun) =>
    // profileNouns only returns presets that have a noun, which Low-carb does not.
    noun.kind === 'preset' ? t(`kitchen.preset.${noun.id as Exclude<PresetId, 'lowCarb'>}.noun`) : noun.subject,
  );
  if (nouns.length === 0) return t('kitchen.diet.noRules');
  return t('kitchen.diet.noneFound', { list: formatList(nouns, 'disjunction') });
}

/** A family rule's hint: "Also matches tahini and sesame oil", or "Matches “x”". */
export function ruleHintText(t: TFunction, rule: CustomDietRule): string {
  const hint = customRuleHint(rule);
  if (hint.kind === 'matches') return t('kitchen.diet.matches', { subject: hint.subject });
  return t('kitchen.diet.alsoMatches', { terms: formatList(hint.terms) });
}
