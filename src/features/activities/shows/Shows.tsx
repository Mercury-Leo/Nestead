import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Clapperboard, Plus, Search as SearchIcon, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { Button, Chip, EmptyState, IconButton, Segmented, SelectButton, TextField } from '../../../components/ui';
import { readPreference, writePreference } from '../../../data/local/localStore';
import { useCollectionState } from '../../../data/useCollection';
import { SHOW_SORTS, SHOW_STATUSES, filterShows, parseShowView, sortShows } from '../../../domain/shows';
import type { KindFilter, ShowView, StatusFilter } from '../../../domain/shows';
import type { Show } from '../../../domain/types';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { AddShow } from './AddShow';
import { STATUS_KEY } from './labels';
import { ShowCard } from './ShowCard';
import s from './Shows.module.css';

/** The status and kind filters and the sort, remembered per family on this device. */
const VIEW_PREFERENCE = 'showsView';

/**
 * The family's movies and series. Everything here works on saved rows: the
 * filters, the sort and the name search never call OMDb. Only adding a show,
 * and refreshing one, do (AddShow.tsx, ShowCard.tsx).
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
  const shown = sortShows(filterShows(rows, { query, status: view.status, kind: view.kind }), view.sort, collator.compare);
  // Counts follow the kind filter, so "To watch 3" means three of what is listed.
  const ofKind = filterShows(rows, { query: '', status: 'all', kind: view.kind });
  const count = (status: StatusFilter): number => (status === 'all' ? ofKind.length : ofKind.filter((row) => row.status === status).length);

  /** Brings a show into view after adding it, or after trying to add one already here. */
  const reveal = (show: Show): void => {
    setAdding(false);
    if (filterShows([show], { query, status: view.status, kind: view.kind }).length === 0) showAll();
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
        <div className={s.grid}>
          {shown.map((show) => (
            <ShowCard key={show.id} show={show} revealed={revealed?.id === show.id ? revealed.at : undefined} />
          ))}
        </div>
      )}
      {sheet}
    </div>
  );
}
