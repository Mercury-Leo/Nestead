import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Clapperboard, Plus, Search as SearchIcon, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { Button, Chip, EmptyState, IconButton, Segmented, SelectButton, TextField } from '../../../components/ui';
import { readPreference, writePreference } from '../../../data/local/localStore';
import { useCollectionState } from '../../../data/useCollection';
import { SHOWS_PAGE, SHOW_SORTS, SHOW_STATUSES, filterShows, parseShowView, shownCount, sortShows } from '../../../domain/shows';
import type { KindFilter, ShowView, StatusFilter } from '../../../domain/shows';
import type { Show } from '../../../domain/types';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { AddShow } from './AddShow';
import { STATUS_KEY } from './labels';
import { ShowCard } from './ShowCard';
import s from './Shows.module.css';

/** The status and kind filters and the sort, remembered per family on this device. */
const VIEW_PREFERENCE = 'showsView';

/** Pages built of one list (one search, filter and sort), and a show it must include. */
interface Paging {
  key: string;
  pages: number;
  reveal?: string;
}

const keyOf = (query: string, view: ShowView): string => [query, view.status, view.kind, view.sort].join('\u0000');

/**
 * The family's movies and series. Everything here works on saved rows: the
 * filters, the sort and the name search never call OMDb. Only adding a show,
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
    set({ status: 'all', kind: 'all' });
  };

  const collator = useMemo(() => new Intl.Collator(i18n.language, { sensitivity: 'base', numeric: true }), [i18n.language]);
  // The field shows each key at once; the list follows in a render that can be
  // interrupted, since a keystroke can build up to a page of new cards.
  const listQuery = useDeferredValue(query);
  const shown = sortShows(filterShows(rows, { query: listQuery, status: view.status, kind: view.kind }), view.sort, collator.compare);
  // Counts follow the kind filter, so "To watch 3" means three of what is listed.
  const ofKind = filterShows(rows, { query: '', status: 'all', kind: view.kind });
  const count = (status: StatusFilter): number => (status === 'all' ? ofKind.length : ofKind.filter((row) => row.status === status).length);

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
    const hidden = filterShows([show], { query, status: view.status, kind: view.kind }).length === 0;
    if (hidden) showAll();
    // Keyed to the list it will show in, so clearing the filters does not drop it.
    setPaging(hidden ? { key: keyOf('', { ...view, status: 'all', kind: 'all' }), pages: 1, reveal: show.id } : { ...current, reveal: show.id });
    setRevealed({ id: show.id, at: Date.now() });
  };

  const statusLabel = (status: StatusFilter): string => (status === 'all' ? t('shows.all', { count: count('all') }) : t(`shows.statusCount.${STATUS_KEY[status]}`, { count: count(status) }));
  const statuses: StatusFilter[] = ['all', ...SHOW_STATUSES];
  const kinds = (['all', 'movie', 'series'] as const).map((value) => ({ value, label: t(`shows.kinds.${value}`) }));
  const sorts = SHOW_SORTS.map((value) => ({ value, label: t(`shows.sort.${value}`) }));

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
            <Segmented<StatusFilter>
              label={t('shows.statusLabel')}
              className={s.statusFilter}
              value={view.status}
              onChange={(status) => set({ status })}
              options={statuses.map((value) => ({ value, label: statusLabel(value) }))}
            />
            <Segmented<KindFilter> label={t('shows.kindLabel')} className={s.kindFilter} value={view.kind} onChange={(kind) => set({ kind })} options={kinds} />
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
