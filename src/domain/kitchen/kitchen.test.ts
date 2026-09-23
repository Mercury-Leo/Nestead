import { describe, expect, it } from 'vitest';
import type { AnyRecipe, IngredientLine } from '../types';
import { estimateKcal } from './calories';
import { checkDiet, dietTags, fitsProfileLine, parseCustomRule } from './diet';
import { detectDurations } from './durations';
import { formatListQty } from './list';
import { canonicalId, singularize } from './normalize';
import { parseIngredientLine, parseNumber } from './parse';
import { formatAmount, formatClock, formatDuration, formatNumber, formatQty, scaleQty } from './quantity';
import { lineMatchesToken, tokensNeeded } from './search';

function line(raw: string): IngredientLine {
  return parseIngredientLine(raw);
}

function recipeOf(lines: string[], servings = 4): AnyRecipe {
  return {
    id: 'r',
    title: 'Test',
    source: { kind: 'mine' },
    servings,
    prepMin: 0,
    cookMin: 0,
    ingredients: lines.map(line),
    equipment: [],
    steps: [],
    tags: [],
    kcalEstimated: false,
  };
}

describe('parseNumber', () => {
  it.each([
    ['1 1/2', 1.5],
    ['1½', 1.5],
    ['0.5', 0.5],
    ['¼', 0.25],
    ['3/4', 0.75],
    ['12', 12],
    ['one', 1],
  ])('%s -> %d', (text, value) => {
    expect(parseNumber(text)).toBeCloseTo(value);
  });
});

describe('parseIngredientLine', () => {
  it('reads count items with commas inside the description', () => {
    const parsed = line('8 bone-in, skin-on chicken thighs (about 1.1 kg)');
    expect(parsed).toMatchObject({ qty: 8, unit: null, item: 'bone-in, skin-on chicken thighs', note: 'about 1.1 kg', canonicalId: 'chicken-thighs' });
    expect(parsed.needsFix).toBeUndefined();
  });

  it('reads mixed fractions, units and bracketed notes', () => {
    expect(line('1½ tsp fine salt (plus a pinch for the sauce)')).toMatchObject({
      qty: 1.5,
      unit: 'tsp',
      item: 'fine salt',
      note: 'plus a pinch for the sauce',
      canonicalId: 'salt',
    });
    expect(line('1 1/2 tablespoons olive oil')).toMatchObject({ qty: 1.5, unit: 'tbsp', canonicalId: 'olive-oil' });
    expect(line('0.5 kg potatoes')).toMatchObject({ qty: 0.5, unit: 'kg', canonicalId: 'potato' });
  });

  it('reads long unit names and attached units', () => {
    expect(line('300 grams long-grain white rice')).toMatchObject({ qty: 300, unit: 'g', canonicalId: 'long-grain-rice' });
    expect(line('400g crushed tomatoes')).toMatchObject({ qty: 400, unit: 'g', canonicalId: 'crushed-tomatoes' });
    expect(line('750 ml chicken stock (hot)')).toMatchObject({ qty: 750, unit: 'ml', note: 'hot', canonicalId: 'chicken-stock' });
  });

  it('reads ranges', () => {
    expect(line('2–3 garlic cloves')).toMatchObject({ qty: 2, qtyMax: 3, canonicalId: 'garlic' });
    expect(line('2-3 tbsp soy sauce')).toMatchObject({ qty: 2, qtyMax: 3, unit: 'tbsp' });
  });

  it('splits a note after a comma once the ingredient is recognisable', () => {
    expect(line('2 cans chickpeas, drained')).toMatchObject({ qty: 2, unit: 'can', item: 'chickpeas', note: 'drained' });
    expect(line('1 yellow onion, diced')).toMatchObject({ item: 'yellow onion', note: 'diced', canonicalId: 'yellow-onion' });
  });

  it('flags vague amounts for a fix', () => {
    expect(line('a handful of basil leaves')).toMatchObject({ qty: null, needsFix: true, item: 'basil leaves', canonicalId: 'basil' });
    expect(line('salt to taste')).toMatchObject({ qty: null, needsFix: true, item: 'salt', note: 'to taste' });
  });

  it('reads "a pinch of" as one pinch', () => {
    expect(line('a pinch of saffron')).toMatchObject({ qty: 1, unit: 'pinch', item: 'saffron' });
  });

  it('converts imperial amounts to metric', () => {
    expect(line('8 oz mozzarella')).toMatchObject({ qty: 227, unit: 'g', canonicalId: 'mozzarella' });
  });
});

