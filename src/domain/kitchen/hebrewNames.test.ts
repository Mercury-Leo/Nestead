import { describe, expect, it } from 'vitest';
import type { IngredientLine } from '../types';
import { estimateKcal } from './calories';
import { CATALOG } from './catalog';
import { checkDiet, parseCustomRule } from './diet';
import { HEBREW_NAMES } from './hebrewNames';
import { canonicalId, normalizeText } from './normalize';
import { parseIngredientLine } from './parse';

const lines = (raw: string[]): IngredientLine[] => raw.map(parseIngredientLine);

describe('HEBREW_NAMES', () => {
  it('names only items the catalog has', () => {
    const ids = new Set(CATALOG.map((item) => item.id));
    expect(Object.keys(HEBREW_NAMES).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('gives each name to one item', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const [id, names] of Object.entries(HEBREW_NAMES)) {
      for (const name of names) {
        const key = normalizeText(name);
        expect(key, name).not.toBe('');
        const other = owner.get(key);
        if (other !== undefined && other !== id) clashes.push(`${name}: ${other} and ${id}`);
        owner.set(key, id);
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe('Hebrew recipe lines', () => {
  // Lines as 10dakot, Foody, Walla, Mako and Lichtenstadt gave them, 2026-10-02.
  it.each([
    ['בצל גדול קצוץ', 'yellow-onion'],
    ['4 עגבניות בינוניות חתוכות לקוביות (רצוי להשתמש בעגבניות רכות)', 'tomato'],
    ['1/2 גמבה חתוכה לקוביות', 'red-bell-pepper'],
    ['3-4 שיני שום כתושות', 'garlic'],
    ['כף רסק עגבניות', 'tomato-paste'],
    ['4 ביצים', 'eggs'],
    ['פלפל חריף קצוץ או כפית פפריקה חריפה', 'red-chili'],
    ['כפית גדושה פפריקה מתוקה, מלח, פלפל שחור לפי הטעם', 'paprika'],
    ['1 ק"ג שניצל עוף טרי פרוס דק', 'chicken-breast'],
    ['1 חבילה כוסברה', 'cilantro'],
    ["5 פלפלי צ'ילי ירוקים בינוניים", 'red-chili'],
    ['1 כוס שמן זית', 'olive-oil'],
    ['1 כפית מלח דק', 'salt'],
    ['5 גרגירי הל שלם', 'cardamom'],
    ['2 כוסות כרובית חתוכה לפרחים קטנים', 'cauliflower'],
    ['2 גזרים בינוניים חתוך לקוביות קטנות', 'carrot'],
    ['1 ק״ג קמח לבן (אפשר גם מלא)', 'all-purpose-flour'],
    ['20 גרם שמרים יבשים (2 כפות)', 'yeast'],
    ['6 שוקי עוף', 'chicken-thighs'],
    ['1/2 1 כוסות בורגול גס', 'bulgur'],
    ['2 קופסאות גרעיני תירס', 'sweet-corn'],
    ['חצי כוס פירורי לחם (50 גרם)', 'panko-breadcrumbs'],
    ['2-3 כפות משחת מיסו לבן או אדום', 'white-miso-paste'],
    ['רוטב סויה לתיבול', 'soy-sauce'],
    ['1 קילו בשר טחון', 'ground-beef'],
    ['2 בצלים קצוצים', 'yellow-onion'],
    ['2 כוסות ציר ירקות', 'vegetable-stock'],
  ])('%s', (raw, id) => {
    expect(parseIngredientLine(raw).canonicalId).toBe(id);
  });

  it('reads a Hebrew phrase from its first word, as Hebrew puts the noun first', () => {
    expect(canonicalId('ציר עוף')).toBe('chicken-stock');
    expect(canonicalId('חזה עוף')).toBe('chicken-breast');
    expect(canonicalId('עוף')).toBe('whole-chicken');
    expect(canonicalId('קורט אגוז מוסקט')).toBe('nutmeg');
    expect(canonicalId('100 גרם אגוזי מלך קצוצים')).toBe('walnuts');
    expect(canonicalId('אגוזי מקדמיה')).toBe('walnuts');
    // English is read from its last word, as before.
    expect(canonicalId('chicken stock')).toBe('chicken-stock');
    expect(canonicalId('2 cups flour')).toBe('all-purpose-flour');
  });

  it('reads niqqud, a geresh written either way, and the plant milks apart from milk', () => {
    expect(canonicalId('בָּצָל')).toBe('yellow-onion');
    expect(canonicalId('ג׳ינג׳ר טרי מגורר')).toBe('ginger');
    expect(canonicalId("ג'ינג'ר")).toBe('ginger');
    expect(canonicalId('כוס חלב שקדים')).toBe('almonds');
    expect(canonicalId('קמח אורז')).toBe('long-grain-rice');
  });
});

describe('a Hebrew recipe', () => {
  const sauce = lines(['1 חבילה כוסברה', '5 שיני שום', '1 כוס שמן זית', '50 גרם חמאה', '1 כפית מלח דק']);

  it('is checked against the diet', () => {
    expect(checkDiet({ ingredients: sauce, servings: 4 }, { presets: { dairyFree: true }, custom: [] }).ok).toBe(false);
    expect(checkDiet({ ingredients: sauce, servings: 4 }, { presets: { vegetarian: true }, custom: [] }).ok).toBe(true);
    const rule = parseCustomRule('No cilantro');
    if (rule === null) throw new Error('no rule');
    expect(checkDiet({ ingredients: sauce, servings: 4 }, { presets: {}, custom: [rule] }).ok).toBe(false);
    const nuts = lines(['100 גרם אגוזי מלך קצוצים', '2 כוסות קמח']);
    expect(checkDiet({ ingredients: nuts, servings: 4 }, { presets: { nutAllergy: true }, custom: [] }).ok).toBe(false);
  });

  it('gets a calorie estimate', () => {
    expect(estimateKcal({ ingredients: sauce, servings: 4 })).toBeGreaterThan(0);
  });
});
