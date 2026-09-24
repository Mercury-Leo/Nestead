import { describe, expect, it } from 'vitest';
import type { DietProfile, ListItem, PantryItem } from '../../../domain/types';
import { checkDiet } from '../../../domain/kitchen/diet';
import { pantryFit, pantryIndex } from '../../../domain/kitchen/fit';
import {
  GENERAL,
  SUPERMARKET,
  groupOf,
  isGrocery,
  leftOffList,
  planAddOwn,
  planAddRecipe,
  planRemoveGroup,
  planRemoveRecipe,
  recipesOnList,
} from '../../../domain/kitchen/list';
import { formatAmount, scaleQty } from '../../../domain/kitchen/quantity';
import { defaultFilters, search, suggestions } from '../../../domain/kitchen/search';
import { DEFAULT_STAPLES, SEED_CUSTOM_RULES, SEED_HAVE, SEED_LIST, SEED_PRESETS, listRow, pantryRow } from './kitchen';
import { SEED_LIBRARY } from './recipes';
import { WEB_INDEX } from './webIndex';

/** The numbers the design shows, computed from the seed rather than typed in. */

const base = { id: '', familyId: 'f', createdAt: '', updatedAt: '' };

const pantryRows: PantryItem[] = [
  ...SEED_HAVE.map((name, i) => ({ ...base, id: `h${i}`, ...pantryRow(name, 'have') })),
  ...DEFAULT_STAPLES.map((name, i) => ({ ...base, id: `s${i}`, ...pantryRow(name, 'staple') })),
];
const pantry = pantryIndex(pantryRows);
const profile: Pick<DietProfile, 'presets' | 'custom'> = { presets: SEED_PRESETS, custom: [...SEED_CUSTOM_RULES] };

const byTitle = (title: string) => {
  const found = [...SEED_LIBRARY, ...WEB_INDEX].find((recipe) => recipe.title === title);
  if (found === undefined) throw new Error(`no recipe ${title}`);
  return found;
};

describe('seed pantry', () => {
  it('has 34 items and 8 staples, all recognised by the catalog', () => {
    expect(pantry.haveCount).toBe(34);
    expect(pantry.stapleCount).toBe(8);
    expect(pantryRows.filter((row) => row.canonicalId === undefined).map((row) => row.name)).toEqual([]);
  });
});

describe('library fit', () => {
  it.each([
    ['One-Pan Lemon Chicken & Rice', 11, 13, 2],
    ['Shakshuka with Feta', 9, 10, 1],
    ['Miso-Glazed Salmon & Bok Choy', 6, 9, 3],
    ['Sweet Potato & Black Bean Tacos', 7, 11, 4],
    ['Grandma’s Lentil Soup', 14, 14, 0],
    ['Peanut Noodle Stir-Fry', 8, 12, 4],
    ['Wild Mushroom Risotto', 7, 10, 3],
    ['Brown-Butter Banana Bread', 9, 9, 0],
    ['Lemon-Oregano Chicken Skewers', 10, 12, 2],
    ['Avgolemono (Lemon Chicken Soup)', 9, 10, 1],
    ['Ginger Chicken Congee', 7, 9, 2],
    ['Chicken & Chorizo Paella', 9, 14, 5],
    ['Chicken & Rice Stuffed Peppers', 7, 12, 5],
    ['Crispy Skillet Gnocchi with Cherry Tomatoes', 6, 9, 3],
  ])('%s: you have %d/%d, %d to buy', (title, has, total, missing) => {
    const fit = pantryFit(byTitle(title), pantry);
    expect(fit.have + fit.staple).toBe(has);
    expect(fit.total).toBe(total);
    expect(fit.missing).toBe(missing);
  });

  it('One-Pan: have 8, staple 3, to buy 2', () => {
    const fit = pantryFit(byTitle('One-Pan Lemon Chicken & Rice'), pantry);
    expect([fit.have, fit.staple, fit.missing]).toEqual([8, 3, 2]);
    expect(fit.missingLines.map((line) => line.item)).toEqual(['fresh dill', 'Greek yogurt']);
  });

  it('every recipe has at least one timed step and every line parses', () => {
    for (const recipe of [...SEED_LIBRARY, ...WEB_INDEX]) {
      expect(recipe.steps.length).toBeGreaterThanOrEqual(3);
      const unknown = recipe.ingredients.filter((line) => line.canonicalId === undefined).map((line) => line.raw);
      expect(unknown, recipe.title).toEqual([]);
    }
  });
});

