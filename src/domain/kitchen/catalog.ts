import type { DietFlag, StoreSection } from '../types';

/**
 * The ingredient catalog. It drives pantry suggestions, store-section grouping,
 * diet checks and calorie estimates.
 *
 * Kept as a compact table rather than JSON so each entry fits on a line and a
 * typo in a section or flag is a type error. Values are per 100 g of the
 * ingredient as bought (dry rice, raw meat). They are for estimates, not labels.
 */

export interface CatalogItem {
  id: string;
  name: string;
  aliases: string[];
  section: StoreSection;
  flags: DietFlag[];
  kcalPer100g?: number;
  carbsPer100g?: number;
  /** Weight of one "unit" (one lemon, one bunch of dill, one head of bok choy). */
  gramsPerUnit?: number;
  densityGPerMl?: number;
  /**
   * Broader words this counts as when searching by ingredient: "rice" finds
   * arborio and jasmine, "chicken" finds thighs and breasts.
   */
  groups: string[];
}

const SECTIONS = {
  P: 'Produce',
  M: 'Meat & fish',
  D: 'Dairy & eggs',
  B: 'Bakery',
  G: 'Grains & pasta',
  C: 'Cans & jars',
  I: 'International aisle',
  S: 'Spices & dried herbs',
  K: 'Baking',
  F: 'Frozen',
  R: 'Drinks',
  O: 'Other',
} as const satisfies Record<string, StoreSection>;

type SectionCode = keyof typeof SECTIONS;

interface Extra {
  /** Aliases. */
  a?: string[];
  /** Grams per unit. */
  u?: number;
  /** Density, g/ml. */
  d?: number;
  /** Search groups. */
  g?: string[];
}

/** [name, section, flags, kcal/100 g, carbs/100 g, extras] */
type Row = [string, SectionCode, string, number, number, Extra?];

// Flag shorthands, expanded below. Anything from an animal also gets 'animal'.
const ANIMAL = new Set<DietFlag>(['meat', 'poultry', 'pork', 'fish', 'shellfish', 'dairy', 'egg']);

