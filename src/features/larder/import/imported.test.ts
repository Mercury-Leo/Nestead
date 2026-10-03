// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRecipeHtml } from '../../../../server/import';
import type { ImportedRecipe } from '../../../../server/import';
import { applyFixes, fromImported, mostlyUnrecognised, suggestedTags, whatWeRead } from './imported';
import { i18n } from '../../../i18n';

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

describe('an imported recipe in another language', () => {
  // Arabic: the catalog has English and Hebrew names only.
  const arabic = fromImported({
    url: 'https://example.com/garlic-sauce',
    site: 'example.com',
    title: 'صلصة الثوم والكزبرة',
    ingredients: ['1 ربطة كزبرة', '5 فصوص ثوم', '1 كوب زيت زيتون', '50 غرام زبدة', '1 ملعقة صغيرة ملح'],
    steps: ['يطحن كل شيء معا.'],
    equipment: [],
  });
  // The same sauce as foody.co.il gives it: coriander, which a "no cilantro" rule should catch, and butter.
  const hebrew = fromImported({
    url: 'https://foody.co.il/foody_recipe/x/',
    site: 'foody.co.il',
    title: 'רוטב שום וכוסברה',
    ingredients: ['1 חבילה כוסברה', '5 שיני שום', '1 כוס שמן זית', '50 גרם חמאה', '1 כפית מלח דק'],
    steps: ['טוחנים הכול יחד.'],
    equipment: [],
  });

  it('is told apart when the catalog cannot read it', () => {
    expect(mostlyUnrecognised(arabic)).toBe(true);
    expect(mostlyUnrecognised(hebrew)).toBe(false);
    expect(mostlyUnrecognised(recipe)).toBe(false);
  });

  it('gets no diet tags when nothing in it was checked', () => {
    expect(suggestedTags(arabic).filter((tag) => tag.preselected)).toEqual([]);
  });

  it('gets the diet tags a Hebrew recipe earns, now that its lines are read', () => {
    const tags = suggestedTags(hebrew)
      .filter((tag) => tag.preselected)
      .map((tag) => tag.tag);
    expect(tags).toContain('Vegetarian');
    expect(tags).toContain('Gluten-free');
    expect(tags).not.toContain('Dairy-free');
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
    expect(shakshuka.ingredients.map((line) => line.canonicalId)).toEqual([
      'yellow-onion',
      'tomato',
      'red-bell-pepper',
      'garlic',
      'tomato-paste',
      'eggs',
      'red-chili',
      'paprika',
    ]);
  });
});

describe('a recipe read from pasted text', () => {
  const pasted: ImportedRecipe = {
    title: 'Lentil soup',
    ingredients: ['1 cup brown lentils', '1 onion'],
    steps: ['Simmer for 30 minutes.'],
    equipment: [],
  };

  it('has no page, so it is the family\'s own', () => {
    const recipe = fromImported(pasted);
    expect(recipe.id).toBe('import:text');
    expect(recipe.source).toEqual({ kind: 'mine' });
  });

  it('says it was read by AI only when it was', () => {
    const recipe = fromImported(pasted);
    const flag = i18n.t('import.read.byAi');
    expect(whatWeRead(recipe, { photo: false, servings: false, times: false }).map((line) => line.text)).not.toContain(flag);
    expect(whatWeRead(recipe, { photo: false, servings: false, times: false, ai: true })[0]).toEqual({ ok: false, text: flag });
  });

  it('matches a pasted Hebrew recipe\'s lines through the parser', () => {
    const recipe = fromImported({ title: 'מרק עדשים', ingredients: ['1 כוס עדשים', '1 בצל'], steps: [], equipment: [] });
    expect(recipe.ingredients.map((line) => line.canonicalId)).toEqual(['brown-lentils', 'yellow-onion']);
  });
});
