// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRecipeHtml } from '../../../../server/import';
import { applyFixes, fromImported, mostlyUnrecognised, suggestedTags, whatWeRead } from './imported';

const html = readFileSync(new URL('../../../../tests/fixtures/gnocchi.html', import.meta.url), 'utf8');
const parsed = parseRecipeHtml(html, 'https://weeknightpan.co/recipes/crispy-skillet-gnocchi');
if (parsed === null) throw new Error('fixture did not parse');
const recipe = fromImported(parsed.recipe);

describe('imported gnocchi', () => {
  it('parses every line and flags the handful of basil', () => {
    expect(recipe.ingredients.map((line) => line.canonicalId)).toEqual([
      'potato-gnocchi',
      'cherry-tomato',
      'yellow-onion',
      'garlic',
      'olive-oil',
      'dried-oregano',
      'salt',
      'mozzarella',
      'basil',
    ]);
    expect(recipe.ingredients.filter((line) => line.needsFix).map((line) => line.raw)).toEqual(['a handful of basil leaves']);
    expect(recipe.source).toEqual({ kind: 'web', url: 'https://weeknightpan.co/recipes/crispy-skillet-gnocchi', site: 'weeknightpan.co' });
  });

  it('estimates the calories the page left out', () => {
    expect(recipe.kcalEstimated).toBe(true);
    expect(recipe.kcalPerServing).toBeGreaterThan(300);
    expect(recipe.kcalPerServing).toBeLessThan(600);
  });

  it('says what it read', () => {
    const lines = whatWeRead(recipe, { photo: true, servings: true, times: true });
    expect(lines.map((line) => [line.ok, line.text.replace(/~\d+/, '~N')])).toEqual([
      [true, '4 servings'],
      [true, 'Prep 10 min · cook 25 min'],
      [true, '9 ingredients'],
      [true, '2 tools'],
      [true, '5 steps'],
      [false, 'Calories estimated (~N kcal)'],
      [false, '1 ingredient needs a quantity'],
    ]);
  });

  it('suggests Vegetarian, Weeknight and One-pan', () => {
    expect(suggestedTags(recipe)).toEqual([
      { tag: 'Vegetarian', preselected: true },
      { tag: 'Weeknight', preselected: false },
      { tag: 'One-pan', preselected: false },
    ]);
  });

  it('takes a typed quantity for the flagged line', () => {
    const basil = recipe.ingredients[8];
    if (basil === undefined) throw new Error('no basil');
    const fixed = applyFixes(recipe, { [basil.id]: { qty: '1', unit: 'bunch' } }, ['Vegetarian']);
    expect(fixed.ingredients[8]).toMatchObject({ qty: 1, unit: 'bunch', item: 'basil leaves' });
    expect(fixed.ingredients[8]?.needsFix).toBeUndefined();
    expect(fixed.tags).toEqual(['Vegetarian']);
  });
});

describe('an imported recipe the catalog cannot read', () => {
  // As foody.co.il gives it: coriander, which a "no cilantro" rule should catch, and butter.
  const hebrew = fromImported({
    url: 'https://foody.co.il/foody_recipe/x/',
    site: 'foody.co.il',
    title: 'רוטב שום וכוסברה',
    ingredients: ['1 חבילה כוסברה', '5 שיני שום', '1 כוס שמן זית', '50 גרם חמאה', '1 כפית מלח דק'],
    steps: ['טוחנים הכול יחד.'],
    equipment: [],
  });

  it('is told apart from one it can', () => {
    expect(mostlyUnrecognised(hebrew)).toBe(true);
    expect(mostlyUnrecognised(recipe)).toBe(false);
  });

  it('gets no diet tags, since nothing in it was checked', () => {
    expect(suggestedTags(hebrew).filter((tag) => tag.preselected)).toEqual([]);
  });

  it('reads Hebrew amounts and leaves the headings out', () => {
    // 10dakot.co.il's shakshuka, as it imported on 2026-10-02: ten lines, two of them headings.
    const shakshuka = fromImported({
      url: 'https://www.10dakot.co.il/recipe/x/',
      site: '10dakot.co.il',
      title: 'מתכון לשקשוקה טעימה',
      ingredients: [
        'בצל גדול קצוץ',
        '4 עגבניות בינוניות חתוכות לקוביות (רצוי להשתמש בעגבניות רכות)',
        '1/2 גמבה חתוכה לקוביות',
        '3-4 שיני שום כתושות',
        'כף רסק עגבניות',
        '4 ביצים',
        'לשקשוקה חריפה (לא חובה):',
        'פלפל חריף קצוץ או כפית פפריקה חריפה',
        'תיבול:',
        'כפית גדושה פפריקה מתוקה, מלח, פלפל שחור לפי הטעם',
      ],
      steps: ['מבשלים.'],
      equipment: [],
    });
    expect(shakshuka.ingredients).toHaveLength(8);
    expect(shakshuka.ingredients.filter((line) => line.needsFix).map((line) => line.raw)).toEqual(['בצל גדול קצוץ', 'פלפל חריף קצוץ או כפית פפריקה חריפה']);
    expect(shakshuka.ingredients.map((line) => line.unit)).toEqual([null, null, null, 'clove', 'tbsp', null, null, 'tsp']);
  });
});