describe('diet on the seed', () => {
  it('flags the two library recipes that conflict', () => {
    const conflicts = SEED_LIBRARY.map((recipe) => [recipe.title, checkDiet(recipe, profile).label]).filter(([, label]) => label !== '');
    expect(conflicts).toEqual([
      ['Sweet Potato & Black Bean Tacos', 'Contains cilantro'],
      ['Peanut Noodle Stir-Fry', 'Contains peanuts, sesame'],
    ]);
  });

  it('halal flags the paella and the risotto', () => {
    const halal = { presets: { ...SEED_PRESETS, halal: true }, custom: [] };
    expect(checkDiet(byTitle('Chicken & Chorizo Paella'), halal).reasons).toEqual(['Contains pork']);
    expect(checkDiet(byTitle('Wild Mushroom Risotto'), halal).reasons).toEqual(['Contains alcohol']);
  });
});

describe('search on the seed', () => {
  const ctx = { library: SEED_LIBRARY, web: WEB_INDEX, pantry, profile };

  it('chicken, lemon, rice from the pantry', () => {
    const outcome = search(
      { mode: 'ingredients', tokens: ['chicken', 'lemon', 'rice'], text: '', pantry: true },
      defaultFilters('hide'),
      ctx,
    );
    expect(outcome.results.map((hit) => hit.recipe.title)).toEqual([
      'Avgolemono (Lemon Chicken Soup)',
      'One-Pan Lemon Chicken & Rice',
      'Lemon-Oregano Chicken Skewers',
      'Ginger Chicken Congee',
      'Chicken & Chorizo Paella',
      'Chicken & Rice Stuffed Peppers',
    ]);
    expect(outcome.hidden.map((hit) => [hit.recipe.title, hit.diet.things])).toEqual([
      ['Sesame Chicken Rice Bowls', ['sesame']],
      ['Lemongrass Chicken with Jasmine Rice', ['cilantro']],
    ]);
  });

  it('"Show anyway" shows them with warnings', () => {
    const outcome = search(
      { mode: 'ingredients', tokens: ['chicken', 'lemon', 'rice'], text: '', pantry: true },
      defaultFilters('warn'),
      ctx,
    );
    expect(outcome.results).toHaveLength(8);
    expect(outcome.hidden).toHaveLength(0);
    expect(outcome.results.filter((hit) => !hit.diet.ok)).toHaveLength(2);
  });

  it('with no query, pantry mode ranks everything', () => {
    const outcome = search({ mode: 'ingredients', tokens: [], text: '', pantry: true }, defaultFilters('hide'), ctx);
    expect(outcome.results[0]?.fit.ratio).toBe(1);
    expect(outcome.results.length + outcome.hidden.length).toBe(SEED_LIBRARY.length + WEB_INDEX.length);
  });

  it('suggests loosening filters, with counts', () => {
    // Lentil soup needs nothing but takes 70 minutes.
    const filters = { ...defaultFilters('hide'), maxBuy: 0, time: ['under30' as const] };
    const query = { mode: 'ingredients' as const, tokens: ['lentils'], text: '', pantry: true };
    expect(search(query, filters, ctx).results).toHaveLength(0);
    expect(suggestions(query, filters, ctx).map((s) => [s.label, s.count])).toEqual([['Remove “Under 30 min”', 1]]);
  });
});

describe('detail scaling', () => {
  it('4 -> 6 servings', () => {
    const recipe = byTitle('One-Pan Lemon Chicken & Rice');
    const [thighs, rice] = recipe.ingredients;
    expect(formatAmount(scaleQty(rice?.qty ?? null, 6 / 4), 'g')).toBe('450 g');
    expect(formatAmount(scaleQty(thighs?.qty ?? null, 6 / 4), null)).toBe('12');
  });
});

