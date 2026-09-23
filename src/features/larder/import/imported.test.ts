// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRecipeHtml } from '../../../../server/import';
import { applyFixes, fromImported, suggestedTags, whatWeRead } from './imported';

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
      [true, 'Title, photo and 4 servings'],
      [true, 'Prep 10 min · cook 25 min'],
      [true, '9 ingredients, 2 pieces of equipment, 5 steps'],
      [false, 'Calories not listed — we’ll show an estimate (~N kcal)'],
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
