import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowUpDown, BookOpen, Link2, Milk, Plus, Search as SearchIcon } from 'lucide-react';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { PageHeader } from '../../../components/PageHeader';
import { ButtonLink, Chip, EmptyState, ForwardArrow, ForwardChevron, IconButton, Segmented, SelectButton, TextField } from '../../../components/ui';
import { totalMinutes } from '../../../domain/kitchen/search';
import { formatList } from '../../../i18n';
import { useKitchen } from '../KitchenContext';
import { RecipeCard, RecipeGrid, RecipeList, RecipeRow } from '../recipe/RecipeCard';
import { recipeView } from '../recipe/recipeView';
import type { RecipeView } from '../recipe/recipeView';
import s from './Library.module.css';

type Source = 'all' | 'mine' | 'web';
type LibrarySort = 'recent' | 'rating' | 'time' | 'kcal' | 'fewest';

const SORTS: LibrarySort[] = ['recent', 'rating', 'time', 'kcal', 'fewest'];

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

export function Library(): JSX.Element {
  const { t } = useTranslation();
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

  const subtitle = t(desktop ? 'library.subtitle' : 'library.subtitleCompact', { count: views.length, mine, web });
  const sortOptions = SORTS.map((value) => ({ value, label: t(`library.sort.${value}`) }));

  const actions = desktop ? (
    <>
      <ButtonLink to="/import" variant="secondary" size="lg" icon={Link2}>
        {t('library.importFromWeb')}
      </ButtonLink>
      <ButtonLink to="/add" variant="primary" size="lg" icon={Plus}>
        {t('library.addRecipe')}
      </ButtonLink>
    </>
  ) : (
    <>
      <IconButton label={t('library.importFromWeb')} icon={Link2} variant="secondary" size={52} onClick={() => navigate('/import')} />
      <IconButton label={t('library.addRecipe')} icon={Plus} variant="primary" size={52} onClick={() => navigate('/add')} />
    </>
  );

  if (kitchen.loaded && views.length === 0) {
    return (
      <div>
        <PageHeader title={t('library.title')} subtitle={t('library.subtitleEmpty')} actions={actions} />
        <EmptyState
          icon={BookOpen}
          title={t('library.empty.title')}
          actions={
            <>
              <ButtonLink to="/add" variant="primary" size="lg" icon={Plus}>
                {t('library.addRecipe')}
              </ButtonLink>
              <ButtonLink to="/import" variant="secondary" size="lg" icon={Link2}>
                {t('library.importFromWeb')}
              </ButtonLink>
            </>
          }
        >
          <p>{t('library.empty.body')}</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('library.title')} subtitle={kitchen.loaded ? subtitle : ' '} actions={actions} />

      <div className={s.toolbar} role="search">
        <TextField
          label={t('library.searchLabel')}
          icon={SearchIcon}
          type="search"
          dir="auto"
          value={query}
          placeholder={desktop ? t('library.searchPlaceholder') : t('library.searchPlaceholderCompact')}
          onChange={(event) => setQuery(event.target.value)}
          wrapClassName={s.search}
        />
        {desktop ? (
          <>
            <Segmented
              label={t('library.source')}
              value={source}
              onChange={setSource}
              options={[
                { value: 'all', label: t('library.all', { count: views.length }) },
                { value: 'mine', label: t('library.mine', { count: mine }) },
                { value: 'web', label: t('library.web', { count: web }) },
              ]}
            />
            <SelectButton label={t('library.sortBy')} icon={ArrowUpDown} value={sort} onChange={setSort} options={sortOptions} />
          </>
        ) : (
          <div className={s.chips}>
            {(['all', 'mine', 'web'] as const).map((value) => (
              <Chip key={value} selected={source === value} onClick={() => setSource(value)}>
                {t(`library.${value}`, { count: value === 'all' ? views.length : value === 'mine' ? mine : web })}
              </Chip>
            ))}
            <SelectButton
              label={t('library.sortBy')}
              icon={ArrowUpDown}
              shape="chip"
              value={sort}
              onChange={setSort}
              options={sortOptions}
              display={t(`library.sortShort.${sort}`)}
            />
          </div>
        )}
      </div>

      {ready.length > 0 &&
        (desktop ? (
          <section className={s.banner} aria-label={t('library.ready.label')}>
            <span className={s.bannerIcon} aria-hidden>
              <Milk size={24} strokeWidth={2} />
            </span>
            <div className={s.bannerText}>
              <h2 className={s.bannerTitle}>{t('library.ready.title', { count: ready.length })}</h2>
              <p className={s.bannerBody}>
                <Trans i18nKey="library.ready.body" values={{ names: formatList(ready.map((view) => view.recipe.title)) }} />
              </p>
            </div>
            <ButtonLink to="/search?pantry=1" variant="sage" size="lg" iconAfter={ForwardArrow}>
              {t('library.ready.cook')}
            </ButtonLink>
          </section>
        ) : (
          <Link to="/search?pantry=1" className={s.bannerCompact}>
            <span className={s.bannerIcon} aria-hidden>
              <Milk size={22} strokeWidth={2} />
            </span>
            <span className={s.bannerText}>
              <span className={s.bannerTitle}>{t('library.ready.compact', { count: ready.length })}</span>
              <span className={s.bannerBody}>{t('library.ready.cook')}</span>
            </span>
            <ForwardChevron size={22} strokeWidth={2} aria-hidden className={s.bannerChevron} />
          </Link>
        ))}

      {shown.length === 0 && kitchen.loaded ? (
        <p className={s.none}>
          <Trans i18nKey="library.noMatch" values={{ query }} />
        </p>
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