describe('shopping list on the seed', () => {
  const idFor = (slug: string) => SEED_LIBRARY.find((recipe) => recipe.id === slug)?.id ?? slug;
  const items: ListItem[] = SEED_LIST.map((spec, i) => ({ ...base, id: `l${i}`, ...listRow(spec, idFor(spec.recipeId)) }));

  it('lists 3 recipes and leaves 18 things off (15 pantry, 3 staples)', () => {
    const recipes = recipesOnList(items);
    expect(recipes.map((r) => [r.title, r.count])).toEqual([
      ['One-Pan Lemon Chicken & Rice', 2],
      ['Miso-Glazed Salmon & Bok Choy', 3],
      ['Shakshuka with Feta', 1],
    ]);
    const leftOff = leftOffList(
      recipes.map((r) => SEED_LIBRARY.find((recipe) => recipe.id === r.recipeId)).filter((r) => r !== undefined),
      pantry,
    );
    expect(leftOff.pantry).toHaveLength(15);
    expect(leftOff.staples).toHaveLength(3);
  });

  it('adding a recipe again replaces its share instead of doubling it', () => {
    const recipe = byTitle('One-Pan Lemon Chicken & Rice');
    const plan = planAddRecipe(items, recipe, 6, pantry);
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
    const dill = plan.update.find((u) => u.id === 'l0');
    expect(dill?.patch.parts).toEqual([
      { recipeId: recipe.id, recipeTitle: recipe.title, qty: 1.5, unit: 'bunch' },
    ]);
  });

  it('merges the same ingredient across recipes', () => {
    const peanut = byTitle('Peanut Noodle Stir-Fry');
    const plan = planAddRecipe(items, peanut, 3, pantry);
    const scallions = plan.update.find((u) => u.id === 'l3');
    expect(scallions?.patch.parts?.map((p) => p.recipeTitle)).toEqual(['Miso-Glazed Salmon & Bok Choy', 'Peanut Noodle Stir-Fry']);
    expect(plan.create.map((row) => row.name)).toEqual(['Peanut butter', 'Sesame oil', 'Red bell pepper']);
  });
});

describe('shopping list groups and things added by hand', () => {
  const own = (name: string, groupId: string, extra: Partial<ListItem> = {}): ListItem => {
    const [row] = planAddOwn([], [name], groupId).create;
    if (row === undefined) throw new Error(`nothing planned for ${name}`);
    return { ...base, id: `own-${name}`, ...row, ...extra };
  };

  it('puts recipe groceries in Supermarket, and reads older rows as Supermarket too', () => {
    const recipe = byTitle('Peanut Noodle Stir-Fry');
    const plan = planAddRecipe([], recipe, recipe.servings, pantry);
    expect(plan.create.every((row) => row.groupId === SUPERMARKET)).toBe(true);
    expect(groupOf({})).toBe(SUPERMARKET);
  });

  it('adds by hand into a group, sorting Supermarket items into their aisle', () => {
    const plan = planAddOwn([], ['milk', 'Bin bags', 'milk'], SUPERMARKET);
    expect(plan.create.map((row) => [row.name, row.section, row.manual, row.parts])).toEqual([
      ['Milk', 'Dairy & eggs', true, []],
      ['Bin bags', 'Other', true, []],
    ]);
  });

  it('only takes an exact catalog name for food outside Supermarket', () => {
    const [cups] = planAddOwn([], ['Egg cups'], GENERAL).create;
    const [eggs] = planAddOwn([], ['Eggs'], GENERAL).create;
    expect(cups?.canonicalId).toBeUndefined();
    expect(eggs?.canonicalId).toBe('eggs');
  });

  it('unticks rather than duplicates something already in that group', () => {
    const batteries = own('AA batteries', GENERAL, { checked: true });
    const plan = planAddOwn([batteries], ['aa batteries'], GENERAL);
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([{ id: batteries.id, patch: { checked: false, manual: true } }]);
    expect(planAddOwn([batteries], ['AA batteries'], 'chemist').create).toHaveLength(1);
  });

  it('keeps something added by hand when the recipe that also needed it comes off', () => {
    const recipe = byTitle('Shakshuka with Feta');
    const feta = own('Feta', SUPERMARKET);
    const added = planAddRecipe([feta], recipe, recipe.servings, pantry);
    const merged = added.update.find((u) => u.id === feta.id);
    expect(merged?.patch.parts?.map((part) => part.recipeTitle)).toEqual(['Shakshuka with Feta']);
    expect(added.create.map((row) => row.name)).not.toContain('Feta');

    const withParts: ListItem = { ...feta, parts: merged?.patch.parts ?? [] };
    const removed = planRemoveRecipe([withParts], recipe.id);
    expect(removed.remove).toEqual([]);
    expect(removed.update).toEqual([{ id: feta.id, patch: { parts: [] } }]);
  });

  it('moves a deleted group’s items to General', () => {
    const plasters = own('Plasters', 'chemist');
    const bags = own('Bin bags', GENERAL);
    expect(planRemoveGroup([plasters, bags], 'chemist').update).toEqual([{ id: plasters.id, patch: { groupId: GENERAL } }]);
  });

  it('sends groceries to the pantry, not batteries', () => {
    expect(isGrocery(own('Coffee pods', SUPERMARKET))).toBe(true);
    expect(isGrocery(own('Eggs', 'farm-shop'))).toBe(true);
    expect(isGrocery(own('AA batteries', GENERAL))).toBe(false);
  });
});
