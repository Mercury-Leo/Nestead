import { describe, expect, it } from 'vitest';
import { SEED_LIBRARY } from '../seed/recipes';
import { emptyDraft, fromRecipe, toRecipe, validate } from './draft';

describe('recipe form model', () => {
  it('asks for a title, an ingredient and a step', () => {
    expect(validate(emptyDraft())).toEqual({
      title: 'Give the recipe a title.',
      ingredients: 'Add at least one ingredient.',
      steps: 'Add at least one step.',
    });
  });

  it('reads fractions, ranges and notes from the rows', () => {
    const draft = emptyDraft();
    draft.title = 'Weeknight Chickpea Curry';
    draft.ingredients = [
      { key: 'a', qty: '1 1/2', unit: 'tbsp', item: 'fresh ginger, grated' },
      { key: 'b', qty: '2-3', unit: 'clove', item: 'garlic' },
      { key: 'c', qty: '', unit: null, item: '' },
    ];
    draft.steps = [{ key: 's', text: 'Simmer for 15 min.' }];
    const recipe = toRecipe(draft);
    expect(recipe.ingredients).toEqual([
      { id: 'a', qty: 1.5, unit: 'tbsp', item: 'fresh ginger', note: 'grated', canonicalId: 'ginger' },
      { id: 'b', qty: 2, qtyMax: 3, unit: 'clove', item: 'garlic', canonicalId: 'garlic' },
    ]);
    expect(recipe.steps).toHaveLength(1);
    expect(recipe.source).toEqual({ kind: 'mine' });
  });

  it('round-trips a recipe through the form, keeping its source and stated calories', () => {
    const original = SEED_LIBRARY[1];
    if (original === undefined) throw new Error('no seed');
    const again = toRecipe(fromRecipe(original));
    expect(again.ingredients.map((line) => [line.qty, line.unit, line.item, line.canonicalId])).toEqual(
      original.ingredients.map((line) => [line.qty, line.unit, line.item, line.canonicalId]),
    );
    expect(again.steps.map((step) => step.text)).toEqual(original.steps.map((step) => step.text));
    expect(again.kcalPerServing).toBe(original.kcalPerServing);
    expect(again.source).toEqual(original.source);
  });

  it('estimates calories for a recipe of your own', () => {
    const draft = emptyDraft();
    draft.title = 'Rice';
    draft.ingredients = [{ key: 'a', qty: '300', unit: 'g', item: 'long-grain rice' }];
    draft.steps = [{ key: 's', text: 'Cook it.' }];
    const recipe = toRecipe(draft);
    expect(recipe.kcalEstimated).toBe(true);
    expect(recipe.kcalPerServing).toBe(270);
  });
});
