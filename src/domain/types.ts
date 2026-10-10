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
   * Days between occurrences. At most one of this and recurEveryMonths is set;
   * neither means the task does not repeat. Completing a repeating task moves
   * dueDate to the next date on its schedule, and it becomes outstanding again
   * when that date arrives. The same row recurs, so a chore can never be
   * duplicated. See src/features/board/recurrence.ts.
   */
  recurEveryDays?: number;
  /** Calendar months between occurrences: the 5th stays the 5th. */
  recurEveryMonths?: number;
  /**
   * ISO date the schedule counts from: the due date the family set. Kept apart
   * from dueDate so a chore on the 31st returns to the 31st after February.
   */
  recurFrom?: string;
  /**
   * Ticked. Written by the tick, an untick, a repeat coming back and a restore
   * (src/features/board/actions.ts); never copied from the column.
   */
  done: boolean;
  /** When it was ticked; absent while open. Orders the Done fold and drives auto-clear. */
  doneAt?: string;
  /** The TaskCompletion this tick created, so an untick removes exactly that one. */
  completionId?: string;
  /** Member id. Cleared when that member is deleted. */
  createdBy?: string;
}

/**
 * One tick of a task, kept after the task is cleared from the board. Listed by
 * the History page (src/features/board/history/), never by the board.
 */
export interface TaskCompletion extends Base {
  /** The task it was for. It may since have been cleared or deleted. */
  taskId: string;
  /** Copies taken at the tick, so a cleared task can be restored from them. */
  title: string;
  icon?: string;
  description?: string;
  columnId?: string;
  assigneeId?: string;
  /** Who ticked it. Absent for entries the migration backfilled, or once that member is deleted. */
  memberId?: string;
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
  | 'peanutAllergy'
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

/**
 * Something to buy. Recipes put groceries on the list; anything else is added
 * by hand ("manual"), and every item sits in one of the list's groups.
 */
export interface ListItem extends Base {
  name: string;
  canonicalId?: string;
  /** The supermarket aisle, from the catalog. Only Supermarket is split by it. */
  section: StoreSection;
  /**
   * 'supermarket', 'general' or a ListGroup id. Absent on rows written before
   * groups existed, which were all from recipes: they read as Supermarket.
   */
  groupId?: string;
  /** One per recipe that needs this. Empty for something added by hand. */
  parts: ListPart[];
  /** Free text, e.g. "2 packs". Shown beside what the recipes add up to. */
  note?: string;
  /**
   * Added by hand, so it stays when the last recipe that also needs it comes
   * off the list. Recipe-only items go with their recipes.
   */
  manual?: boolean;
  checked: boolean;
}

/**
 * A group on the shopping list that the family made, e.g. "Chemist".
 *
 * The two built-in groups, Supermarket and General, are not groups the family
 * made, but each gets a row the first time it is moved, only to hold its
 * position. Those rows carry `builtin` and are never renamed or deleted.
 */
export interface ListGroup extends Base {
  name: string;
  /**
   * Order among all the groups, built-in ones included. Absent on rows written
   * before groups could be reordered: see orderGroups() in kitchen/list.ts.
   */
  position?: number;
  /** Set on the row that holds Supermarket's or General's position. */
  builtin?: 'supermarket' | 'general';
}

/* ----------------------------------------------------------- activities -- */

export type ShowKind = 'movie' | 'series';

/** `dropped`: the family decided not to watch it. */
export type ShowStatus = 'to-watch' | 'watching' | 'watched' | 'dropped';

/**
 * A movie or series on the family's list. Its details (from /api/shows) are
 * saved when it is added, so the list never fetches them; they change only
 * when someone refreshes that one show (see refreshPatch() in shows.ts). One
 * row per imdbId per family.
 */
export interface Show extends Base {
  /** IMDb's id, "tt1375666". */
  imdbId: string;
  kind: ShowKind;
  title: string;
  /** A short plot. */
  plot?: string;
  /** A link to the poster on an image host (Amazon's today). The image itself is never stored. */
  posterUrl?: string;
  /** ISO date (YYYY-MM-DD); 1 January of the year when the service has no date. */
  released?: string;
  /** The first year: a series running 2008–2013 is 2008. */
  year?: number;
  runtimeMin?: number;
  /** Series only. */
  totalSeasons?: number;
  /** 0 to 10. */
  imdbRating?: number;
  /**
   * In English, as the service names them ("Action", "Sci-Fi"); screens
   * translate them. Empty when the details were read and named none; absent
   * on a show added before genres were saved, until its details are read again.
   */
  genres?: string[];
  /**
   * The family's own labels ("Bad movie"), kept as typed and never translated.
   * Absent counts as none; removing the last one writes [], since the backend's
   * column is not null.
   */
  tags?: string[];
  /** ISO timestamp of the read these details came from. */
  fetchedAt: string;
  status: ShowStatus;
  /** ISO timestamp: set when the status becomes watched, cleared when it leaves it. */
  watchedAt?: string;
  /** A family favourite, one they would watch again. Absent counts as false; unstarring writes false. */
  favorite?: boolean;
  /** Member id. Cleared when that member is deleted. */
  createdBy?: string;
}

/**
 * What family_ai_status() returns, as any member may see it: never the key or
 * its ciphertext. family_ai_settings and ai_usage have no row type here on
 * purpose: no client can read them (supabase/schema.sql).
 */
export interface AiStatus {
  /** Absent when the family has no key of its own and reads on the free models. */
  key?: {
    /** The last four characters of the key, to tell keys apart. */
    hint: string;
    /** Absent: the free models. */
    model?: string;
    /** Absent when the member who added the key has left. */
    setByName?: string;
    /** ISO timestamp. */
    updatedAt: string;
  };
  /**
   * The signed-in member's free reads today (UTC). `left` is the lesser of
   * their own and the app's remaining reads.
   */
  free: { used: number; limit: number; left: number };
}

/**
 * A place the family goes, for the address book. Navigation links are built
 * from the street and city only (src/domain/addresses/links.ts): the apartment
 * and door code never leave the app.
 */
export interface Address extends Base {
  /** What the family calls it, e.g. "Dana's house". */
  name: string;
  city: string;
  /** Street and house number, as one line: "Herzl 12". */
  street: string;
  apartment?: string;
  doorCode?: string;
  /** Member id. Cleared when that member is deleted. */
  createdBy?: string;
}
