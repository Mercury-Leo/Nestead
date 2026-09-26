import { afterEach, describe, expect, it } from 'vitest';
import type { AnyRecipe, CustomDietRule, DietProfile, ListPart, PresetId, Unit } from '../../domain/types';
import { PRESETS, checkDiet, fitsProfileLine, parseCustomRule } from '../../domain/kitchen/diet';
import { detectDurations } from '../../domain/kitchen/durations';
import { formatListQty } from '../../domain/kitchen/list';
import { formatAmount, formatClock, formatDuration, scaleQty } from '../../domain/kitchen/quantity';
import { i18n } from '../../i18n';
import { UNITS } from './add/draft';
import { SEED_CUSTOM_RULES, SEED_PRESETS } from './seed/kitchen';
import { SEED_LIBRARY } from './seed/recipes';
import { WEB_INDEX } from './seed/webIndex';
import {
  dietLabel,
  dietThingWord,
  fitsProfileText,
  formatAmountT,
  formatClockDigits,
  formatListQtyT,
  formatMinutes,
  ruleHintText,
  timerLabel,
} from './labels';

/**
 * In English, the screens' wording from the translation file must read
 * exactly as the domain's own English: these run both over the seed kitchen
 * and a spread of amounts, times and profiles.
 */

const t = i18n.t;
const RECIPES: readonly AnyRecipe[] = [...SEED_LIBRARY, ...WEB_INDEX];
const QTYS = [0.1, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2, 2.5, 3, 4, 9.6, 10, 12.2, 125, 137.5, 250, 1000, 1250];

const RULES: CustomDietRule[] = [
  ...SEED_CUSTOM_RULES,
  ...['no mushrooms', 'Sesame allergy', 'avoid peanuts', 'no cilantro', 'gluten-free', 'no zzqx', 'Shellfish intolerance']
    .map(parseCustomRule)
    .filter((rule): rule is CustomDietRule => rule !== null),
];

const PROFILES: Pick<DietProfile, 'presets' | 'custom'>[] = [
  { presets: {}, custom: [] },
  { presets: SEED_PRESETS, custom: [...SEED_CUSTOM_RULES] },
  { presets: Object.fromEntries(PRESETS.map((preset) => [preset.id, true])) as Record<PresetId, boolean>, custom: RULES },
  ...PRESETS.map((preset) => ({ presets: { [preset.id]: true }, custom: [] })),
  ...RULES.map((rule) => ({ presets: {}, custom: [rule] })),
];

describe('English wording matches the domain', () => {
  it('amounts, every unit, with ranges', () => {
    const units: Unit[] = [null, ...UNITS];
    for (const unit of units) {
      for (const qty of QTYS) {
        expect(formatAmountT(t, qty, unit)).toBe(formatAmount(qty, unit));
        expect(formatAmountT(t, qty, unit, qty * 2)).toBe(formatAmount(qty, unit, qty * 2));
      }
    }
    expect(formatAmountT(t, null, 'cup')).toBe('');
  });

  it('scaled ingredient amounts in every seed recipe', () => {
    for (const recipe of RECIPES) {
      for (const line of recipe.ingredients) {
        for (const factor of [0.5, 1, 1.5, 3]) {
          const qtyMax = line.qtyMax === undefined ? undefined : (scaleQty(line.qtyMax, factor) ?? undefined);
          expect(formatAmountT(t, scaleQty(line.qty, factor), line.unit, qtyMax)).toBe(formatAmount(scaleQty(line.qty, factor), line.unit, qtyMax));
        }
      }
    }
  });

  it('list totals, including units that cannot be added up', () => {
    const sets: ListPart[][] = RECIPES.flatMap((recipe) =>
      recipe.ingredients.map((line) => [{ recipeId: recipe.id, recipeTitle: recipe.title, qty: line.qty, unit: line.unit }]),
    );
    const part = (qty: number | null, unit: Unit): ListPart => ({ recipeId: 'r', recipeTitle: 'R', qty, unit });
    sets.push(
      [part(200, 'g'), part(1, 'kg')],
      [part(500, 'ml'), part(1, 'l'), part(1, 'cup')],
      [part(2, 'tbsp'), part(1, 'tsp'), part(1, 'cup')],
      [part(200, 'g'), part(1, 'cup'), part(2, 'clove'), part(null, null)],
      [part(3, null), part(1, 'bunch')],
    );
    for (const parts of sets) expect(formatListQtyT(t, parts)).toBe(formatListQty(parts));
  });

  it('durations, full and compact', () => {
    for (let minutes = 0; minutes <= 600; minutes += 1) {
      expect(formatMinutes(t, minutes)).toBe(formatDuration(minutes));
      if (minutes >= 60) expect(formatMinutes(t, minutes, true)).toBe(formatDuration(minutes).replace(' min', ''));
    }
    expect(formatMinutes(t, 12.4)).toBe(formatDuration(12.4));
  });

  it('clocks', () => {
    for (const seconds of [0, 5, 59.2, 60, 605, 2852, 3599, 3600, 7325]) expect(formatClockDigits(seconds)).toBe(formatClock(seconds));
  });

  it('timer labels for every step of every seed recipe', () => {
    let seen = 0;
    for (const recipe of RECIPES) {
      recipe.steps.forEach((step, i) => {
        for (const found of detectDurations(step.text, i + 1)) {
          seen += 1;
          expect(timerLabel(t, found)).toBe(found.label);
        }
      });
    }
    expect(seen).toBeGreaterThan(20);
    // A timer saved before labels were data keeps its English label.
    expect(timerLabel(t, { label: 'Oven' })).toBe('Oven');
  });

  it('diet warnings and the words behind them, for every recipe and profile', () => {
    let warnings = 0;
    for (const profile of PROFILES) {
      for (const recipe of RECIPES) {
        const check = checkDiet(recipe, profile);
        if (!check.ok) warnings += 1;
        expect(dietLabel(t, check)).toBe(check.label);
        expect(check.thingKeys.map((thing) => dietThingWord(t, thing))).toEqual(check.things);
      }
    }
    expect(warnings).toBeGreaterThan(20);
  });

  it('"No … found" for every profile', () => {
    for (const profile of PROFILES) expect(fitsProfileText(t, profile)).toBe(fitsProfileLine(profile));
  });

  it('rule hints, as written when the rule was made', () => {
    for (const rule of RULES) expect(ruleHintText(t, rule)).toBe(rule.hint);
  });
});

describe('in Hebrew', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('says one and two hours in a word', async () => {
    await i18n.changeLanguage('he');
    expect([60, 120, 180, 80, 140, 200].map((minutes) => formatMinutes(t, minutes))).toEqual([
      'שעה',
      'שעתיים',
      '3 שעות',
      'שעה ו-20 דק׳',
      'שעתיים ו-20 דק׳',
      '3 שעות ו-20 דק׳',
    ]);
    expect(formatMinutes(t, 80, true)).toBe('שעה ו-20');
  });

  it('keeps a shaped number left to right, so "1½" does not read "½1"', async () => {
    await i18n.changeLanguage('he');
    expect(formatAmountT(t, 1.5, 'tsp')).toBe('\u20661½\u2069 כפיות');
    expect(formatAmountT(t, 1, 'tbsp')).toBe('\u20661\u2069 כף');
    expect(formatAmountT(t, 2, 'cup')).toBe('\u20662\u2069 כוסות');
  });
});
