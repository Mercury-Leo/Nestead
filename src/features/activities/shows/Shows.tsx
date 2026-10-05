import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Clapperboard, Drama, Plus, Search as SearchIcon, SlidersHorizontal, Tag as TagIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { Button, Chip, EmptyState, IconButton, Segmented, SelectButton, TextField } from '../../../components/ui';
import { readPreference, writePreference } from '../../../data/local/localStore';
import { useCollectionState } from '../../../data/useCollection';
import { SHOWS_PAGE, SHOW_SORTS, SHOW_STATUSES, filterShows, genreCounts, hasTags, lacksGenres, parseShowView, shownCount, sortShows, tagCounts } from '../../../domain/shows';
import type { KindFilter, ShowView, StatusFilter } from '../../../domain/shows';
import type { Show } from '../../../domain/types';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { AddShow } from './AddShow';
import { GenreFill } from './GenreFill';
import { ChipFilter } from './ChipFilter';
import { STATUS_KEY, genreLabel } from './labels';
import { ShowCard } from './ShowCard';
import s from './Shows.module.css';

/** The status, kind, genre and tag filters and the sort, remembered per family on this device. */
const VIEW_PREFERENCE = 'showsView';

/** Pages built of one list (one search, filter and sort), and a show it must include. */
interface Paging {
  key: string;
  pages: number;
  reveal?: string;
}

const keyOf = (query: string, view: ShowView): string =>
  [query, view.status, view.kind, view.genres.join('\u0001'), view.tags.join('\u0001'), view.sort].join('\u0000');

/** A tag's name on screen: as typed. */
const asTyped = (tag: string): string => tag;

/**
 * The family's movies and series. Everything here works on saved rows: the
 * filters, the sort and the name search never call /api/shows. Only adding a show,
 * and refreshing one, do (AddShow.tsx, ShowCard.tsx).
 *
 * A long list is built a page at a time (SHOWS_PAGE), with Show more for the
 * next: building every card of a 300-show list made opening and filtering
 * slow. A new search, filter or sort starts again from the first page.
 */