const ROWS: Row[] = [
  // Produce
  ['Lemon', 'P', '', 29, 9, { u: 100 }],
  ['Lime', 'P', '', 30, 11, { u: 67 }],
  ['Yellow onion', 'P', '', 40, 9, { u: 150, a: ['onion', 'brown onion'] }],
  ['Red onion', 'P', '', 40, 9, { u: 150 }],
  ['Garlic', 'P', '', 149, 33, { u: 5, a: ['garlic clove', 'head of garlic'] }],
  ['Carrot', 'P', '', 41, 10, { u: 60 }],
  ['Celery', 'P', '', 16, 3, { u: 40, a: ['celery stalk', 'celery rib', 'celery stick'] }],
  ['Baby spinach', 'P', '', 23, 4, { a: ['spinach', 'spinach leaf'] }],
  ['Cherry tomato', 'P', '', 18, 4, { u: 15, a: ['grape tomato'] }],
  ['Tomato', 'P', '', 18, 4, { u: 120, a: ['plum tomato', 'vine tomato'] }],
  ['Potato', 'P', '', 77, 17, { u: 170, a: ['yukon gold potato', 'russet potato', 'waxy potato'] }],
  ['Sweet potato', 'P', '', 86, 20, { u: 130 }],
  ['Banana', 'P', '', 89, 23, { u: 120, a: ['overripe banana'] }],
  ['Avocado', 'P', '', 160, 9, { u: 150 }],
  ['Red cabbage', 'P', '', 31, 7, { u: 900 }],
  ['Green cabbage', 'P', '', 25, 6, { u: 900, a: ['cabbage', 'savoy cabbage'] }],
  ['Cilantro', 'P', '', 23, 4, { u: 30, a: ['coriander leaves', 'coriander leaf', 'fresh coriander'] }],
  ['Flat-leaf parsley', 'P', '', 36, 6, { u: 30, a: ['parsley', 'italian parsley', 'curly parsley'] }],
  ['Dill', 'P', '', 43, 7, { u: 20, a: ['dill fronds'] }],
  ['Basil', 'P', '', 23, 3, { u: 25, a: ['basil leaf', 'sweet basil'] }],
  ['Mint', 'P', '', 44, 8, { u: 25, a: ['mint leaf'] }],
  ['Thyme', 'P', '', 101, 24, { u: 10, a: ['thyme sprig', 'dried thyme'] }],
  ['Rosemary', 'P', '', 131, 21, { u: 10, a: ['rosemary sprig'] }],
  ['Chives', 'P', '', 30, 4, { u: 20, a: ['chive'] }],
  ['Scallion', 'P', '', 32, 7, { u: 15, a: ['green onion', 'spring onion'] }],
  ['Shallot', 'P', '', 72, 17, { u: 30 }],
  ['Ginger', 'P', '', 80, 18, { u: 30, a: ['ginger root', 'root ginger'] }],
  ['Lemongrass', 'P', '', 99, 25, { u: 20, a: ['lemongrass stalk'] }],
  ['Baby bok choy', 'P', '', 13, 2, { u: 100, a: ['bok choy', 'pak choi', 'baby pak choi'] }],
  ['Red bell pepper', 'P', '', 31, 6, { u: 120, a: ['red pepper'], g: ['bell pepper'] }],
  ['Bell pepper', 'P', '', 26, 6, { u: 120, a: ['green bell pepper', 'green pepper', 'capsicum'] }],
  ['Yellow bell pepper', 'P', '', 27, 6, { u: 120, a: ['yellow pepper'], g: ['bell pepper'] }],
  ['Cremini mushroom', 'P', '', 22, 4, { u: 20, a: ['chestnut mushroom', 'baby bella mushroom', 'brown mushroom'], g: ['mushroom'] }],
  ['Mushroom', 'P', '', 22, 3, { u: 20, a: ['button mushroom', 'white mushroom', 'wild mushroom'] }],
  ['Shiitake mushroom', 'P', '', 34, 7, { u: 15, a: ['shiitake'], g: ['mushroom'] }],
  ['Zucchini', 'P', '', 17, 3, { u: 200, a: ['courgette'] }],
  ['Eggplant', 'P', '', 25, 6, { u: 300, a: ['aubergine'] }],
  ['Cucumber', 'P', '', 15, 4, { u: 300 }],
  ['Broccoli', 'P', '', 34, 7, { u: 300, a: ['broccoli floret', 'tenderstem broccoli'] }],
  ['Cauliflower', 'P', '', 25, 5, { u: 600 }],
  ['Kale', 'P', '', 49, 9, { a: ['cavolo nero', 'lacinato kale'] }],
  ['Lettuce', 'P', '', 15, 3, { u: 300, a: ['romaine', 'romaine lettuce', 'little gem'] }],
  ['Arugula', 'P', '', 25, 4, { a: ['rocket'] }],
  ['Green beans', 'P', '', 31, 7, { a: ['french beans', 'string beans'] }],
  ['Asparagus', 'P', '', 20, 4, { u: 20 }],
  ['Leek', 'P', '', 61, 14, { u: 200 }],
  ['Fennel', 'P', '', 31, 7, { u: 250, a: ['fennel bulb'] }],
  ['Beetroot', 'P', '', 43, 10, { u: 150, a: ['beet'] }],
  ['Butternut squash', 'P', '', 45, 12, { u: 1000 }],
  ['Pumpkin', 'P', '', 26, 7, { u: 1500 }],
  ['Apple', 'P', '', 52, 14, { u: 180 }],
  ['Pear', 'P', '', 57, 15, { u: 180 }],
  ['Orange', 'P', '', 47, 12, { u: 150 }],
  ['Strawberries', 'P', '', 32, 8, { u: 12 }],
  ['Blueberries', 'P', '', 57, 14 ],
  ['Raspberries', 'P', '', 52, 12 ],
  ['Mango', 'P', '', 60, 15, { u: 300 }],
  ['Pineapple', 'P', '', 50, 13, { u: 900 }],
  ['Jalapeño', 'P', '', 29, 6, { u: 15, a: ['jalapeno'] }],
  ['Red chili', 'P', '', 40, 9, { u: 10, a: ['red chile', 'bird’s eye chili', 'chili'] }],
  ['Radish', 'P', '', 16, 3, { u: 10 }],
  ['Tofu', 'P', '', 76, 2, { a: ['firm tofu', 'silken tofu'] }],
  ['Tempeh', 'P', '', 192, 8 ],

  // Meat & fish
  ['Chicken thighs', 'M', 'poultry', 209, 0, { u: 140, a: ['chicken thigh', 'chicken thigh fillet'], g: ['chicken'] }],
  ['Chicken breast', 'M', 'poultry', 165, 0, { u: 200, a: ['chicken breast fillet'], g: ['chicken'] }],
  ['Whole chicken', 'M', 'poultry', 215, 0, { u: 1600, a: ['chicken'], g: ['chicken'] }],
  ['Chicken wings', 'M', 'poultry', 203, 0, { u: 90, g: ['chicken'] }],
  ['Ground chicken', 'M', 'poultry', 143, 0, { a: ['chicken mince', 'minced chicken'], g: ['chicken'] }],
  ['Ground beef', 'M', 'meat', 250, 0, { a: ['beef mince', 'minced beef'], g: ['beef'] }],
  ['Beef steak', 'M', 'meat', 271, 0, { u: 250, a: ['steak', 'sirloin', 'ribeye'], g: ['beef'] }],
  ['Stewing beef', 'M', 'meat', 200, 0, { a: ['beef chuck', 'braising steak'], g: ['beef'] }],
  ['Ground pork', 'M', 'pork', 263, 0, { a: ['pork mince', 'minced pork'], g: ['pork'] }],
  ['Pork chops', 'M', 'pork', 231, 0, { u: 200, a: ['pork chop'], g: ['pork'] }],
  ['Pork belly', 'M', 'pork', 518, 0, { g: ['pork'] }],
  ['Bacon', 'M', 'pork', 541, 1, { u: 25, a: ['streaky bacon', 'bacon rasher'], g: ['pork'] }],
  ['Pancetta', 'M', 'pork', 400, 0, { g: ['pork'] }],
  ['Ham', 'M', 'pork', 145, 2, { g: ['pork'] }],
  ['Prosciutto', 'M', 'pork', 250, 0, { g: ['pork'] }],
  ['Chorizo', 'M', 'pork', 455, 2, { u: 75, a: ['chorizo sausage', 'cooking chorizo'], g: ['pork', 'sausage'] }],
  ['Sausages', 'M', 'pork', 301, 2, { u: 70, a: ['sausage', 'pork sausage'], g: ['pork'] }],
  ['Lamb shoulder', 'M', 'meat', 282, 0, { a: ['lamb', 'lamb leg'], g: ['lamb'] }],
  ['Ground lamb', 'M', 'meat', 282, 0, { a: ['lamb mince', 'minced lamb'], g: ['lamb'] }],
  ['Lamb chops', 'M', 'meat', 294, 0, { u: 100, g: ['lamb'] }],
  ['Turkey breast', 'M', 'poultry', 135, 0, { g: ['turkey'] }],
  ['Ground turkey', 'M', 'poultry', 149, 0, { a: ['turkey mince'], g: ['turkey'] }],
  ['Salmon fillets', 'M', 'fish', 208, 0, { u: 150, a: ['salmon', 'salmon fillet', 'skin-on salmon fillet'], g: ['salmon', 'fish'] }],
  ['Smoked salmon', 'M', 'fish', 117, 0, { g: ['salmon', 'fish'] }],
  ['Cod', 'M', 'fish', 82, 0, { u: 150, a: ['cod fillet'], g: ['fish'] }],
  ['White fish', 'M', 'fish', 90, 0, { u: 150, a: ['white fish fillet', 'haddock', 'hake'], g: ['fish'] }],
  ['Tuna steak', 'M', 'fish', 144, 0, { u: 150, g: ['tuna', 'fish'] }],
  ['Shrimp', 'M', 'shellfish', 99, 0, { u: 15, a: ['prawn', 'king prawn', 'jumbo shrimp'] }],
  ['Scallops', 'M', 'shellfish', 111, 3, { u: 20 }],
  ['Mussels', 'M', 'shellfish', 86, 4, { u: 15 }],
  ['Crab', 'M', 'shellfish', 97, 0, { a: ['crab meat', 'crabmeat'] }],
  ['Lobster', 'M', 'shellfish', 89, 0 ],
  ['Anchovies', 'M', 'fish', 210, 0, { u: 4, a: ['anchovy fillet'], g: ['fish'] }],

  // Dairy & eggs
  ['Eggs', 'D', 'egg', 143, 1, { u: 50, a: ['egg', 'egg yolk', 'egg white'] }],
  ['Butter', 'D', 'dairy', 717, 0, { d: 0.91, a: ['unsalted butter', 'salted butter'] }],
  ['Parmesan', 'D', 'dairy', 431, 4, { a: ['parmigiano reggiano', 'parmesan cheese', 'parmigiano', 'grana padano'], g: ['cheese'] }],
  ['Milk', 'D', 'dairy', 61, 5, { d: 1.03, a: ['whole milk', 'semi-skimmed milk', 'cow’s milk'] }],
  ['Feta', 'D', 'dairy', 264, 4, { a: ['feta cheese'], g: ['cheese'] }],
  ['Greek yogurt', 'D', 'dairy', 97, 4, { d: 1.05, a: ['greek-style yogurt', 'greek yoghurt'], g: ['yogurt'] }],
  ['Plain yogurt', 'D', 'dairy', 61, 5, { d: 1.05, a: ['yogurt', 'yoghurt', 'natural yogurt'], g: ['yogurt'] }],
  ['Heavy cream', 'D', 'dairy', 340, 3, { d: 1, a: ['double cream', 'whipping cream', 'cream', 'heavy whipping cream'] }],
  ['Sour cream', 'D', 'dairy', 198, 5, { d: 1 }],
  ['Crème fraîche', 'D', 'dairy', 292, 3, { d: 1, a: ['creme fraiche'] }],
  ['Cream cheese', 'D', 'dairy', 342, 4, { g: ['cheese'] }],
  ['Mozzarella', 'D', 'dairy', 280, 3, { u: 125, a: ['mozzarella ball', 'buffalo mozzarella'], g: ['cheese'] }],
  ['Cheddar', 'D', 'dairy', 403, 1, { a: ['cheddar cheese', 'sharp cheddar'], g: ['cheese'] }],
  ['Gruyère', 'D', 'dairy', 413, 0, { a: ['gruyere'], g: ['cheese'] }],
  ['Goat cheese', 'D', 'dairy', 364, 0, { a: ['chèvre', 'goat’s cheese'], g: ['cheese'] }],
  ['Ricotta', 'D', 'dairy', 174, 3, { g: ['cheese'] }],
  ['Halloumi', 'D', 'dairy', 321, 2, { g: ['cheese'] }],
  ['Mascarpone', 'D', 'dairy', 429, 4, { g: ['cheese'] }],
  ['Paneer', 'D', 'dairy', 321, 4, { g: ['cheese'] }],
  ['Buttermilk', 'D', 'dairy', 40, 5, { d: 1.03 }],

  // Bakery
  ['Bread', 'B', 'gluten', 265, 49, { u: 35, a: ['sliced bread', 'white bread'] }],
  ['Sourdough', 'B', 'gluten', 289, 56, { u: 50, a: ['sourdough bread'] }],
  ['Baguette', 'B', 'gluten', 270, 53, { u: 250 }],
  ['Pita bread', 'B', 'gluten', 275, 56, { u: 60, a: ['pita'] }],
  ['Naan', 'B', 'gluten dairy', 310, 50, { u: 90 }],
  ['Flour tortillas', 'B', 'gluten', 312, 52, { u: 45, a: ['flour tortilla', 'wrap'] }],
  ['Corn tortillas', 'B', '', 218, 45, { u: 25, a: ['corn tortilla'] }],
  ['Burger buns', 'B', 'gluten', 279, 50, { u: 60, a: ['burger bun', 'brioche bun'] }],

  // Grains & pasta
  ['Long-grain rice', 'G', '', 360, 80, { a: ['long-grain white rice', 'white rice', 'long grain rice'], g: ['rice'] }],
  ['Arborio rice', 'G', '', 358, 79, { a: ['risotto rice', 'carnaroli rice'], g: ['rice'] }],
  ['Jasmine rice', 'G', '', 356, 79, { g: ['rice'] }],
  ['Basmati rice', 'G', '', 356, 78, { g: ['rice'] }],
  ['Brown rice', 'G', '', 362, 76, { g: ['rice'] }],
  ['Sushi rice', 'G', '', 358, 80, { a: ['short-grain rice'], g: ['rice'] }],
  ['Paella rice', 'G', '', 358, 80, { a: ['bomba rice'], g: ['rice'] }],
  ['Brown lentils', 'G', '', 352, 60, { a: ['lentil', 'dried brown lentils'], g: ['lentil'] }],
  ['Green lentils', 'G', '', 352, 60, { a: ['puy lentils'], g: ['lentil'] }],
  ['Red lentils', 'G', '', 358, 63, { a: ['split red lentils'], g: ['lentil'] }],
  ['Spaghetti', 'G', 'gluten', 371, 75, { g: ['pasta'] }],
  ['Penne', 'G', 'gluten', 371, 75, { g: ['pasta'] }],
  ['Rigatoni', 'G', 'gluten', 371, 75, { g: ['pasta'] }],
  ['Linguine', 'G', 'gluten', 371, 75, { g: ['pasta'] }],
  ['Fusilli', 'G', 'gluten', 371, 75, { g: ['pasta'] }],
  ['Orzo', 'G', 'gluten', 371, 75, { g: ['pasta'] }],
  ['Lasagne sheets', 'G', 'gluten', 371, 75, { u: 20, a: ['lasagna sheets', 'lasagna noodle'], g: ['pasta'] }],
  ['Egg noodles', 'G', 'gluten egg', 384, 71, { g: ['noodle'] }],
  ['Rice noodles', 'G', '', 364, 80, { a: ['rice vermicelli', 'flat rice noodle', 'rice stick noodle'], g: ['noodle'] }],
  ['Soba noodles', 'G', 'gluten', 336, 74, { g: ['noodle'] }],
  ['Potato gnocchi', 'G', 'gluten', 133, 28, { a: ['gnocchi'] }],
  ['Couscous', 'G', 'gluten', 376, 77 ],
  ['Quinoa', 'G', '', 368, 64 ],
  ['Bulgur', 'G', 'gluten', 342, 76, { a: ['bulgur wheat', 'bulghur'] }],
  ['Rolled oats', 'G', 'gluten', 389, 66, { d: 0.4, a: ['oats', 'porridge oats', 'old-fashioned oats'] }],
  ['Polenta', 'G', '', 370, 79, { a: ['cornmeal'] }],
  ['Farro', 'G', 'gluten', 340, 72 ],

  // Cans & jars
  ['Chicken stock', 'C', 'poultry', 6, 1, { d: 1, a: ['chicken broth', 'chicken stock cube'] }],
  ['Vegetable stock', 'C', '', 5, 1, { d: 1, a: ['vegetable broth', 'veg stock', 'veggie stock'] }],
  ['Beef stock', 'C', 'meat', 7, 1, { d: 1, a: ['beef broth'] }],
  ['Crushed tomatoes', 'C', '', 32, 7, { u: 400, a: ['canned tomatoes', 'tinned tomatoes', 'crushed tomato', 'canned crushed tomatoes'] }],
  ['Tomato paste', 'C', '', 82, 19, { d: 1.1, a: ['tomato purée', 'tomato puree', 'concentrated tomato paste'] }],
  ['Passata', 'C', '', 30, 6, { d: 1, a: ['tomato passata', 'strained tomatoes'] }],
  ['Black beans', 'C', '', 132, 24, { u: 240, a: ['black bean', 'canned black beans'] }],
  ['Chickpeas', 'C', '', 139, 22, { u: 240, a: ['garbanzo beans', 'canned chickpeas'] }],
  ['Kidney beans', 'C', '', 127, 23, { u: 240, a: ['red kidney beans'] }],
  ['Cannellini beans', 'C', '', 114, 21, { u: 240, a: ['white beans', 'butter beans'] }],
  ['Coconut milk', 'C', '', 197, 3, { u: 400, d: 1, a: ['full-fat coconut milk', 'tinned coconut milk'] }],
  ['Coconut cream', 'C', '', 330, 7, { u: 400, d: 1 }],
  ['Soy sauce', 'C', 'gluten', 53, 5, { d: 1.1, a: ['light soy sauce', 'dark soy sauce', 'soy'] }],
  ['Tamari', 'C', '', 60, 6, { d: 1.1 }],
  ['Black olives', 'C', '', 115, 6, { u: 4, a: ['olive', 'kalamata olive', 'green olive'] }],
  ['Capers', 'C', '', 23, 5, { d: 0.9 }],
  ['Canned tuna', 'C', 'fish', 116, 0, { u: 145, a: ['tuna', 'tinned tuna'], g: ['tuna', 'fish'] }],
  ['Peanut butter', 'C', 'peanut', 588, 20, { d: 1.1, a: ['smooth peanut butter', 'crunchy peanut butter'] }],
  ['Almond butter', 'C', 'treeNut', 614, 19, { d: 1.1 }],
  ['Tahini', 'C', 'sesame', 595, 21, { d: 1.1, a: ['sesame paste', 'tahina'] }],
  ['Honey', 'C', 'animal', 304, 82, { d: 1.4, a: ['runny honey'] }],
  ['Maple syrup', 'C', '', 260, 67, { d: 1.3 }],
  ['Dijon mustard', 'C', '', 66, 5, { d: 1.1, a: ['mustard', 'wholegrain mustard'] }],
  ['Mayonnaise', 'C', 'egg', 680, 1, { d: 0.95, a: ['mayo'] }],
  ['Ketchup', 'C', '', 112, 26, { d: 1.15, a: ['tomato ketchup'] }],
  ['Sweet corn', 'C', '', 86, 19, { u: 200, a: ['corn', 'corn kernel', 'sweetcorn'] }],
  ['Roasted red peppers', 'C', '', 30, 5, { a: ['jarred roasted peppers'] }],
  ['Sun-dried tomatoes', 'C', '', 213, 23, { a: ['sundried tomato'] }],
  ['Pesto', 'C', 'dairy treeNut', 450, 6, { d: 1, a: ['basil pesto'] }],
  ['Red wine vinegar', 'C', '', 19, 0, { d: 1 }],
  ['White wine vinegar', 'C', '', 19, 0, { d: 1 }],
  ['Balsamic vinegar', 'C', '', 88, 17, { d: 1.1, a: ['balsamic'] }],
  ['Apple cider vinegar', 'C', '', 21, 1, { d: 1, a: ['cider vinegar'] }],
  ['Jam', 'C', '', 250, 65, { d: 1.3, a: ['jelly', 'preserves'] }],

  // International aisle
  ['White miso paste', 'I', '', 199, 26, { d: 1.2, a: ['white miso', 'miso', 'miso paste', 'shiro miso'] }],
  ['Sesame oil', 'I', 'sesame', 884, 0, { d: 0.92, a: ['toasted sesame oil'] }],
  ['Sesame seeds', 'I', 'sesame', 573, 23, { d: 0.6, a: ['toasted sesame seeds', 'white sesame seeds'] }],
  ['Fish sauce', 'I', 'fish', 35, 4, { d: 1.2 }],
  ['Oyster sauce', 'I', 'shellfish', 51, 11, { d: 1.2 }],
  ['Hoisin sauce', 'I', 'sesame', 220, 44, { d: 1.2, a: ['hoisin'] }],
  ['Sriracha', 'I', '', 93, 19, { d: 1.1, a: ['chili sauce', 'hot sauce'] }],
  ['Gochujang', 'I', 'gluten', 190, 40, { d: 1.2 }],
  ['Thai red curry paste', 'I', 'shellfish', 110, 12, { d: 1.1, a: ['red curry paste', 'curry paste', 'green curry paste'] }],
  ['Rice vinegar', 'I', '', 18, 0, { d: 1, a: ['rice wine vinegar'] }],
  ['Mirin', 'I', 'alcohol', 241, 43, { d: 1.1 }],
  ['Sake', 'I', 'alcohol', 134, 5, { d: 1 }],
  ['Nori', 'I', '', 35, 5, { u: 3, a: ['nori sheet', 'seaweed'] }],
  ['Kimchi', 'I', 'fish', 15, 2 ],
  ['Harissa', 'I', '', 150, 12, { d: 1.1, a: ['harissa paste'] }],
  ['Tortilla chips', 'I', '', 489, 63, { a: ['corn chips', 'nachos'] }],
  ['Chipotle in adobo', 'I', '', 60, 10, { a: ['chipotle', 'chipotle pepper'] }],

  // Spices & dried herbs
  ['Smoked paprika', 'S', '', 282, 54, { d: 0.46, a: ['pimentón', 'pimenton', 'sweet smoked paprika'] }],
  ['Paprika', 'S', '', 282, 54, { d: 0.46, a: ['sweet paprika'] }],
  ['Ground cumin', 'S', '', 375, 44, { d: 0.42, a: ['cumin', 'cumin powder'] }],
  ['Cumin seeds', 'S', '', 375, 44, { d: 0.42 }],
  ['Dried oregano', 'S', '', 265, 69, { d: 0.2, a: ['oregano'] }],
  ['Bay leaves', 'S', '', 313, 75, { u: 0.2, a: ['bay leaf'] }],
  ['Cinnamon', 'S', '', 247, 81, { d: 0.54, a: ['ground cinnamon', 'cinnamon stick'] }],
  ['Chili flakes', 'S', '', 318, 57, { d: 0.4, a: ['red pepper flakes', 'crushed red pepper', 'chilli flakes'] }],
  ['Chili powder', 'S', '', 282, 50, { d: 0.5, a: ['chilli powder'] }],
  ['Curry powder', 'S', '', 325, 58, { d: 0.42, a: ['mild curry powder', 'madras curry powder'] }],
  ['Garam masala', 'S', '', 379, 45, { d: 0.42 }],
  ['Turmeric', 'S', '', 312, 67, { d: 0.5, a: ['ground turmeric'] }],
  ['Ground coriander', 'S', '', 298, 55, { d: 0.35, a: ['coriander powder', 'coriander seeds'] }],
  ['Cayenne pepper', 'S', '', 318, 57, { d: 0.45, a: ['cayenne'] }],
  ['Nutmeg', 'S', '', 525, 49, { d: 0.45, a: ['ground nutmeg'] }],
  ['Italian seasoning', 'S', '', 259, 64, { d: 0.2, a: ['mixed herbs', 'herbes de provence'] }],
  ['Garlic powder', 'S', '', 331, 73, { d: 0.5, a: ['granulated garlic'] }],
  ['Onion powder', 'S', '', 341, 79, { d: 0.5 }],
  ['Ground ginger', 'S', '', 335, 72, { d: 0.45 }],
  ['Cardamom', 'S', '', 311, 68, { d: 0.45, a: ['cardamom pod', 'ground cardamom'] }],
  ['Ground cloves', 'S', '', 274, 66, { d: 0.45, a: ['whole cloves'] }],
  ['Star anise', 'S', '', 337, 50, { u: 1 }],
  ['Saffron', 'S', '', 310, 65, { u: 0.1, a: ['saffron threads', 'pinch of saffron'] }],
  ['Fennel seeds', 'S', '', 345, 52, { d: 0.4 }],
  ['Mustard seeds', 'S', '', 508, 28, { d: 0.6 }],
  ['Allspice', 'S', '', 263, 72, { d: 0.45 }],
  ['Sumac', 'S', '', 290, 70, { d: 0.5 }],
  ['Za’atar', 'S', 'sesame', 300, 50, { d: 0.4, a: ['zaatar', 'za\'atar'] }],
  ['Black pepper', 'S', '', 251, 64, { d: 0.5, a: ['pepper', 'ground black pepper', 'freshly ground black pepper', 'peppercorn'] }],
  ['Salt', 'S', '', 0, 0, { d: 1.2, a: ['fine salt', 'sea salt', 'kosher salt', 'table salt', 'flaky salt', 'sea salt flakes'] }],

  // Baking
  ['All-purpose flour', 'K', 'gluten', 364, 76, { d: 0.53, a: ['flour', 'plain flour', 'white flour'] }],
  ['Bread flour', 'K', 'gluten', 361, 72, { d: 0.53, a: ['strong white flour'] }],
  ['Whole wheat flour', 'K', 'gluten', 340, 72, { d: 0.5, a: ['wholemeal flour'] }],
  ['Sugar', 'K', '', 387, 100, { d: 0.85, a: ['white sugar', 'granulated sugar', 'caster sugar'] }],
  ['Brown sugar', 'K', '', 380, 98, { d: 0.9, a: ['light brown sugar', 'dark brown sugar', 'muscovado sugar'] }],
  ['Powdered sugar', 'K', '', 389, 100, { d: 0.5, a: ['icing sugar', 'confectioners sugar'] }],
  ['Baking soda', 'K', '', 0, 0, { d: 0.9, a: ['bicarbonate of soda', 'bicarb', 'bicarbonate soda'] }],
  ['Baking powder', 'K', '', 53, 28, { d: 0.9 }],
  ['Cornstarch', 'K', '', 381, 91, { d: 0.54, a: ['cornflour', 'corn starch'] }],
  ['Yeast', 'K', '', 325, 41, { d: 0.6, a: ['dried yeast', 'instant yeast', 'active dry yeast'] }],
  ['Vanilla extract', 'K', '', 288, 13, { d: 0.9, a: ['vanilla', 'vanilla essence', 'vanilla bean paste'] }],
  ['Cocoa powder', 'K', '', 228, 58, { d: 0.4, a: ['cocoa', 'unsweetened cocoa'] }],
  ['Dark chocolate', 'K', '', 546, 61, { a: ['chocolate', 'bittersweet chocolate'] }],
  ['Chocolate chips', 'K', 'dairy', 480, 64, { d: 0.6, a: ['chocolate chip'] }],
  ['Almonds', 'K', 'treeNut', 579, 22, { d: 0.6, a: ['almond', 'flaked almond', 'slivered almond'], g: ['nut'] }],
  ['Almond flour', 'K', 'treeNut', 571, 21, { d: 0.45, a: ['ground almonds', 'almond meal'] }],
  ['Walnuts', 'K', 'treeNut', 654, 14, { d: 0.5, a: ['walnut'], g: ['nut'] }],
  ['Pecans', 'K', 'treeNut', 691, 14, { d: 0.5, a: ['pecan'], g: ['nut'] }],
  ['Cashews', 'K', 'treeNut', 553, 30, { d: 0.6, a: ['cashew', 'cashew nut'], g: ['nut'] }],
  ['Pistachios', 'K', 'treeNut', 560, 28, { d: 0.6, a: ['pistachio'], g: ['nut'] }],
  ['Hazelnuts', 'K', 'treeNut', 628, 17, { d: 0.6, a: ['hazelnut'], g: ['nut'] }],
  ['Pine nuts', 'K', 'treeNut', 673, 13, { d: 0.6, a: ['pine nut'], g: ['nut'] }],
  ['Peanuts', 'K', 'peanut', 567, 16, { d: 0.6, a: ['peanut', 'roasted peanuts'], g: ['nut'] }],
  ['Walnut oil', 'K', 'treeNut', 884, 0, { d: 0.92 }],
  ['Raisins', 'K', '', 299, 79, { d: 0.6, a: ['sultanas'] }],
  ['Dried cranberries', 'K', '', 308, 82, { d: 0.6 }],
  ['Desiccated coconut', 'K', '', 660, 24, { d: 0.35, a: ['shredded coconut'] }],
  ['Panko breadcrumbs', 'K', 'gluten', 395, 75, { d: 0.25, a: ['panko', 'breadcrumbs', 'dried breadcrumbs'] }],
  ['Gelatin', 'K', 'animal', 335, 0, { a: ['gelatine', 'gelatin sheet'] }],

  // Frozen
  ['Frozen peas', 'F', '', 81, 14, { a: ['peas', 'green peas', 'petits pois'] }],
  ['Frozen spinach', 'F', '', 29, 4 ],
  ['Frozen berries', 'F', '', 50, 12, { a: ['mixed berries'] }],
  ['Puff pastry', 'F', 'gluten dairy', 558, 46, { u: 320, a: ['puff pastry sheet'] }],
  ['Frozen edamame', 'F', '', 121, 9, { a: ['edamame'] }],
  ['Ice cream', 'F', 'dairy egg', 207, 24, { d: 0.55, a: ['vanilla ice cream'] }],

  // Drinks
  ['Dry white wine', 'R', 'alcohol', 82, 3, { d: 1, a: ['white wine'] }],
  ['Red wine', 'R', 'alcohol', 85, 3, { d: 1, a: ['dry red wine'] }],
  ['Beer', 'R', 'alcohol gluten', 43, 4, { d: 1, a: ['lager', 'ale', 'stout'] }],
  ['Dry sherry', 'R', 'alcohol', 120, 1, { d: 1, a: ['sherry'] }],
  ['Rum', 'R', 'alcohol', 231, 0, { d: 0.95, a: ['dark rum'] }],
  ['Orange juice', 'R', '', 45, 10, { d: 1.04 }],
  ['Coconut water', 'R', '', 19, 4, { d: 1 }],

  // Other
  ['Water', 'O', '', 0, 0, { d: 1, a: ['cold water', 'boiling water', 'warm water', 'hot water', 'ice water'] }],
  ['Olive oil', 'O', '', 884, 0, { d: 0.91, a: ['extra-virgin olive oil', 'extra virgin olive oil', 'evoo', 'light olive oil'] }],
  ['Vegetable oil', 'O', '', 884, 0, { d: 0.92, a: ['neutral oil', 'canola oil', 'sunflower oil', 'rapeseed oil', 'oil'] }],
  ['Coconut oil', 'O', '', 862, 0, { d: 0.92 }],
  ['Foil', 'O', '', 0, 0, { u: 0, a: ['aluminium foil', 'aluminum foil', 'kitchen foil'] }],
  ['Baking paper', 'O', '', 0, 0, { u: 0, a: ['parchment paper', 'parchment'] }],
  ['Ice', 'O', '', 0, 0, { d: 0.92, a: ['ice cube'] }],
];

function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const CATALOG: readonly CatalogItem[] = ROWS.map(([name, section, flags, kcal, carbs, extra = {}]) => {
  const flagList = flags.split(' ').filter((flag) => flag !== '') as DietFlag[];
  if (flagList.some((flag) => ANIMAL.has(flag)) && !flagList.includes('animal')) {
    flagList.push('animal');
  }
  return {
    id: slug(name),
    name,
    aliases: extra.a ?? [],
    section: SECTIONS[section],
    flags: flagList,
    kcalPer100g: kcal,
    carbsPer100g: carbs,
    gramsPerUnit: extra.u,
    densityGPerMl: extra.d,
    groups: extra.g ?? [],
  };
});

const BY_ID = new Map(CATALOG.map((item) => [item.id, item]));

export function catalogItem(id: string | undefined): CatalogItem | undefined {
  return id === undefined ? undefined : BY_ID.get(id);
}
