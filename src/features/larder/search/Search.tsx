import { Fragment, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowUpDown, Eye, EyeOff, Globe, Milk, Search as SearchIcon, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../../../components/PageHeader';
import { Button, ForwardArrow, RemovableChip, Segmented, SelectButton, Sheet, Switch, cx } from '../../../components/ui';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { activeFilters, defaultFilters, search, suggestions } from '../../../domain/kitchen/search';
import type { SearchFilters, SearchHit, SearchQuery, SortKey } from '../../../domain/kitchen/search';
import { formatList, formatListParts } from '../../../i18n';
import { useKitchen } from '../KitchenContext';
import { dietThingWord, sortShort } from '../labels';
import { RecipeCard, RecipeGrid, RecipeList, RecipeRow } from '../recipe/RecipeCard';
import { recipeView } from '../recipe/recipeView';
import { FilterControls } from './FilterControls';
import { activeFilterLabel, filterPhrases, loosenLabel } from './filterLabels';
import { NameBox, TokenBox } from './TokenBox';
import s from './Search.module.css';

const SORT_KEYS: SortKey[] = ['fit', 'fewest', 'rating', 'kcal', 'time'];

export function Search(): JSX.Element {
  const { t } = useTranslation();
  const kitchen = useKitchen();
  const desktop = useIsDesktop();
  const [params] = useSearchParams();

  const [mode, setMode] = useState<SearchQuery['mode']>('ingredients');
  const [tokens, setTokens] = useState<string[]>(() =>
    (params.get('q') ?? '').split(',').map((token) => token.trim()).filter((token) => token !== ''),
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
    mode === 'ingredients'
      ? tokens.length > 0
        ? formatList(tokens, 'unit')
        : null
      : text.trim() !== ''
        ? t('search.quoted', { text: text.trim() })
        : null;
  const thingWords = (hit: SearchHit): string[] => hit.diet.thingKeys.map((thing) => dietThingWord(t, thing));
  const hiddenThings = [...new Set(outcome.hidden.flatMap(thingWords))];
  const phrases = filterPhrases(t, filters);
  // Each phrase bold, the ", " and " and " between them plain. Fragments, not bare strings, so <Trans> keeps them.
  const phraseNodes = formatListParts(phrases).map((part, i) =>
    part.type === 'element' ? <strong key={i}>{part.value}</strong> : <Fragment key={i}>{part.value}</Fragment>,
  );

  const pantryCard = (
    <div className={s.pantryCard}>
      <Milk size={22} strokeWidth={2} aria-hidden className={s.pantryIcon} />
      <div className={s.pantryText}>
        <span className={s.pantryTitle}>{t('search.pantry.title')}</span>
        <span className={s.pantrySub}>
          {desktop
            ? t('search.pantry.sub', { have: kitchen.pantry.haveCount, staples: kitchen.pantry.stapleCount })
            : t('search.pantry.subCompact')}
        </span>
      </div>
      <Switch label={t('search.pantry.title')} checked={pantry} onChange={setPantry} />
    </div>
  );

  const hiddenNotice =
    outcome.hidden.length > 0 &&
    !empty &&
    (desktop ? (
      <div className={s.hidden} role="status">
        <EyeOff size={22} strokeWidth={2} aria-hidden className={s.hiddenIcon} />
        <p className={s.hiddenText}>
          <Trans
            i18nKey="search.hidden"
            count={outcome.hidden.length}
            values={{
              list: formatList(
                outcome.hidden.map((hit) => t('search.hiddenItem', { title: hit.recipe.title, things: formatList(thingWords(hit), 'unit') })),
              ),
            }}
          />
        </p>
        <Button variant="secondary" icon={Eye} onClick={() => setConflict('warn')}>
          {t('search.showAnyway')}
        </Button>
      </div>
    ) : (
      <div className={s.hiddenCompact} role="status">
        <EyeOff size={20} strokeWidth={2} aria-hidden />
        <span className={s.hiddenCompactText}>{t('search.hiddenCompact', { count: outcome.hidden.length })}</span>
        <button type="button" className={s.linkButton} onClick={() => setConflict('warn')}>
          {t('search.showAnyway')}
        </button>
      </div>
    ));

  const noResults = (
    <div className={s.noResults}>
      <span className={s.noArt} aria-hidden>
        <SearchIcon size={40} strokeWidth={1.8} />
      </span>
      <h2 className={s.noTitle}>{t('search.noResults.title')}</h2>
      <p className={s.noBody}>
        <Trans
          i18nKey={
            described !== null
              ? phrases.length > 0
                ? 'search.noResults.queryFiltered'
                : 'search.noResults.query'
              : phrases.length > 0
                ? 'search.noResults.anyFiltered'
                : 'search.noResults.any'
          }
          values={{ query: described ?? '' }}
          components={{ query: <strong />, filters: <>{phraseNodes}</> }}
        />{' '}
        {loosen.length > 0 ? t('search.noResults.loosen') : t('search.noResults.tryOther')}
      </p>
      {loosen.length > 0 && (
        <ul className={s.loosen}>
          {loosen.map((option) => (
            <li key={option.label}>
              <button type="button" className={s.loosenButton} onClick={() => apply(option.query, option.filters)}>
                <span>{loosenLabel(t, option, query, filters)}</span>
                <span className={s.loosenCount}>
                  {t('common.recipes', { count: option.count })} <ForwardArrow size={16} strokeWidth={2.2} aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {outcome.hidden.length > 0 && (
        <p className={s.noHidden}>
          <Trans
            i18nKey="search.noResults.moreHidden"
            count={outcome.hidden.length}
            values={{ things: formatList(hiddenThings) }}
            components={{ link: <Link to="/profile" /> }}
          />
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
      <PageHeader title={t('search.title')} />

      <div className={cx(s.boxWrap, mode === 'ingredients' && tokens.length === 0 && s.boxEmpty)}>
        {mode === 'ingredients' ? <TokenBox tokens={tokens} onChange={setTokens} /> : <NameBox value={text} onChange={setText} />}
      </div>

      <div className={s.controls}>
        {desktop && (
          <Segmented
            label={t('search.searchBy')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'ingredients', label: t('search.byIngredients') },
              { value: 'name', label: t('search.byName') },
            ]}
          />
        )}
        {pantryCard}
        {desktop && (
          <p className={s.searching}>
            <Globe size={16} strokeWidth={2} aria-hidden /> {t('search.searching')}
          </p>
        )}
        {!desktop && (
          <Segmented
            label={t('search.searchBy')}
            className={s.full}
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'ingredients', label: t('search.byIngredients') },
              { value: 'name', label: t('search.byName') },
            ]}
          />
        )}
      </div>

      {desktop && empty && active.length > 0 && (
        <div className={s.active}>
          <span className={s.activeLabel}>{t('search.active.label')}</span>
          {active.map((filter) => {
            const label = activeFilterLabel(t, filter, filters);
            return (
              <RemovableChip
                key={filter.key}
                tone="dark"
                removeLabel={t('search.active.remove', { label })}
                onRemove={() => setFilters(filter.without(filters))}
              >
                {label}
              </RemovableChip>
            );
          })}
        </div>
      )}

      {desktop ? (
        <div className={s.layout}>
          <aside className={s.panel} aria-label={t('search.filters')}>
            <div className={s.panelHead}>
              <h2 className={s.panelTitle}>
                <SlidersHorizontal size={20} strokeWidth={2} aria-hidden /> {t('search.filters')}
              </h2>
              <button type="button" className={s.linkButton} onClick={() => setFilters(defaultFilters(kitchen.profile?.conflictMode ?? 'hide'))}>
                {t('search.reset')}
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
                    {described !== null ? (
                      <Trans i18nKey="search.resultsFor" count={outcome.results.length} values={{ query: described }} />
                    ) : (
                      t('common.recipes', { count: outcome.results.length })
                    )}
                  </h2>
                  <p className={s.sortedBy}>
                    <Trans i18nKey="search.sortedBy" values={{ sort: t(`search.sortedByKey.${filters.sort}`) }} />
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
              {active.length > 0 ? t('search.filtersCount', { count: active.length }) : t('search.filters')}
            </Button>
            <SelectButton
              label={t('search.sortBy')}
              icon={ArrowUpDown}
              value={filters.sort}
              onChange={(sort) => setFilters({ ...filters, sort })}
              options={SORT_KEYS.map((key) => ({ value: key, label: sortShort(t, key) }))}
              className={s.sortSelect}
            />
            {!empty && <span className={s.count}>{t('search.results', { count: outcome.results.length })}</span>}
          </div>
          <section aria-live="polite" className={s.mobileResults}>
            {hiddenNotice}
            {empty ? noResults : results}
          </section>
          <Sheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title={t('search.filters')}
            footer={
              <>
                <Button variant="secondary" size="bar" onClick={() => setDraft(defaultFilters(kitchen.profile?.conflictMode ?? 'hide'))}>
                  {t('search.reset')}
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
                  {t('search.show', { count: draftCount })}
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
