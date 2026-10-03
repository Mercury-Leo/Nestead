import { describe, expect, it } from 'vitest';
import { isIngredientHeading, parseIngredientBlock, parseIngredientLine } from './parse';

/** The parsed fields worth comparing, without the line's random id. */
function read(raw: string) {
  const { qty, qtyMax, unit, item, note, needsFix, canonicalId } = parseIngredientLine(raw);
  return { qty, qtyMax, unit, item, note, needsFix, canonicalId };
}

describe('parseIngredientLine in Hebrew', () => {
  it('reads a number and a unit', () => {
    expect(read('2 כוסות קמח')).toMatchObject({ qty: 2, unit: 'cup', item: 'קמח' });
    expect(read('20 גרם שמרים יבשים (2 כפות)')).toMatchObject({ qty: 20, unit: 'g', item: 'שמרים יבשים', note: '2 כפות' });
    expect(read('1 ק"ג קמח לבן')).toMatchObject({ qty: 1, unit: 'kg', item: 'קמח לבן' });
    expect(read('1 ק״ג שניצל עוף טרי')).toMatchObject({ qty: 1, unit: 'kg', item: 'שניצל עוף טרי' });
    expect(read('200 מ"ל חלב')).toMatchObject({ qty: 200, unit: 'ml', item: 'חלב' });
    expect(read('3-4 שיני שום כתושות')).toMatchObject({ qty: 3, qtyMax: 4, unit: 'clove', item: 'שום כתושות' });
    expect(read('½ כוס פטרוזיליה קצוצה')).toMatchObject({ qty: 0.5, unit: 'cup', item: 'פטרוזיליה קצוצה' });
    expect(read('2 כוסות של קמח')).toMatchObject({ qty: 2, unit: 'cup', item: 'קמח' });
    expect(read('2 קופסאות גרעיני תירס')).toMatchObject({ qty: 2, unit: 'can', item: 'גרעיני תירס' });
  });

  it('takes a unit with no number as one, since Hebrew has no "a"', () => {
    expect(read('כף רסק עגבניות')).toMatchObject({ qty: 1, unit: 'tbsp', item: 'רסק עגבניות' });
    expect(read('קורט מלח')).toMatchObject({ qty: 1, unit: 'pinch', item: 'מלח' });
    expect(read('ליטר ציר דאשי')).toMatchObject({ qty: 1, unit: 'l', item: 'ציר דאשי' });
    expect(read('קופסת רסק עגבניות קטנה')).toMatchObject({ qty: 1, unit: 'can', item: 'רסק עגבניות קטנה' });
    expect(read('כפית גדושה פפריקה מתוקה, מלח, פלפל שחור לפי הטעם')).toMatchObject({
      qty: 1,
      unit: 'tsp',
      item: 'גדושה פפריקה מתוקה',
      note: 'מלח, פלפל שחור לפי הטעם',
    });
  });

  it('wants a number for a plural or a weight', () => {
    expect(read('כוסות קמח')).toMatchObject({ qty: null, unit: null, needsFix: true });
    expect(read('גרם סוכר')).toMatchObject({ qty: null, unit: null, needsFix: true });
  });

  it('reads number words before the noun, and "one" after it', () => {
    expect(read('חצי כוס סוכר')).toMatchObject({ qty: 0.5, unit: 'cup', item: 'סוכר' });
    expect(read('שתי כפות שמן זית')).toMatchObject({ qty: 2, unit: 'tbsp', item: 'שמן זית' });
    expect(read('שלושת רבעי כוס חלב')).toMatchObject({ qty: 0.75, unit: 'cup', item: 'חלב' });
    expect(read('חצי לימון')).toMatchObject({ qty: 0.5, unit: null, item: 'לימון' });
    expect(read('ביצה אחת')).toMatchObject({ qty: 1, unit: null, item: 'ביצה' });
    expect(read('בצל גדול אחד, קצוץ')).toMatchObject({ qty: 1, item: 'בצל גדול', note: 'קצוץ' });
  });

  it('adds "and a half", and reads a mixed number typed right to left', () => {
    expect(read('כוס וחצי סוכר')).toMatchObject({ qty: 1.5, unit: 'cup', item: 'סוכר' });
    expect(read('2 כוסות וחצי קמח')).toMatchObject({ qty: 2.5, unit: 'cup', item: 'קמח' });
    expect(read('1/2 1 כוסות בורגול גס')).toMatchObject({ qty: 1.5, unit: 'cup', item: 'בורגול גס' });
  });

  it('leaves a line with no amount for a fix, as in English', () => {
    expect(read('בצל גדול קצוץ')).toMatchObject({ qty: null, unit: null, needsFix: true, item: 'בצל גדול קצוץ' });
    expect(read('פלפל חריף קצוץ או כפית פפריקה חריפה')).toMatchObject({ qty: null, needsFix: true });
    // A cup and a spoon is past one amount.
    expect(read('כוס ועוד כף קמח (150 גרם)')).toMatchObject({ qty: null, needsFix: true });
    // Not "כוס": the unit is a whole word.
    expect(read('כוסברה קצוצה')).toMatchObject({ qty: null, unit: null, item: 'כוסברה קצוצה' });
  });

  it('matches catalog items through their Hebrew names (hebrewNames.ts)', () => {
    expect(read('2 כוסות קמח').canonicalId).toBe('all-purpose-flour');
  });

  it('reads English as it did', () => {
    expect(read('2 cups flour')).toMatchObject({ qty: 2, unit: 'cup', item: 'flour', canonicalId: 'all-purpose-flour' });
    expect(read('a pinch of salt')).toMatchObject({ qty: 1, unit: 'pinch', item: 'salt' });
    expect(read('1 1/2 cups milk')).toMatchObject({ qty: 1.5, unit: 'cup', item: 'milk' });
  });
});

describe('isIngredientHeading', () => {
  it('knows a heading in either language', () => {
    for (const line of ['Ingredients', 'For the sauce:', 'מצרכים', 'תיבול:', 'תיבול', 'לרוטב', 'להגשה:', 'לשקשוקה חריפה (לא חובה):']) {
      expect(isIngredientHeading(line)).toBe(true);
    }
    for (const line of ['2 cups flour', 'Salt, to taste', 'For 4 servings:', 'כוס קמח', '1 כף סוכר:']) {
      expect(isIngredientHeading(line)).toBe(false);
    }
  });

  it('is skipped in a pasted block', () => {
    expect(parseIngredientBlock('תיבול:\nקורט מלח\nFor the sauce:\n2 tbsp butter').map((line) => line.item)).toEqual(['מלח', 'butter']);
  });
});