export function Shows(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { store } = useSession();
  const { rows, loaded } = useCollectionState(store.shows);
  const desktop = useIsDesktop();
  const [view, setView] = useState<ShowView>(() => parseShowView(readPreference(store.familyId, VIEW_PREFERENCE)));
  useEffect(() => {
    writePreference(store.familyId, VIEW_PREFERENCE, view);
  }, [store.familyId, view]);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState<{ id: string; at: number } | null>(null);

  const set = (patch: Partial<ShowView>): void => setView((current) => ({ ...current, ...patch }));
  const showAll = (): void => {
    setQuery('');
    set({ status: 'all', kind: 'all', genres: [], tags: [] });
  };
  // The search finds a genre by its name on screen too: "קומדיה" as well as "comedy".
  const genreName = useCallback((genre: string): string => genreLabel(t, genre), [t]);

  const collator = useMemo(() => new Intl.Collator(i18n.language, { sensitivity: 'base', numeric: true }), [i18n.language]);
  // The field shows each key at once; the list follows in a render that can be
  // interrupted, since a keystroke can build up to a page of new cards.
  const listQuery = useDeferredValue(query);
  const shown = sortShows(
    filterShows(rows, { query: listQuery, status: view.status, kind: view.kind, genres: view.genres, tags: view.tags, genreName }),
    view.sort,
    collator.compare,
  );
  // Counts follow the kind, genre and tag filters, so "To watch 3" means three of what is listed; All leaves dropped shows out, as its list does.
  const ofKind = rows.filter(
    (row) => (view.kind === 'all' || row.kind === view.kind) && view.genres.every((genre) => row.genres?.includes(genre) === true) && hasTags(row, view.tags),
  );
  const count = (status: StatusFilter): number => ofKind.filter((row) => (status === 'all' ? row.status !== 'dropped' : row.status === status)).length;

  // Pages asked for, for this search, filter and sort only: any change, back
  // to an earlier one too, starts from one page. `reveal` is a show that must
  // be built wherever it sorts (just added, or already here); a change drops it.
  const listKey = keyOf(query, view);
  const [paging, setPaging] = useState<Paging>({ key: listKey, pages: 1 });
  if (paging.key !== listKey) setPaging({ key: listKey, pages: 1 });
  const current: Paging = paging.key === listKey ? paging : { key: listKey, pages: 1 };
  const built = shownCount(shown.length, current.pages, current.reveal === undefined ? -1 : shown.findIndex((row) => row.id === current.reveal));
  const grid = useRef<HTMLDivElement>(null);
  const focusFrom = useRef<number | null>(null);
  const showMore = (): void => {
    focusFrom.current = built;
    setPaging({ key: listKey, pages: Math.ceil(built / SHOWS_PAGE) + 1 });
  };
  // After Show more, the keyboard carries on from the first new card.
  useEffect(() => {
    if (focusFrom.current === null) return;
    grid.current?.children[focusFrom.current]?.querySelector<HTMLElement>('h3 a')?.focus();
    focusFrom.current = null;
  }, [built]);

  /** Brings a show into view after adding it, or after trying to add one already here. */
  const reveal = (show: Show): void => {
    setAdding(false);
    const hidden = filterShows([show], { query, status: view.status, kind: view.kind, genres: view.genres, tags: view.tags, genreName }).length === 0;
    // Clearing the search and filters shows it, except a dropped show, which only the Dropped filter lists.
    const status: StatusFilter = show.status === 'dropped' ? 'dropped' : 'all';
    if (hidden) {
      setQuery('');
      set({ status, kind: 'all', genres: [], tags: [] });
    }
    // Keyed to the list it will show in, so clearing the filters does not drop it.
    setPaging(hidden ? { key: keyOf('', { ...view, status, kind: 'all', genres: [], tags: [] }), pages: 1, reveal: show.id } : { ...current, reveal: show.id });
    setRevealed({ id: show.id, at: Date.now() });
  };

  const statusLabel = (status: StatusFilter): string => (status === 'all' ? t('shows.all', { count: count('all') }) : t(`shows.statusCount.${STATUS_KEY[status]}`, { count: count(status) }));
  const statuses: StatusFilter[] = ['all', ...SHOW_STATUSES];
  const kinds = (['all', 'movie', 'series'] as const).map((value) => ({ value, label: t(`shows.kinds.${value}`) }));
  const sorts = SHOW_SORTS.map((value) => ({ value, label: t(`shows.sort.${value}`) }));
  const genreFilter = (shape: 'button' | 'chip'): JSX.Element => (
    <ChipFilter
      shape={shape}
      label={t('shows.genres.label')}
      icon={Drama}
      hint={t('shows.genres.hint')}
      empty={t('shows.genres.none')}
      picked={view.genres}
      counts={genreCounts(shown)}
      listed={shown.length}
      name={genreName}
      pickedLabel={(genres) => t('shows.genres.picked', { genres })}
      onChange={(genres) => set({ genres })}
    />
  );
  // Shown once any show has a tag, or while one is picked, so a tag picked on an earlier visit can come off.
  const anyTags = view.tags.length > 0 || rows.some((row) => (row.tags?.length ?? 0) > 0);
  const tagFilter = (shape: 'button' | 'chip'): JSX.Element | null =>
    anyTags ? (
      <ChipFilter
        shape={shape}
        label={t('shows.tags.label')}
        icon={TagIcon}
        hint={t('shows.tags.filterHint')}
        empty={t('shows.tags.none')}
        picked={view.tags}
        counts={tagCounts(shown)}
        listed={shown.length}
        name={asTyped}
        pickedLabel={(tags) => t('shows.tags.picked', { tags })}
        onChange={(tags) => set({ tags })}
      />
    ) : null;

  const addAction = desktop ? (
    <Button variant="primary" size="lg" icon={Plus} onClick={() => setAdding(true)}>
      {t('shows.add')}
    </Button>
  ) : (
    <IconButton label={t('shows.add')} icon={Plus} variant="primary" size={52} onClick={() => setAdding(true)} />
  );
  const sheet = adding && <AddShow shows={rows} onClose={() => setAdding(false)} onShow={reveal} />;

  if (!loaded) return <p className="centred">{t('common.loading')}</p>;

  if (rows.length === 0) {
    return (
      <div>
        <PageHeader title={t('shows.title')} actions={addAction} />
        <EmptyState
          icon={Clapperboard}
          title={t('shows.empty.title')}
          actions={
            <Button variant="primary" size="lg" icon={Plus} onClick={() => setAdding(true)}>
              {t('shows.add')}
            </Button>
          }
        >
          <p>{t('shows.empty.body')}</p>
        </EmptyState>
        {sheet}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('shows.title')} actions={addAction} />

      <div className={s.toolbar} role="search">
        <TextField
          label={t('shows.searchLabel')}
          icon={SearchIcon}
          type="search"
          dir="auto"
          value={query}
          placeholder={t('shows.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
          wrapClassName={s.search}
        />
        {desktop ? (
          <>
            <div className={s.filters}>
              <Segmented<StatusFilter>
                label={t('shows.statusLabel')}
                value={view.status}
                onChange={(status) => set({ status })}
                options={statuses.map((value) => ({ value, label: statusLabel(value) }))}
              />
              <Segmented<KindFilter> label={t('shows.kindLabel')} value={view.kind} onChange={(kind) => set({ kind })} options={kinds} />
              {genreFilter('button')}
              {tagFilter('button')}
            </div>
            <SelectButton label={t('shows.sortBy')} icon={ArrowUpDown} className={s.sort} value={view.sort} onChange={(sort) => set({ sort })} options={sorts} />
          </>
        ) : (
          <div className={s.chips}>
            {statuses.map((value) => (
              <Chip key={value} selected={view.status === value} onClick={() => set({ status: value })}>
                {statusLabel(value)}
              </Chip>
            ))}
            <SelectButton
              label={t('shows.kindLabel')}
              icon={SlidersHorizontal}
              shape="chip"
              value={view.kind}
              onChange={(kind) => set({ kind })}
              options={kinds}
            />
            {genreFilter('chip')}
            {tagFilter('chip')}
            <SelectButton
              label={t('shows.sortBy')}
              icon={ArrowUpDown}
              shape="chip"
              value={view.sort}
              onChange={(sort) => set({ sort })}
              options={sorts}
              display={t(`shows.sortShort.${view.sort}`)}
            />
          </div>
        )}
      </div>

      <GenreFill shows={rows} missing={rows.filter(lacksGenres).length} />

      {shown.length === 0 ? (
        <div className={s.none}>
          <p>{t('shows.noMatch')}</p>
          <Button variant="secondary" onClick={showAll}>
            {t('shows.showAll')}
          </Button>
        </div>
      ) : (
        <>
          <div className={s.grid} ref={grid}>
            {shown.slice(0, built).map((show) => (
              <ShowCard key={show.id} show={show} revealed={revealed?.id === show.id ? revealed.at : undefined} />
            ))}
          </div>
          {shown.length > SHOWS_PAGE && (
            <div className={s.more}>
              <p className={s.moreCount} aria-live="polite">
                {t('shows.showing', { shown: built, total: shown.length })}
              </p>
              {built < shown.length && (
                <Button variant="secondary" size="lg" onClick={showMore}>
                  {t('shows.showMore', { count: Math.min(SHOWS_PAGE, shown.length - built) })}
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {sheet}
    </div>
  );
}