describe('normalize', () => {
  it('singularises', () => {
    expect(singularize('tomatoes')).toBe('tomato');
    expect(singularize('leaves')).toBe('leaf');
    expect(singularize('olives')).toBe('olive');
    expect(singularize('anchovies')).toBe('anchovy');
    expect(singularize('hummus')).toBe('hummus');
  });

  it('matches the noun, not the first word', () => {
    expect(canonicalId('chicken stock')).toBe('chicken-stock');
    expect(canonicalId('Yellow onions')).toBe('yellow-onion');
    expect(canonicalId('garlic cloves')).toBe('garlic');
    expect(canonicalId('fresh dill')).toBe('dill');
    expect(canonicalId('toasted sesame oil')).toBe('sesame-oil');
  });
});

describe('scaling and formatting', () => {
  it('scales by selected / base servings', () => {
    expect(scaleQty(300, 6 / 4)).toBe(450);
    expect(scaleQty(null, 2)).toBeNull();
  });

  it('rounds grams and millilitres', () => {
    expect(formatQty(450, 'g')).toBe('450');
    expect(formatQty(125, 'g')).toBe('125');
    expect(formatQty(187.5, 'g')).toBe('190');
    expect(formatQty(1126.4, 'ml')).toBe('1130');
    expect(formatQty(37.5, 'g')).toBe('40');
    expect(formatQty(36.2, 'g')).toBe('35');
    expect(formatQty(1.6, 'g')).toBe('2');
  });

  it('shows everything else as friendly fractions', () => {
    expect(formatNumber(1.5)).toBe('1½');
    expect(formatNumber(0.33)).toBe('⅓');
    expect(formatNumber(0.05)).toBe('¼');
    expect(formatNumber(2.8)).toBe('2¾');
    expect(formatNumber(2.7)).toBe('2⅔');
    expect(formatNumber(0.97)).toBe('1');
    expect(formatNumber(12)).toBe('12');
    expect(formatAmount(1.5, 'tsp')).toBe('1½ tsp');
    expect(formatAmount(4, 'head')).toBe('4 heads');
    expect(formatAmount(2, 'clove', 3)).toBe('2–3 cloves');
  });

  it('formats durations and clocks', () => {
    expect(formatDuration(35)).toBe('35 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(80)).toBe('1 h 20 min');
    expect(formatClock(2852)).toBe('47:32');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('detectDurations', () => {
  it('sear 8 min', () => {
    const [found] = detectDurations('Lay the chicken in skin-side down and sear 8 min until deep golden', 2);
    expect(found).toMatchObject({ phrase: 'sear 8 min', seconds: 480, label: 'Sear' });
  });

  it('1 min with no verb near it', () => {
    const text = 'then stir in the garlic for 1 min';
    const [found] = detectDurations(text, 3);
    expect(found).toMatchObject({ phrase: '1 min', seconds: 60, label: 'Step 3' });
    expect(text.slice(found?.start, found?.end)).toBe('1 min');
  });

  it('bake and chill in one step', () => {
    const found = detectDurations(
      'Cover the pan tightly with foil and bake 50 min in the oven … and chill 15 min',
      6,
    );
    expect(found.map((d) => [d.phrase, d.seconds, d.label])).toEqual([
      ['bake 50 min', 3000, 'Oven'],
      ['chill 15 min', 900, 'Chill'],
    ]);
  });

  it('rest 10 min', () => {
    expect(detectDurations('Uncover and rest 10 min', 7)[0]).toMatchObject({ phrase: 'rest 10 min', seconds: 600, label: 'Rest' });
  });

  it('Simmer for 15 min', () => {
    expect(detectDurations('Simmer for 15 min, stirring now and then', 1)[0]).toMatchObject({
      phrase: 'Simmer for 15 min',
      seconds: 900,
      label: 'Simmer',
    });
  });

  it('ranges time the lower bound and show the whole range', () => {
    expect(detectDurations('Cover and cook 8–10 min', 1)[0]).toMatchObject({ phrase: 'cook 8–10 min', seconds: 480 });
  });

  it('compound durations and words', () => {
    expect(detectDurations('Roast for 1 hour 15 minutes', 1)[0]).toMatchObject({ seconds: 4500, label: 'Oven' });
    expect(detectDurations('Leave to rise for an hour', 1)[0]).toMatchObject({ seconds: 3600, label: 'Rise' });
    expect(detectDurations('Heat the oven to 200 °C', 1)).toEqual([]);
  });
});

describe('diet engine', () => {
  it('flags nuts and a custom sesame rule', () => {
    const sesame = parseCustomRule('Sesame allergy');
    expect(sesame?.hint).toBe('Also matches tahini and sesame oil');
    const check = checkDiet(recipeOf(['4 tbsp peanut butter', '1 tbsp toasted sesame oil', '250 g rice noodles']), {
      presets: { nutAllergy: true },
      custom: sesame === null ? [] : [sesame],
    });
    expect(check.ok).toBe(false);
    expect(check.reasons).toEqual(['Contains peanuts, sesame']);
  });

  it('cilantro rules know coriander leaves but not ground coriander', () => {
    const rule = parseCustomRule('no cilantro');
    expect(rule).toMatchObject({ label: 'No cilantro', hint: 'Also matches coriander leaves' });
    const profile = { presets: {}, custom: rule === null ? [] : [rule] };
    expect(checkDiet(recipeOf(['1 bunch coriander leaves']), profile).reasons).toEqual(['Contains cilantro']);
    expect(checkDiet(recipeOf(['1 tsp ground coriander']), profile).ok).toBe(true);
  });

  it('halal flags pork and alcohol', () => {
    const profile = { presets: { halal: true }, custom: [] };
    expect(checkDiet(recipeOf(['150 g chorizo']), profile).reasons).toEqual(['Contains pork']);
    expect(checkDiet(recipeOf(['150 ml dry white wine']), profile).reasons).toEqual(['Contains alcohol']);
  });

  it('kosher flags meat with dairy', () => {
    const profile = { presets: { kosher: true }, custom: [] };
    expect(checkDiet(recipeOf(['500 g chicken thighs', '40 g butter']), profile).reasons).toEqual(['Mixes meat and dairy']);
  });

  it('vegan and vegetarian', () => {
    expect(checkDiet(recipeOf(['2 eggs', '60 ml milk']), { presets: { vegan: true }, custom: [] }).reasons).toEqual([
      'Contains dairy, eggs',
    ]);
    expect(checkDiet(recipeOf(['1 tbsp honey']), { presets: { vegan: true }, custom: [] }).reasons).toEqual(['Contains honey']);
    expect(checkDiet(recipeOf(['2 salmon fillets']), { presets: { vegetarian: true }, custom: [] }).reasons).toEqual([
      'Contains fish',
    ]);
    expect(checkDiet(recipeOf(['2 salmon fillets']), { presets: { pescatarian: true }, custom: [] }).ok).toBe(true);
  });

  it('low-carb uses estimated net carbs per serving', () => {
    const profile = { presets: { lowCarb: true }, custom: [] };
    expect(checkDiet(recipeOf(['300 g long-grain rice'], 4), profile).ok).toBe(false);
    expect(checkDiet(recipeOf(['400 g salmon fillets', '200 g baby spinach'], 2), profile).ok).toBe(true);
  });

  it('suggests diet tags and summarises the profile', () => {
    expect(dietTags(recipeOf(['500 g potato gnocchi', '125 g mozzarella', '400 g cherry tomatoes']))).toEqual(['Vegetarian']);
    expect(
      fitsProfileLine({
        presets: { nutAllergy: true },
        custom: [parseCustomRule('Sesame allergy'), parseCustomRule('No cilantro')].filter((r) => r !== null),
      }),
    ).toBe('No nuts, sesame or cilantro found');
  });
});

describe('calorie estimate', () => {
  it('estimates from the catalog, rounded to 10', () => {
    const kcal = estimateKcal(recipeOf(['300 g long-grain rice', '2 tbsp olive oil'], 4));
    // 300 g rice = 1080 kcal, 2 tbsp oil = 30 ml * 0.91 g/ml * 8.84 = 241 kcal.
    expect(kcal).toBe(330);
  });

  it('gives up when too little is understood', () => {
    expect(estimateKcal(recipeOf(['1 mystery thing', '2 unknowable items', '100 g rice']))).toBeNull();
  });
});

describe('shopping list quantities', () => {
  const part = (qty: number, unit: IngredientLine['unit']) => ({ recipeId: 'r', recipeTitle: 'R', qty, unit });

  it('adds up convertible units', () => {
    expect(formatListQty([part(200, 'g'), part(1, 'kg')])).toBe('1.2 kg');
    expect(formatListQty([part(1, 'tbsp'), part(3, 'tsp')])).toBe('2 tbsp');
  });

  it('shows the rest side by side', () => {
    expect(formatListQty([part(200, 'g'), part(1, 'cup')])).toBe('200 g + 1 cup');
  });
});

describe('ingredient search tokens', () => {
  it('lemon is lemons, not lemongrass; rice is every rice', () => {
    expect(lineMatchesToken(line('2 lemons'), 'lemon')).toBe(true);
    expect(lineMatchesToken(line('2 lemongrass stalks'), 'lemon')).toBe(false);
    expect(lineMatchesToken(line('300 g arborio rice'), 'rice')).toBe(true);
    expect(lineMatchesToken(line('300 g jasmine rice'), 'rice')).toBe(true);
    expect(lineMatchesToken(line('300 g long-grain white rice'), 'rice')).toBe(true);
    expect(lineMatchesToken(line('750 ml chicken stock'), 'chicken')).toBe(false);
  });

  it('needs two thirds of the tokens', () => {
    expect([1, 2, 3, 4].map(tokensNeeded)).toEqual([1, 2, 2, 3]);
  });
});
