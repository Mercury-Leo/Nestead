/**
 * The recipe sites a search looks in, by the language of the query.
 *
 * Each one was checked (2026-09-30) by importing real recipe pages with
 * ../import: it answers the importer's fetch and publishes schema.org recipe
 * data, so any hit can be read. Sites that turn the importer away are left out,
 * since their hits could never be imported: Allrecipes, Serious Eats, Simply
 * Recipes and EatingWell answer 402, Taste of Home 403.
 *
 * `recipePage` matches the path of a single recipe, so the same site's
 * collections, articles and category pages are dropped from the results.
 */

export interface RecipeSite {
  domain: string;
  recipePage: RegExp;
  /** The site's name as it ends a page title, where it cannot be told from the domain. */
  brands?: string[];
}

/** Blogs that keep each recipe at /<slug>/. */
const SLUG = /^\/[a-z0-9-]+\/?$/;

export const ENGLISH_SITES: readonly RecipeSite[] = [
  { domain: 'bbcgoodfood.com', recipePage: /^\/recipes\/(?!collection\/)[a-z0-9-]+\/?$/ },
  { domain: 'bbc.co.uk', recipePage: /^\/food\/recipes\/[a-z0-9_]+$/ },
  { domain: 'jamieoliver.com', recipePage: /^\/recipes\/(?!course\/|category\/)[a-z0-9-]+\/[a-z0-9-]+\/?$/ },
  { domain: 'kingarthurbaking.com', recipePage: /^\/recipes\/[a-z0-9-]+-recipe$/ },
  { domain: 'foodnetwork.com', recipePage: /^\/recipes\/(?:[a-z0-9-]+\/)?[a-z0-9-]+-\d+$/ },
  { domain: 'epicurious.com', recipePage: /^\/recipes\/food\/views\/[a-z0-9-]+$/ },
  { domain: 'delish.com', recipePage: /^\/cooking\/recipe-ideas\/a\d+\/[a-z0-9-]+\/?$/ },
  { domain: 'thekitchn.com', recipePage: /^\/[a-z0-9-]+-recipe-\d+$/ },
  { domain: 'onceuponachef.com', recipePage: /^\/recipes\/[a-z0-9-]+\.html$/ },
  { domain: 'recipetineats.com', recipePage: SLUG },
  { domain: 'budgetbytes.com', recipePage: SLUG },
  { domain: 'loveandlemons.com', recipePage: SLUG },
  { domain: 'cookieandkate.com', recipePage: SLUG },
  { domain: 'minimalistbaker.com', recipePage: SLUG },
  { domain: 'sallysbakingaddiction.com', recipePage: SLUG },
  { domain: 'pinchofyum.com', recipePage: SLUG },
];

/** Hebrew slugs arrive percent-encoded, so these match any path segment. */
export const HEBREW_SITES: readonly RecipeSite[] = [
  { domain: 'foody.co.il', recipePage: /^\/foody_recipe\/[^/]+\/?$/ },
  { domain: '10dakot.co.il', recipePage: /^\/recipe\/[^/]+\/?$/, brands: ['מתכונים ב-10 דקות', '10 דקות'] },
  // Recipes sit one or more sections deep: /food-recipes/recipes_column-cakes/chocolate_cakes/Recipe-….htm
  { domain: 'mako.co.il', recipePage: /^\/food[^/]*\/(?:[^/]+\/)+Recipe-[0-9a-f]+\.htm$/i },
  { domain: 'food.walla.co.il', recipePage: /^\/recipe\/\d+$/, brands: ['וואלה אוכל', 'וואלה! אוכל'] },
  { domain: 'lichtenstadt.com', recipePage: /^\/\d{4}\/\d{2}\/[^/]+\/?$/ },
];
