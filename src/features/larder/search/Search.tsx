import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpDown, Eye, EyeOff, Globe, Milk, Search as SearchIcon, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../../../components/PageHeader';
import { Button, RemovableChip, Segmented, SelectButton, Sheet, Switch, cx } from '../../../components/ui';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { activeFilters, defaultFilters, search, suggestions, SORT_SHORT, TIME_LABELS } from '../../../domain/kitchen/search';
import type { SearchFilters, SearchHit, SearchQuery, SortKey } from '../../../domain/kitchen/search';
import { useKitchen } from '../KitchenContext';
import { RecipeCard, RecipeGrid, RecipeList, RecipeRow } from '../recipe/RecipeCard';
import { recipeView } from '../recipe/recipeView';
import { FilterControls } from './FilterControls';
import { NameBox, TokenBox } from './TokenBox';
import s from './Search.module.css';

const SORTED_BY: Record<SortKey, string> = {
  fit: 'best pantry fit',
  fewest: 'fewest items to buy',
  rating: 'star rating',
  kcal: 'calories',
  time: 'total time',
};

function listJoin(parts: string[], last = 'and'): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} ${last} ${parts[parts.length - 1]}`;
}

/** "with 0 items to buy and under 30 min", as bold phrases. */
function filterPhrases(filters: SearchFilters): string[] {
  const phrases: string[] = [];
  if (filters.maxBuy !== null) {
    phrases.push(filters.maxBuy === 0 ? '0 items to buy' : `at most ${filters.maxBuy} to buy`);
  }
  for (const bucket of filters.time) phrases.push(TIME_LABELS[bucket].toLowerCase());
  if (filters.minRating !== null) phrases.push(`a rating of ${filters.minRating}+`);
  if (filters.kcalMax < 800) phrases.push(`up to ${filters.kcalMax} kcal`);
  if (filters.kcalMin > 200) phrases.push(`at least ${filters.kcalMin} kcal`);
  if (!filters.library) phrases.push('web recipes only');
  if (!filters.web) phrases.push('library recipes only');
  return phrases;
}

export function Search(): JSX.Element {
  const kitchen = useKitchen();
  const desktop = useIsDesktop();
  const [params] = useSearchParams();

  const [mode, setMode] = useState<SearchQuery['mode']>('ingredients');
  const [tokens, setTokens] = useState<string[]>(() =>
    (params.get('q') ?? '').split(',').map((t) => t.trim()).filter((t) => t !== ''),
  );
  const [text, setText] = useState('');
  const [pantry, setPantry] = useState(params.get('pantry') === '1' || params.has('q'));
  const [baseFilters, setBaseFilters] = useState<SearchFilters>(() => defaultFilters());
  // Until someone picks, conflicts follow the profile's own setting.
  const [conflict, setConflict] = useState<'hide' | 'warn' | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<SearchFilters | null>(null);

  const filters: SearchFilters = { ...baseFilters, conflictMode: conflict ?? kitchen.profile?.conflictMode ?? 'hide' };
  const setFilters = (next: SearchFilters): void => {
    setBaseFilters(next);
    setConflict(next.conflictMode);
  };

  const query: SearchQuery = { mode, tokens, text, pantry };
  const ctx = useMemo(
    () => ({
      library: kitchen.recipes.map((recipe) => ({ ...recipe, inLibrary: true })),
      web: kitchen.web,
      pantry: kitchen.pantry,
      profile: kitchen.profile,
    }),
    [kitchen.recipes, kitchen.web, kitchen.pantry, kitchen.profile],
  );

  const outcome = search(query, filters, ctx);
  const empty = outcome.results.length === 0;
  const loosen = empty ? suggestions(query, filters, ctx) : [];
  const active = activeFilters(filters);

  const views = (hits: SearchHit[]) =>
    hits.map((hit) => recipeView(hit.recipe, kitchen.pantry, kitchen.profile, { fit: hit.fit, diet: hit.diet }));

  const apply = (next: SearchQuery, nextFilters: SearchFilters): void => {
    setMode(next.mode);
    setTokens(next.tokens);
    setText(next.text);
    setPantry(next.pantry);
    setFilters(nextFilters);
  };

  const described =
    mode === 'ingredients' ? (tokens.length > 0 ? tokens.join(', ') : null) : text.trim() !== '' ? `“${text.trim()}”` : null;
  const plural = (n: number): string => `${n} recipe${n === 1 ? '' : 's'}`;
  const hiddenThings = [...new Set(outcome.hidden.flatMap((hit) => hit.diet.things))];

  const pantryCard = (
    <div className={s.pantryCard}>
      <Milk size={22} strokeWidth={2} aria-hidden className={s.pantryIcon} />
      <div className={s.pantryText}>
        <span className={s.pantryTitle}>Cook from my pantry</span>
        <span className={s.pantrySub}>
          {desktop
            ? `Ranking by fit with your ${kitchen.pantry.haveCount} pantry items + ${kitchen.pantry.stapleCount} staples`
            : 'Ranked by what you already have'}
        </span>
      </div>
      <Switch label="Cook from my pantry" checked={pantry} onChange={setPantry} />
    </div>
  );

  const hiddenNotice =
    outcome.hidden.length > 0 &&
    !empty &&
    (desktop ? (
      <div className={s.hidden} role="status">
        <EyeOff size={22} strokeWidth={2} aria-hidden className={s.hiddenIcon} />
        <p className={s.hiddenText}>
          <strong>
            {plural(outcome.hidden.length)} hidden
          </strong>{' '}
          by your diet profile —{' '}
          {listJoin(outcome.hidden.map((hit) => `${hit.recipe.title} (${hit.diet.things.join(', ')})`))}.
        </p>
        <Button variant="secondary" icon={Eye} onClick={() => setConflict('warn')}>
          Show anyway
        </Button>
      </div>
    ) : (
      <div className={s.hiddenCompact} role="status">
        <EyeOff size={20} strokeWidth={2} aria-hidden />
        <span className={s.hiddenCompactText}>{outcome.hidden.length} hidden by your diet profile</span>
        <button type="button" className={s.linkButton} onClick={() => setConflict('warn')}>
          Show anyway
        </button>
      </div>
    ));

  const noResults = (
    <div className={s.noResults}>
      <span className={s.noArt} aria-hidden>
        <SearchIcon size={40} strokeWidth={1.8} />
      </span>
      <h2 className={s.noTitle}>No recipes match yet</h2>
      <p className={s.noBody}>
        Nothing matches {described !== null ? <strong>{described}</strong> : 'this search'}
        {filterPhrases(filters).length > 0 && (
          <>
            {' '}with{' '}
            {filterPhrases(filters).map((phrase, i, all) => (
              <span key={phrase}>
                {i > 0 && (i === all.length - 1 ? ' and ' : ', ')}
                <strong>{phrase}</strong>
              </span>
            ))}
          </>
        )}
        . {loosen.length > 0 ? 'Loosen a filter to see more:' : 'Try other ingredients, or add a recipe of your own.'}
      </p>
      {loosen.length > 0 && (
        <ul className={s.loosen}>
          {loosen.map((option) => (
            <li key={option.label}>
              <button type="button" className={s.loosenButton} onClick={() => apply(option.query, option.filters)}>
                <span>{option.label}</span>
                <span className={s.loosenCount}>
                  {plural(option.count)} <ArrowRight size={16} strokeWidth={2.2} aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {outcome.hidden.length > 0 && (
        <p className={s.noHidden}>
          {outcome.hidden.length} more {outcome.hidden.length === 1 ? 'recipe is' : 'recipes are'} hidden by your diet profile (contains{' '}
          {listJoin(hiddenThings)}). <Link to="/profile">Review profile</Link>
        </p>
      )}
    </div>
  );

  const results = desktop ? (
    <RecipeGrid dense>
      {views(outcome.results).map((view) => (
        <RecipeCard key={view.recipe.id} view={view} showNeed />
      ))}
    </RecipeGrid>
  ) : (
    <RecipeList>
      {views(outcome.results).map((view) => (
        <RecipeRow key={view.recipe.id} view={view} showNeed />
      ))}
    </RecipeList>
  );

  const openSheet = (): void => {
    setDraft(filters);
    setSheetOpen(true);
  };
  const draftCount = draft === null ? 0 : search(query, draft, ctx).results.length;

  return (
    <div>
      <PageHeader title="Search" />

      <div className={cx(s.boxWrap, mode === 'ingredients' && tokens.length === 0 && s.boxEmpty)}>
        {mode === 'ingredients' ? <TokenBox tokens={tokens} onChange={setTokens} /> : <NameBox value={text} onChange={setText} />}
      </div>

      <div className={s.controls}>
        {desktop && (
          <Segmented
            label="Search by"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'ingredients', label: 'By ingredients' },
              { value: 'name', label: 'By recipe name' },
            ]}
          />
        )}
        {pantryCard}
        {desktop && (
          <p className={s.searching}>
            <Globe size={16} strokeWidth={2} aria-hidden /> Searching your library and the web
          </p>
        )}
        {!desktop && (
          <Segmented
            label="Search by"
            className={s.full}
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'ingredients', label: 'By ingredients' },
              { value: 'name', label: 'By recipe name' },
            ]}
          />
        )}
      </div>

      {desktop && empty && active.length > 0 && (
        <div className={s.active}>
          <span className={s.activeLabel}>Active filters</span>
          {active.map((filter) => (
            <RemovableChip key={filter.key} tone="dark" removeLabel={`Remove ${filter.label}`} onRemove={() => setFilters(filter.without(filters))}>
              {filter.label}
            </RemovableChip>
          ))}
        </div>
      )}

      {desktop ? (
        <div className={s.layout}>
          <aside className={s.panel} aria-label="Filters">
            <div className={s.panelHead}>
              <h2 className={s.panelTitle}>
                <SlidersHorizontal size={20} strokeWidth={2} aria-hidden /> Filters
              </h2>
              <button type="button" className={s.linkButton} onClick={() => setFilters(defaultFilters(kitchen.profile?.conflictMode ?? 'hide'))}>
                Reset
              </button>
            </div>
            <FilterControls layout="panel" filters={filters} onChange={setFilters} profile={kitchen.profile} />
          </aside>
          <section className={s.results} aria-live="polite">
            {empty ? (
              noResults
            ) : (
              <>
                <header className={s.resultsHead}>
                  <h2 className={s.resultsTitle}>
                    {plural(outcome.results.length)}
                    {described !== null && ` for ${described}`}
                  </h2>
                  <p className={s.sortedBy}>
                    Sorted by <strong>{SORTED_BY[filters.sort]}</strong>
                  </p>
                </header>
                {hiddenNotice}
                {results}
              </>
            )}
          </section>
        </div>
      ) : (
        <>
          <div className={s.mobileBar}>
            <Button variant="secondary" icon={SlidersHorizontal} onClick={openSheet}>
              Filters{active.length > 0 ? ` · ${active.length}` : ''}
            </Button>
            <SelectButton
              label="Sort by"
              icon={ArrowUpDown}
              value={filters.sort}
              onChange={(sort) => setFilters({ ...filters, sort })}
              options={(Object.keys(SORT_SHORT) as SortKey[]).map((key) => ({ value: key, label: SORT_SHORT[key] }))}
              className={s.sortSelect}
            />
            {!empty && <span className={s.count}>{outcome.results.length} results</span>}
          </div>
          <section aria-live="polite" className={s.mobileResults}>
            {hiddenNotice}
            {empty ? noResults : results}
          </section>
          <Sheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title="Filters"
            footer={
              <>
                <Button variant="secondary" size="bar" onClick={() => setDraft(defaultFilters(kitchen.profile?.conflictMode ?? 'hide'))}>
                  Reset
                </Button>
                <Button
                  variant="primary"
                  size="bar"
                  block
                  onClick={() => {
                    if (draft !== null) setFilters(draft);
                    setSheetOpen(false);
                  }}
                >
                  Show {plural(draftCount)}
                </Button>
              </>
            }
          >
            {draft !== null && <FilterControls layout="sheet" filters={draft} onChange={setDraft} profile={kitchen.profile} />}
          </Sheet>
        </>
      )}
    </div>
  );
}
