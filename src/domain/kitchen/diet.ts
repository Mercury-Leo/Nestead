import type { AnyRecipe, CustomDietRule, DietFlag, DietProfile, IngredientLine, PresetId } from '../types';
import { netCarbsPerServing, catalogFor } from './calories';
import { CATALOG } from './catalog';
import { containsPhrase, exactCatalogId, normalizeText } from './normalize';
import { localId } from './parse';

/** The diet engine: preset rules, the family's own rules, and the checks. */

export interface Preset {
  id: PresetId;
  name: string;
  rule: string;
  group: 'style' | 'allergy' | 'religious';
  excludes: DietFlag[];
  /** Short word for "No nuts, sesame or cilantro found". */
  noun?: string;
}

export const PRESETS: readonly Preset[] = [
  { id: 'vegetarian', name: 'Vegetarian', rule: 'No meat or fish', group: 'style', excludes: ['meat', 'poultry', 'pork', 'fish', 'shellfish'], noun: 'meat' },
  { id: 'vegan', name: 'Vegan', rule: 'No animal products at all', group: 'style', excludes: ['animal'], noun: 'animal products' },
  { id: 'pescatarian', name: 'Pescatarian', rule: 'Fish and seafood, no other meat', group: 'style', excludes: ['meat', 'poultry', 'pork'], noun: 'meat' },
  { id: 'lowCarb', name: 'Low-carb', rule: 'About 20 g net carbs or less per serving', group: 'style', excludes: [] },
  { id: 'glutenFree', name: 'Gluten-free', rule: 'No wheat, barley or rye', group: 'allergy', excludes: ['gluten'], noun: 'gluten' },
  { id: 'dairyFree', name: 'Dairy-free', rule: 'No milk, butter, cheese or yogurt', group: 'allergy', excludes: ['dairy'], noun: 'dairy' },
  { id: 'nutAllergy', name: 'Nut allergy', rule: 'Peanuts and tree nuts, including nut oils', group: 'allergy', excludes: ['peanut', 'treeNut'], noun: 'nuts' },
  { id: 'eggAllergy', name: 'Egg allergy', rule: 'No eggs or egg-based sauces', group: 'allergy', excludes: ['egg'], noun: 'eggs' },
  { id: 'shellfishAllergy', name: 'Shellfish allergy', rule: 'No shrimp, crab, lobster or mussels', group: 'allergy', excludes: ['shellfish'], noun: 'shellfish' },
  { id: 'halal', name: 'Halal', rule: 'No pork or alcohol; halal meat only', group: 'religious', excludes: ['pork', 'alcohol'], noun: 'pork' },
  { id: 'kosher', name: 'Kosher', rule: 'No pork or shellfish; meat and dairy kept apart', group: 'religious', excludes: ['pork', 'shellfish'], noun: 'pork' },
];

const FLAG_WORD: Record<DietFlag, string> = {
  meat: 'meat',
  poultry: 'poultry',
  pork: 'pork',
  fish: 'fish',
  shellfish: 'shellfish',
  dairy: 'dairy',
  egg: 'eggs',
  gluten: 'gluten',
  peanut: 'peanuts',
  treeNut: 'tree nuts',
  sesame: 'sesame',
  alcohol: 'alcohol',
  animal: 'animal products',
};

/** Order reasons are listed in, so the same recipe always reads the same. */
const FLAG_ORDER: DietFlag[] = ['meat', 'poultry', 'pork', 'fish', 'shellfish', 'dairy', 'egg', 'gluten', 'peanut', 'treeNut', 'sesame', 'alcohol', 'animal'];

const ANIMAL_KINDS: DietFlag[] = ['meat', 'poultry', 'pork', 'fish', 'shellfish', 'dairy', 'egg'];

const LOW_CARB_LIMIT = 20;

export function activePresets(profile: Pick<DietProfile, 'presets'> | null | undefined): Preset[] {
  if (profile == null) return [];
  return PRESETS.filter((preset) => profile.presets[preset.id] === true);
}

/** The chips shown in the sidebar and on search: presets, then own rules. */
export function ruleLabels(profile: Pick<DietProfile, 'presets' | 'custom'> | null | undefined): string[] {
  if (profile == null) return [];
  return [...activePresets(profile).map((preset) => preset.name), ...profile.custom.map((rule) => rule.label)];
}

