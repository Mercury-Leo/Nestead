import type { AnyRecipe } from '../../../domain/types';
import { estimateKcal } from '../../../domain/kitchen/calories';
import { buildRecipe } from './build';
import type { RecipeSpec } from './build';

/**
 * The offline "web index": recipes from around the web, bundled so search works
 * with no network and no API key. A real search provider can replace it behind
 * RecipeSearchProvider; ask before adding one, since it needs a key.
 */

function web(spec: RecipeSpec): AnyRecipe {
  const recipe = { ...buildRecipe(spec), id: `web:${spec.slug}`, inLibrary: false };
  if (recipe.kcalPerServing === undefined) {
    const estimate = estimateKcal(recipe);
    if (estimate !== null) {
      recipe.kcalPerServing = estimate;
      recipe.kcalEstimated = true;
    }
  }
  return recipe;
}

export const WEB_INDEX: readonly AnyRecipe[] = [
  web({
    slug: 'avgolemono-lemon-chicken-soup',
    title: 'Avgolemono (Lemon Chicken Soup)',
    description: 'Silky Greek chicken and rice soup, thickened with egg and sharpened with lemon.',
    source: { site: 'hearthandlemon.com' },
    servings: 4,
    prepMin: 10,
    cookMin: 40,
    kcal: 380,
    sourceRating: 4.7,
    tags: ['Gluten-free', 'Dairy-free'],
    ingredients: [
      '500 g chicken thighs',
      '100 g long-grain rice',
      '2 lemons (juiced)',
      '3 eggs',
      '1.5 l chicken stock',
      '1 yellow onion (diced)',
      '2 carrots (diced)',
      '2 celery stalks (diced)',
      '1 tsp salt',
      '1 bunch fresh dill (chopped)',
    ],
    equipment: ['Large pot', 'Mixing bowl', 'Whisk'],
    steps: [
      'Put the chicken, onion, carrots and celery in a large pot with the stock and salt. Bring to a boil, then simmer 25 min.',
      'Lift out the chicken and shred it. Add the rice to the pot and simmer 15 min until tender.',
      'Whisk the eggs with the lemon juice, then slowly whisk in two ladles of hot broth.',
      'Take the pot off the heat and stir the egg mixture back in until the soup turns silky. Do not let it boil.',
      'Return the chicken, scatter with dill and serve.',
    ],
  }),
  web({
    slug: 'ginger-chicken-congee',
    title: 'Ginger Chicken Congee',
    description: 'Slow-simmered rice porridge with gingery chicken — comfort in a bowl.',
    source: { site: 'slowbowl.co' },
    servings: 4,
    prepMin: 10,
    cookMin: 80,
    kcal: 310,
    sourceRating: 4.5,
    tags: ['Gluten-free', 'Dairy-free'],
    ingredients: [
      '400 g chicken thighs',
      '150 g long-grain rice (rinsed)',
      '1 l chicken stock',
      '3 garlic cloves (sliced)',
      '2 tbsp soy sauce',
      '1 l water',
      '1 tsp salt',
      '40 g fresh ginger (cut into matchsticks)',
      '1 bunch scallions (sliced)',
    ],
    equipment: ['Large heavy pot'],
    steps: [
      'Put the rice, stock, water, garlic and half the ginger in a large pot and bring to a boil.',
      'Add the chicken, lower the heat and simmer 20 min. Lift out the chicken and shred it.',
      'Keep the rice at a bare simmer, stirring now and then, for 1 hour until thick and creamy.',
      'Stir the chicken back in and season with the soy sauce and salt.',
      'Serve topped with the rest of the ginger and the scallions.',
    ],
  }),
  web({
    slug: 'chicken-chorizo-paella',
    title: 'Chicken & Chorizo Paella',
    description: 'Smoky, saffron-scented rice with chicken and chorizo, finished with a crisp base.',
    source: { site: 'saltandsimmer.com' },
    servings: 4,
    prepMin: 15,
    cookMin: 45,
    kcal: 620,
    sourceRating: 4.4,
    tags: ['Dairy-free'],
    ingredients: [
      '500 g chicken thighs (cut into chunks)',
      '300 g long-grain rice',
      '900 ml chicken stock (hot)',
      '1 yellow onion (finely chopped)',
      '3 garlic cloves (sliced)',
      '2 tsp smoked paprika',
      '1 lemon (cut into wedges)',
      '3 tbsp olive oil',
      '1 tsp salt',
      '150 g chorizo (sliced)',
      '1 pinch saffron',
      '1 red bell pepper (sliced)',
      '150 g frozen peas',
      '1 bunch flat-leaf parsley',
    ],
    equipment: ['Paella pan or large skillet'],
    steps: [
      'Warm the oil in the pan and fry the chorizo 3 min until it releases its oil. Add the chicken and brown 6 min.',
      'Add the onion, pepper and garlic and cook 5 min until soft. Stir in the paprika and rice.',
      'Crumble the saffron into the hot stock, pour it in with the salt and simmer 20 min without stirring.',
      'Scatter over the peas and cook 5 min more, until a crust forms underneath.',
      'Rest 5 min, then serve with parsley and lemon wedges.',
    ],
  }),
  web({
    slug: 'chicken-rice-stuffed-peppers',
    title: 'Chicken & Rice Stuffed Peppers',
    description: 'Sweet peppers packed with tomato-chicken rice and bubbling mozzarella.',
    source: { site: 'weeknightpan.co' },
    servings: 4,
    prepMin: 20,
    cookMin: 45,
    kcal: 410,
    sourceRating: 4.2,
    tags: ['Gluten-free'],
    ingredients: [
      '400 g chicken thighs (diced)',
      '150 g long-grain rice',
      '400 g crushed tomatoes',
      '1 yellow onion (diced)',
      '2 garlic cloves (minced)',
      '2 tbsp olive oil',
      '1 tsp salt',
      '4 bell peppers (halved and seeded)',
      '125 g mozzarella (torn)',
      '150 g sweet corn',
      '50 g black olives (sliced)',
      '1 bunch flat-leaf parsley',
    ],
    equipment: ['Baking dish', 'Skillet', 'Saucepan'],
    steps: [
      'Heat the oven to 200 °C. Cook the rice in simmering water for 12 min and drain.',
      'Warm the oil in a skillet and cook the chicken, onion and garlic 8 min. Stir in the tomatoes, corn, olives, rice and salt.',
      'Pack the filling into the pepper halves in a baking dish and bake 25 min.',
      'Top with the mozzarella and bake 10 min more, until bubbling. Scatter with parsley.',
    ],
  }),
  web({
    slug: 'sesame-chicken-rice-bowls',
    title: 'Sesame Chicken Rice Bowls',
    description: 'Sticky sesame-soy chicken over rice with crunchy cucumber.',
    source: { site: 'bowlandbasket.com' },
    servings: 4,
    prepMin: 15,
    cookMin: 20,
    kcal: 520,
    sourceRating: 4.5,
    tags: ['Dairy-free'],
    ingredients: [
      '500 g chicken thighs (cut into strips)',
      '250 g long-grain rice',
      '2 tbsp soy sauce',
      '1 tbsp sesame oil',
      '1 tbsp sesame seeds',
      '2 garlic cloves (grated)',
      '1 tbsp honey',
      '1 cucumber (sliced)',
      '1 bunch scallions (sliced)',
    ],
    equipment: ['Skillet', 'Saucepan'],
    steps: [
      'Cook the rice in simmering water for 12 min and drain.',
      'Fry the chicken in the sesame oil 8 min until golden. Add the garlic, soy sauce and honey and toss 1 min until sticky.',
      'Serve over the rice with cucumber, scallions and sesame seeds.',
    ],
  }),
  web({
    slug: 'lemongrass-chicken-jasmine-rice',
    title: 'Lemongrass Chicken with Jasmine Rice',
    description: 'Fragrant lemongrass-and-fish-sauce chicken with fluffy jasmine rice and herbs.',
    source: { site: 'slowbowl.co' },
    servings: 4,
    prepMin: 15,
    cookMin: 25,
    kcal: 480,
    sourceRating: 4.6,
    tags: ['Dairy-free'],
    ingredients: [
      '600 g chicken thighs',
      '300 g jasmine rice',
      '2 lemongrass stalks (finely chopped)',
      '2 tbsp fish sauce',
      '1 tbsp brown sugar',
      '3 garlic cloves (minced)',
      '1 lime',
      '1 bunch cilantro',
      '1 tbsp vegetable oil',
    ],
    equipment: ['Skillet', 'Saucepan'],
    steps: [
      'Mix the lemongrass, fish sauce, sugar and garlic, add the chicken and marinate 15 min.',
      'Cook the rice in simmering water for 12 min, then leave covered.',
      'Heat the oil in a skillet and sear 10 min, turning, until caramelised.',
      'Serve over the rice with lime wedges and cilantro.',
    ],
  }),
  web({
    slug: 'crispy-skillet-gnocchi',
    title: 'Crispy Skillet Gnocchi with Cherry Tomatoes',
    description: 'Shop-bought gnocchi roasted until crisp with jammy tomatoes and melting mozzarella.',
    source: { site: 'weeknightpan.co' },
    servings: 4,
    prepMin: 10,
    cookMin: 25,
    sourceRating: 4.6,
    tags: [],
    ingredients: [
      '500 g potato gnocchi',
      '400 g cherry tomatoes',
      '1 yellow onion (cut into wedges)',
      '3 garlic cloves (smashed)',
      '2 tbsp olive oil',
      '1 tsp dried oregano',
      '½ tsp fine salt',
      '125 g fresh mozzarella (torn)',
      'a handful of basil leaves',
    ],
    equipment: ['Large oven-safe skillet', 'Mixing bowl'],
    steps: [
      'Heat the oven to 220 °C with a large oven-safe skillet inside.',
      'Toss the gnocchi, tomatoes, onion and garlic with the oil, oregano and salt.',
      'Tip into the hot skillet and roast until the gnocchi are crisp, about 25 min.',
      'Scatter over the mozzarella and roast 5 min more, until melted.',
      'Tear over the basil and serve straight from the pan.',
    ],
  }),
];

/** Where a web search comes from. The default is the bundled offline index. */
export interface RecipeSearchProvider {
  /** Everything the provider knows, for ranking against the pantry. */
  all(): readonly AnyRecipe[];
  /** Free-text search, for "Search online" on the import screen. */
  search(query: string): Promise<AnyRecipe[]>;
}

export const offlineProvider: RecipeSearchProvider = {
  all: () => WEB_INDEX,
  async search(query) {
    const words = query.toLowerCase().split(/\s+/).filter((word) => word !== '');
    if (words.length === 0) return [...WEB_INDEX];
    return WEB_INDEX.filter((recipe) => {
      const haystack = `${recipe.title} ${recipe.ingredients.map((line) => line.item).join(' ')}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  },
};
