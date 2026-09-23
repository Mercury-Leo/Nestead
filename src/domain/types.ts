/**
 * Domain types. These mirror supabase/schema.sql one-to-one (camelCase here,
 * snake_case there) so a future Supabase backend is a pure mapping exercise.
 */

/** Fields every stored row carries. Timestamps are ISO 8601 strings. */
export interface Base {
  id: string;
  familyId: string;
  createdAt: string;
  updatedAt: string;
}

/** A row as a caller supplies it: the store fills in everything in Base. */
export type NewRow<T extends Base> = Omit<T, keyof Base>;

/** Anything the board orders. See src/domain/position.ts. */
export interface Positioned {
  position: number;
}

export interface Member extends Base {
  name: string;
  /** Hex colour used to tag this person's contributions. */
  color: string;
}

/** A kanban column. Families can add, rename, reorder and delete these. */
export interface BoardColumn extends Base, Positioned {
  name: string;
  /**
   * Tasks in this column count as complete. Kept in sync with Task.done by
   * moveTaskToColumn(), which is the only thing that writes either field.
   */
  isDone: boolean;
}

export interface Task extends Base, Positioned {
  title: string;
  /** A single emoji, stored as text. No icon set, no assets. */
  icon?: string;
  /** Free-form plain-text notes. Shown only when the card is expanded. */
  description?: string;
  /** BoardColumn id. */
  columnId: string;
  /** Member id. */
  assigneeId?: string;
  /**
   * ISO date (YYYY-MM-DD). For a repeating task this is when it next comes
   * round; for a one-off it is simply a deadline.
   */
  dueDate?: string;
  /**
   * Days between occurrences. Absent means the task does not repeat.
   * Completing a repeating task sets dueDate to this many days from now, and
   * it becomes outstanding again when that date arrives. The same row recurs,
   * so a chore can never be duplicated.
   */
  recurEveryDays?: number;
  /** Mirrors the column's isDone. Never written on its own. */
  done: boolean;
  /** Member id. Cleared when that member is deleted. */
  createdBy?: string;
}

/* -------------------------------------------------------------- kitchen -- */
/*
 * Larder, the kitchen feature: recipes, the pantry, the diet profile and the
 * shopping list. Every one of these is shared by the whole family.
 *
 * Nested structures (ingredient lines, steps, list parts, rules) are stored as
 * jsonb in Postgres, so only the top-level keys are snake_cased there.
 */

export type Unit =
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'tsp'
  | 'tbsp'
  | 'cup'
  | 'pinch'
  | 'clove'
  | 'can'
  | 'bunch'
  | 'head'
  | 'slice'
  | 'sheet'
  | null;

export type StoreSection =
  | 'Produce'
  | 'Meat & fish'
  | 'Dairy & eggs'
  | 'Bakery'
  | 'Grains & pasta'
  | 'Cans & jars'
  | 'International aisle'
  | 'Spices & dried herbs'
  | 'Baking'
  | 'Frozen'
  | 'Drinks'
  | 'Other';

export type DietFlag =
  | 'meat'
  | 'poultry'
  | 'pork'
  | 'fish'
  | 'shellfish'
  | 'dairy'
  | 'egg'
  | 'gluten'
  | 'peanut'
  | 'treeNut'
  | 'sesame'
  | 'alcohol'
  | 'animal';

export interface IngredientLine {
  id: string;
  qty: number | null;
  qtyMax?: number;
  unit: Unit;
  item: string;
  note?: string;
  canonicalId?: string;
  raw?: string;
  /** The parser could not read an amount, e.g. "a handful of basil". */
  needsFix?: boolean;
}

/** Durations are detected from the text when shown, never stored. */
export interface Step {
  id: string;
  text: string;
  /** A short name for cook mode ("Bake", "Rest and serve"). Optional. */
  title?: string;
  ingredientIds?: string[];
}

export type RecipeSource = { kind: 'mine' } | { kind: 'web'; url: string; site: string };

/**
 * A recipe's content. Library recipes are stored rows (Recipe); recipes found
 * on the web are the same shape with an id but no row until they are saved.
 */
export interface RecipeContent {
  title: string;
  description?: string;
  source: RecipeSource;
  /** Key into DataStore.photos. */
  photoId?: string;
  /** A remote image, for recipes imported from the web. */
  photoUrl?: string;
  servings: number;
  /** e.g. 'slice', for "280 kcal/slice". */
  servingUnit?: string;
  prepMin: number;
  cookMin: number;
  ingredients: IngredientLine[];
  equipment: string[];
  steps: Step[];
  tags: string[];
  kcalPerServing?: number;
  kcalEstimated: boolean;
  sourceRating?: number;
  /** The family's own rating, 1-5. */
  userRating?: number;
}

export interface Recipe extends Base, RecipeContent {
  /** Member id. Cleared when that member is deleted. */
  createdBy?: string;
}

/** Anything the kitchen logic can work on: a stored recipe or a web result. */
export type AnyRecipe = RecipeContent & { id: string; inLibrary?: boolean };

/**
 * Something in the kitchen. 'have' is the pantry ("Have now"); 'staple' is
 * assumed to be there always and never lands on a shopping list.
 */
export interface PantryItem extends Base {
  name: string;
  canonicalId?: string;
  section: StoreSection;
  kind: 'have' | 'staple';
}

export type PresetId =
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'lowCarb'
  | 'glutenFree'
  | 'dairyFree'
  | 'nutAllergy'
  | 'eggAllergy'
  | 'shellfishAllergy'
  | 'halal'
  | 'kosher';

export interface CustomDietRule {
  id: string;
  label: string;
  terms: string[];
  hint: string;
}

/** One per family: the rules every search and import is checked against. */
export interface DietProfile extends Base {
  presets: Partial<Record<PresetId, boolean>>;
  custom: CustomDietRule[];
  conflictMode: 'hide' | 'warn';
}

export interface ListPart {
  recipeId: string;
  /** Kept so the list still reads well if the recipe is deleted. */
  recipeTitle: string;
  qty: number | null;
  unit: Unit;
}

export interface ListItem extends Base {
  name: string;
  canonicalId?: string;
  section: StoreSection;
  parts: ListPart[];
  checked: boolean;
}
