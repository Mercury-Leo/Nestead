import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpDown, BookOpen, ChevronRight, Link2, Milk, Plus, Search as SearchIcon } from 'lucide-react';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { PageHeader } from '../../../components/PageHeader';
import { ButtonLink, Chip, EmptyState, IconButton, Segmented, SelectButton, TextField } from '../../../components/ui';
import { totalMinutes } from '../../../domain/kitchen/search';
import { useKitchen } from '../KitchenContext';
import { RecipeCard, RecipeGrid, RecipeList, RecipeRow } from '../recipe/RecipeCard';
import { recipeView } from '../recipe/recipeView';
import type { RecipeView } from '../recipe/recipeView';
import s from './Library.module.css';

type Source = 'all' | 'mine' | 'web';
type LibrarySort = 'recent' | 'rating' | 'time' | 'kcal' | 'fewest';

const SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'rating', label: 'Rating' },
  { value: 'time', label: 'Total time' },
  { value: 'kcal', label: 'Calories' },
  { value: 'fewest', label: 'Fewest to buy' },
];

const SORT_SHORT: Record<LibrarySort, string> = {
  recent: 'Recent',
  rating: 'Rating',
  time: 'Time',
  kcal: 'Calories',
  fewest: 'To buy',
};

function sortViews(views: RecipeView[], sort: LibrarySort): RecipeView[] {
  const byRating = (a: RecipeView, b: RecipeView): number => (b.rating ?? 0) - (a.rating ?? 0);
  const sorted = [...views];
  switch (sort) {
    case 'recent':
      return sorted;
    case 'rating':
      return sorted.sort(byRating);
    case 'time':
      return sorted.sort((a, b) => totalMinutes(a.recipe) - totalMinutes(b.recipe));
    case 'kcal':
      return sorted.sort((a, b) => (a.recipe.kcalPerServing ?? Infinity) - (b.recipe.kcalPerServing ?? Infinity));
    case 'fewest':
      return sorted.sort((a, b) => a.fit.missing - b.fit.missing || byRating(a, b));
  }
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function Library(): JSX.Element {
  const kitchen = useKitchen();
  const desktop = useIsDesktop();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<Source>('all');
  const [sort, setSort] = useState<LibrarySort>('recent');

  // The library never hides a conflicting recipe; it badges it instead.
  const views = useMemo(
    () => kitchen.recipes.map((recipe) => recipeView({ ...recipe, inLibrary: true }, kitchen.pantry, kitchen.profile)),
    [kitchen.recipes, kitchen.pantry, kitchen.profile],
  );

  const mine = views.filter((view) => view.recipe.source.kind === 'mine').length;
  const web = views.length - mine;
  const ready = views.filter((view) => view.fit.missing === 0);

  const needle = query.trim().toLowerCase();
  const shown = sortViews(
    views.filter((view) => {
      if (source !== 'all' && view.recipe.source.kind !== source) return false;
      if (needle === '') return true;
      return (
        view.recipe.title.toLowerCase().includes(needle) ||
        view.recipe.ingredients.some((line) => line.item.toLowerCase().includes(needle))
      );
    }),
    sort,
  );

  const plural = (n: number): string => `${n} recipe${n === 1 ? '' : 's'}`;
  const subtitle = desktop
    ? `${plural(views.length)} — ${mine} of your own, ${web} saved from the web.`
    : `${plural(views.length)} · ${mine} yours, ${web} from the web`;

  const actions = desktop ? (
    <>
      <ButtonLink to="/import" variant="secondary" size="lg" icon={Link2}>
        Import from web
      </ButtonLink>
      <ButtonLink to="/add" variant="primary" size="lg" icon={Plus}>
        Add recipe
      </ButtonLink>
    </>
  ) : (
    <>
      <IconButton label="Import from web" icon={Link2} variant="secondary" size={52} onClick={() => navigate('/import')} />
      <IconButton label="Add recipe" icon={Plus} variant="primary" size={52} onClick={() => navigate('/add')} />
    </>
  );

  if (kitchen.loaded && views.length === 0) {
    return (
      <div>
        <PageHeader title="Library" subtitle="Your family’s recipes, all in one place." actions={actions} />
        <EmptyState
          icon={BookOpen}
          title="No recipes yet"
          actions={
            <>
              <ButtonLink to="/add" variant="primary" size="lg" icon={Plus}>
                Add recipe
              </ButtonLink>
              <ButtonLink to="/import" variant="secondary" size="lg" icon={Link2}>
                Import from web
              </ButtonLink>
            </>
          }
        >
          <p>Write down a family favourite or bring one in from a recipe site. Everyone in the family sees the same library.</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Library" subtitle={kitchen.loaded ? subtitle : ' '} actions={actions} />

      <div className={s.toolbar} role="search">
        <TextField
          label="Search the library"
          icon={SearchIcon}
          type="search"
          value={query}
          placeholder={desktop ? 'Search by recipe name or ingredients — e.g. chicken, lemon, rice' : 'Recipe or ingredients…'}
          onChange={(event) => setQuery(event.target.value)}
          wrapClassName={s.search}
        />
        {desktop ? (
          <>
            <Segmented
              label="Source"
              value={source}
              onChange={setSource}
              options={[
                { value: 'all', label: `All ${views.length}` },
                { value: 'mine', label: `Mine ${mine}` },
                { value: 'web', label: `Web ${web}` },
              ]}
            />
            <SelectButton label="Sort by" icon={ArrowUpDown} value={sort} onChange={setSort} options={SORTS} />
          </>
        ) : (
          <div className={s.chips}>
            {(['all', 'mine', 'web'] as const).map((value) => (
              <Chip key={value} selected={source === value} onClick={() => setSource(value)}>
                {value === 'all' ? `All ${views.length}` : value === 'mine' ? `Mine ${mine}` : `Web ${web}`}
              </Chip>
            ))}
            <SelectButton
              label="Sort by"
              icon={ArrowUpDown}
              shape="chip"
              value={sort}
              onChange={setSort}
              options={SORTS}
              display={SORT_SHORT[sort]}
            />
          </div>
        )}
      </div>

      {ready.length > 0 &&
        (desktop ? (
          <section className={s.banner} aria-label="Ready without shopping">
            <span className={s.bannerIcon} aria-hidden>
              <Milk size={24} strokeWidth={2} />
            </span>
            <div className={s.bannerText}>
              <h2 className={s.bannerTitle}>
                You can cook {plural(ready.length)} tonight without shopping
              </h2>
              <p className={s.bannerBody}>
                {listNames(ready.map((view) => view.recipe.title))} use only what’s in your pantry and staples.
              </p>
            </div>
            <ButtonLink to="/search?pantry=1" variant="sage" size="lg" iconAfter={ArrowRight}>
              Cook from my pantry
            </ButtonLink>
          </section>
        ) : (
          <Link to="/search?pantry=1" className={s.bannerCompact}>
            <span className={s.bannerIcon} aria-hidden>
              <Milk size={22} strokeWidth={2} />
            </span>
            <span className={s.bannerText}>
              <span className={s.bannerTitle}>
                {plural(ready.length)} need{ready.length === 1 ? 's' : ''} nothing from the shop
              </span>
              <span className={s.bannerBody}>Cook from my pantry</span>
            </span>
            <ChevronRight size={22} strokeWidth={2} aria-hidden className={s.bannerChevron} />
          </Link>
        ))}

      {shown.length === 0 && kitchen.loaded ? (
        <p className={s.none}>No recipes match “{query}”.</p>
      ) : desktop ? (
        <RecipeGrid>
          {shown.map((view) => (
            <RecipeCard key={view.recipe.id} view={view} />
          ))}
        </RecipeGrid>
      ) : (
        <RecipeList>
          {shown.map((view) => (
            <RecipeRow key={view.recipe.id} view={view} />
          ))}
        </RecipeList>
      )}
    </div>
  );
}