/* ------------------------------------------------------------ own rules -- */

function subjectOf(text: string): string {
  const cleaned = text.trim().replace(/^["“”']|["“”']$/g, '').trim().toLowerCase();
  const patterns = [/^no\s+(.+)$/, /^avoid\s+(.+)$/, /^(.+?)\s+allergy$/, /^(.+?)\s+intolerance$/, /^(.+?)[-\s]free$/];
  for (const pattern of patterns) {
    const match = pattern.exec(cleaned);
    if (match !== null) return (match[1] as string).trim();
  }
  return cleaned;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "no cilantro" -> terms cilantro, coriander leaves...; hint "Also matches
 * coriander leaves". "Sesame allergy" -> sesame, tahini, sesame oil, sesame
 * seeds; hint "Also matches tahini and sesame oil".
 */
export function parseCustomRule(text: string): CustomDietRule | null {
  const subject = subjectOf(text);
  if (subject === '') return null;
  const subjectKey = normalizeText(subject);

  const terms: string[] = [subject];
  const hints: string[] = [];
  const addTerm = (term: string): void => {
    if (!terms.some((existing) => normalizeText(existing) === normalizeText(term))) terms.push(term);
  };

  // The item the rule names, if the catalog has it: its aliases are the
  // other names for exactly the same thing.
  const exact = CATALOG.find(
    (item) => normalizeText(item.name) === subjectKey || item.aliases.some((alias) => normalizeText(alias) === subjectKey),
  );
  if (exact !== undefined) {
    const others = [exact.name, ...exact.aliases].filter((name) => normalizeText(name) !== subjectKey);
    others.forEach(addTerm);
    if (others[0] !== undefined) hints.push(others[0].toLowerCase());
  }

  // Things that contain it: alias-only matches first, since those are the
  // ones nobody would think of ("tahini" for sesame).
  const aliasOnly: string[] = [];
  const byName: string[] = [];
  for (const item of CATALOG) {
    if (item === exact) continue;
    if (containsPhrase(item.name, subject) || item.groups.some((group) => containsPhrase(group, subject))) {
      byName.push(item.name);
      item.aliases.forEach(addTerm);
    } else if (item.aliases.some((alias) => containsPhrase(alias, subject))) {
      aliasOnly.push(item.name);
    }
  }
  for (const name of [...aliasOnly, ...byName]) {
    addTerm(name);
    if (hints.length < 2) hints.push(name.toLowerCase());
  }

  const hint =
    hints.length === 0 ? `Matches “${subject}”` : `Also matches ${hints.slice(0, 2).join(' and ')}`;

  return { id: localId('r'), label: capitalise(text.trim().replace(/^["“”']|["“”']$/g, '')), terms, hint };
}

/** The word used in "Contains cilantro" and "No nuts, sesame or cilantro found". */
export function ruleSubject(rule: CustomDietRule): string {
  return rule.terms[0] ?? subjectOf(rule.label);
}

/**
 * A line breaks a rule when its catalog item is one the rule names. Text is
 * only searched for lines the catalog does not know, so "ground coriander"
 * (a known, different item) never trips "no cilantro" just because
 * "coriander" is one of cilantro's other names.
 */
function ruleMatchesLine(rule: CustomDietRule, line: IngredientLine): boolean {
  const ids = new Set(rule.terms.map(exactCatalogId).filter((id): id is string => id !== undefined));
  const item = catalogFor(line);
  if (item !== undefined) {
    if (ids.has(item.id)) return true;
    return [item.name, ...item.aliases].some((name) => containsPhrase(name, ruleSubject(rule)));
  }
  const texts = [line.item, line.raw ?? ''];
  return rule.terms.some((term) => texts.some((text) => containsPhrase(text, term)));
}

/* --------------------------------------------------------------- checks -- */

export interface DietCheck {
  ok: boolean;
  /** Human reasons: "Contains peanuts, sesame", "Mixes meat and dairy". */
  reasons: string[];
  /** The short words behind them: "peanuts", "sesame". */
  things: string[];
  /** reasons joined, for a badge. */
  label: string;
}

const OK: DietCheck = { ok: true, reasons: [], things: [], label: '' };

export function lineFlags(line: IngredientLine): DietFlag[] {
  return catalogFor(line)?.flags ?? [];
}

export function checkDiet(recipe: Pick<AnyRecipe, 'ingredients' | 'servings'>, profile: Pick<DietProfile, 'presets' | 'custom'> | null | undefined): DietCheck {
  if (profile == null) return OK;
  const presets = activePresets(profile);
  if (presets.length === 0 && profile.custom.length === 0) return OK;

  const present = new Set<DietFlag>();
  const animalOnly: string[] = [];
  for (const line of recipe.ingredients) {
    const flags = lineFlags(line);
    flags.forEach((flag) => present.add(flag));
    if (flags.length === 1 && flags[0] === 'animal') animalOnly.push(line.item.toLowerCase());
  }

  const excluded = new Set<DietFlag>(presets.flatMap((preset) => preset.excludes));
  const things: string[] = [];
  const extra: string[] = [];

  const vegan = excluded.has('animal');
  for (const flag of FLAG_ORDER) {
    if (flag === 'animal' || !present.has(flag)) continue;
    if (excluded.has(flag) || (vegan && ANIMAL_KINDS.includes(flag))) things.push(FLAG_WORD[flag]);
  }
  // Honey, gelatin: animal, but none of the specific kinds. Name the thing.
  if (vegan && present.has('animal') && !ANIMAL_KINDS.some((flag) => present.has(flag))) {
    things.push(...(animalOnly.length > 0 ? animalOnly : ['animal products']));
  }

  for (const rule of profile.custom) {
    const hit = recipe.ingredients.some((line) => ruleMatchesLine(rule, line));
    if (hit) {
      const subject = ruleSubject(rule);
      if (!things.includes(subject)) things.push(subject);
    }
  }

  if (profile.presets.kosher === true && (present.has('meat') || present.has('poultry')) && present.has('dairy')) {
    extra.push('Mixes meat and dairy');
  }

  if (profile.presets.lowCarb === true) {
    const carbs = netCarbsPerServing(recipe);
    if (carbs !== null && carbs > LOW_CARB_LIMIT) {
      extra.push(`About ${Math.round(carbs)} g net carbs per serving`);
      things.push('carbs');
    }
  }

  const containsThings = things.filter((thing) => thing !== 'carbs');
  const reasons = [...(containsThings.length > 0 ? [`Contains ${containsThings.join(', ')}`] : []), ...extra];
  if (reasons.length === 0) return OK;
  if (extra.includes('Mixes meat and dairy')) things.push('meat with dairy');
  return { ok: false, reasons, things, label: reasons.join(' · ') };
}

/** "No nuts, sesame or cilantro found". */
export function fitsProfileLine(profile: Pick<DietProfile, 'presets' | 'custom'> | null | undefined): string {
  const nouns: string[] = [];
  for (const preset of activePresets(profile)) {
    if (preset.noun !== undefined && !nouns.includes(preset.noun)) nouns.push(preset.noun);
  }
  for (const rule of profile?.custom ?? []) {
    const subject = ruleSubject(rule);
    if (!nouns.includes(subject)) nouns.push(subject);
  }
  if (nouns.length === 0) return 'No diet rules are set';
  const list = nouns.length === 1 ? nouns[0] : `${nouns.slice(0, -1).join(', ')} or ${nouns[nouns.length - 1]}`;
  return `No ${list} found`;
}

/** Diet tags a recipe qualifies for, for "Suggested tags" on import. */
export function dietTags(recipe: Pick<AnyRecipe, 'ingredients' | 'servings'>): string[] {
  const flags = new Set(recipe.ingredients.flatMap(lineFlags));
  const tags: string[] = [];
  const meat = flags.has('meat') || flags.has('poultry') || flags.has('pork');
  const seafood = flags.has('fish') || flags.has('shellfish');
  if (!flags.has('animal')) tags.push('Vegan');
  else if (!meat && !seafood) tags.push('Vegetarian');
  else if (!meat) tags.push('Pescatarian');
  if (!flags.has('gluten')) tags.push('Gluten-free');
  if (!flags.has('dairy')) tags.push('Dairy-free');
  return tags;
}
