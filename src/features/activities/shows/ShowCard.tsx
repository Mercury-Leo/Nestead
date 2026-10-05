import { memo, useEffect, useId, useRef, useState } from 'react';
import { Ban, Bookmark, BookmarkPlus, ChevronDown, CircleCheck, CirclePlay, RefreshCw, Star, Tag as TagIcon, Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { Button, cx } from '../../../components/ui';
import { nextStatus } from '../../../domain/shows';
import type { FetchedDetails } from '../../../domain/shows';
import type { Show, ShowStatus } from '../../../domain/types';
import { formatDate, formatNumber } from '../../../i18n';
import { cycleStatus, dropShow, refreshShow, removeShow, restoreShow, toggleFavorite } from './actions';
import { STATUS_KEY, genreLabel, imdbUrl, kindLabel, statusLabel } from './labels';
import type { ShowsFailure } from './client';
import { Poster } from './Poster';
import s from './ShowCard.module.css';

/*
 * Like a recipe card: what you scan for (title, year, length, rating, status)
 * stays in view, and the plot, refresh and delete wait behind a per-card
 * toggle. The title is the link (to IMDb); the poster repeats it, so it stays
 * out of the tab order and the accessibility tree. Fetched text is data,
 * rendered as React text only.
 */

const STATUS_ICON = { 'to-watch': Bookmark, watching: CirclePlay, watched: CircleCheck, dropped: Ban } as const;

export function failureKey(failure: ShowsFailure): 'unavailable' | 'limit' | 'notFound' | 'failed' {
  return failure === 'not-found' ? 'notFound' : failure;
}

/**
 * Year, kind, seasons (series only), length and IMDb rating: the one line you
 * scan. A series' length is one episode's.
 */
export function Facts({ show, className }: { show: FetchedDetails; className?: string }): JSX.Element {
  const { t } = useTranslation();
  const rating = show.imdbRating === undefined ? undefined : formatNumber(show.imdbRating, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const seasons = show.kind === 'series' && show.totalSeasons !== undefined ? t('shows.card.seasons', { count: show.totalSeasons }) : undefined;
  const length = show.runtimeMin === undefined ? undefined : t('shows.card.minutes', { count: show.runtimeMin });
  return (
    <p className={cx(s.facts, className)}>
      {/* Spaces between the items keep the words apart for screen readers; flex layout ignores them. */}
      {show.year !== undefined && <span className="tabular">{show.year}</span>}{' '}
      <span>{kindLabel(t, show.kind)}</span>{' '}
      {seasons !== undefined && <span className="tabular">{seasons}</span>}{' '}
      {length !== undefined && <span className="tabular">{length}</span>}{' '}
      {rating !== undefined && (
        <span className={s.rating}>
          <Star size={14} strokeWidth={0} fill="var(--honey)" aria-hidden />
          <span className="tabular" aria-hidden>
            {rating}
          </span>
          <span className="visually-hidden">{t('shows.card.rating', { value: rating })}</span>
        </span>
      )}
    </p>
  );
}

/** The genres in the screen's language, under the facts; nothing when there are none. */
export function Genres({ genres, className }: { genres: readonly string[] | undefined; className?: string }): JSX.Element | null {
  const { t } = useTranslation();
  if (genres === undefined || genres.length === 0) return null;
  return <p className={cx(s.genres, className)}>{genres.map((genre) => genreLabel(t, genre)).join(', ')}</p>;
}

/**
 * The family's tags, under the genres; nothing when there are none. Each is a
 * button that adds its tag to the page's filter (`onTag`). Tags show as typed.
 */
export function Tags({ tags, onTag }: { tags: readonly string[] | undefined; onTag: (tag: string) => void }): JSX.Element | null {
  const { t } = useTranslation();
  if (tags === undefined || tags.length === 0) return null;
  return (
    // role="list" because list-style: none drops the list's role in Safari.
    <ul className={s.tags} role="list">
      {tags.map((tag) => (
        <li key={tag}>
          <button type="button" className={s.tag} aria-label={t('shows.tags.filterBy', { tag })} onClick={() => onTag(tag)}>
            <TagIcon size={13} strokeWidth={2.2} aria-hidden />
            <bdi>{tag}</bdi>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The status as a badge beside the title. A press cycles To watch, Watching,
 * Watched, and the label says what it changes to. The button is a 44px target
 * around the smaller badge.
 */
function StatusBadge({ status, onCycle }: { status: ShowStatus; onCycle: () => void }): JSX.Element {
  const { t } = useTranslation();
  const Icon = STATUS_ICON[status];
  const label = statusLabel(t, status);
  return (
    <button
      type="button"
      className={s.statusHit}
      aria-label={t('shows.card.changeStatus', { status: label, next: statusLabel(t, nextStatus(status)) })}
      onClick={onCycle}
    >
      <span className={cx(s.status, s[STATUS_KEY[status]])}>
        <Icon size={14} strokeWidth={2.4} aria-hidden />
        <span>{label}</span>
      </span>
    </button>
  );
}

/**
 * The favourite star, on the poster's top corner: a show the family would
 * watch again. A toggle for the whole family, named for its show since every
 * card has one. It follows the title and status in the DOM, so someone moving
 * by headings meets it after the show's name; CSS draws it over the poster.
 */
function FavoriteStar({ show, onToggle }: { show: Show; onToggle: () => void }): JSX.Element {
  const { t } = useTranslation();
  const on = show.favorite === true;
  return (
    <button
      type="button"
      className={s.starHit}
      aria-pressed={on}
      aria-label={t('shows.card.favorite', { title: show.title })}
      title={t('shows.card.favoriteHint')}
      onClick={onToggle}
    >
      <span className={cx(s.star, on && s.starOn)}>
        <Star size={16} strokeWidth={2.2} fill={on ? 'currentColor' : 'none'} aria-hidden />
      </span>
    </button>
  );
}

/**
 * Behind the toggle: the plot, when it was read, refresh and delete. Built
 * only while the card is open: on a long list, every closed card building its
 * hidden panel was half the page's elements (docs/PERFORMANCE.md).
 */
function Details({ show }: { show: Show }): JSX.Element {
  const { t } = useTranslation();
  const { store } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ShowsFailure | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    setFailure(null);
    try {
      const result = await refreshShow(store, show);
      if (!result.ok) setFailure(result.failure);
    } catch {
      setFailure('failed');
    } finally {
      setRefreshing(false);
    }
  };

  const remove = async (): Promise<void> => {
    setDeleting(true);
    try {
      await removeShow(store, show.id);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <>
      <p className={s.plot} dir="auto">
        {show.plot ?? t('shows.card.noPlot')}
      </p>
      <p className={s.fetched}>{t('shows.card.fetched', { date: formatDate(show.fetchedAt) })}</p>
      {confirmDelete ? (
        <div className={s.confirm}>
          <span>
            <Trans i18nKey="shows.card.deleteQuestion" components={{ item: <bdi>{show.title}</bdi> }} />
          </span>
          <span className={s.confirmButtons}>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('common.keepIt')}
            </Button>
            <Button variant="primary" icon={Trash2} disabled={deleting} onClick={() => void remove()}>
              {t('shows.card.delete')}
            </Button>
          </span>
        </div>
      ) : (
        <div className={s.detailActions}>
          <Button variant="ghost" icon={RefreshCw} disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? t('shows.card.refreshing') : t('shows.card.refresh')}
          </Button>
          {/* Drop it, or for a dropped show its way back (its badge also brings it back). */}
          {show.status === 'dropped' ? (
            <Button variant="ghost" icon={BookmarkPlus} onClick={() => void restoreShow(store, show).catch(() => undefined)}>
              {t('shows.card.restore')}
            </Button>
          ) : (
            <Button variant="ghost" icon={Ban} onClick={() => void dropShow(store, show).catch(() => undefined)}>
              {t('shows.card.drop')}
            </Button>
          )}
          <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
            {t('shows.card.delete')}
          </Button>
        </div>
      )}
      <p className={s.quiet} role="status">
        {failure !== null && `${t(`shows.failure.${failureKey(failure)}`)} ${t('shows.card.unchanged')}`}
      </p>
    </>
  );
}

/**
 * The same show, field by field. A re-read hands every row back as a new
 * object, so identity alone would re-render every card after any write. The
 * fields are plain values, bar genres and tags, lists compared item by item.
 */
export function sameShow(a: Show, b: Show): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof Show)[];
  return keys.length === Object.keys(b).length && keys.every((key) => (key === 'genres' || key === 'tags' ? sameList(a[key], b[key]) : a[key] === b[key]));
}

function sameList(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * One show. `revealed` changes when the page asks for this card to be shown
 * (adding a show that is already on the list): it opens, scrolls into view,
 * takes focus and flashes once. Memoised on the show's fields and the page's
 * callback, which the page keeps the same between renders, so a status change
 * or a keystroke re-renders the cards it changes, not all of them.
 */
export const ShowCard = memo(
  ShowCardView,
  (before, after) => before.revealed === after.revealed && before.onTag === after.onTag && sameShow(before.show, after.show),
);

function ShowCardView({
  show,
  revealed,
  onTag,
}: {
  show: Show;
  revealed?: number;
  /** Adds a tag to the page's filter. */
  onTag: (tag: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { store } = useSession();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const id = useId();
  const title = useRef<HTMLAnchorElement>(null);
  const card = useRef<HTMLElement>(null);
  const href = imdbUrl(show.imdbId);

  useEffect(() => {
    if (revealed === undefined) return undefined;
    setOpen(true);
    setFlash(true);
    // The CSS rule for reduced motion does not reach a scroll asked for from script.
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    card.current?.scrollIntoView?.({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    title.current?.focus({ preventScroll: true });
    const timer = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(timer);
  }, [revealed]);

  return (
    <article ref={card} className={cx(s.card, flash && s.flash)}>
      <a href={href} target="_blank" rel="noopener noreferrer" className={s.poster} tabIndex={-1} aria-hidden>
        <Poster url={show.posterUrl} kind={show.kind} sizes="(min-width: 1024px) 96px, 84px" />
      </a>
      <div className={s.body}>
        <div className={s.top}>
          <h3 className={s.title} dir="auto">
            <a ref={title} href={href} target="_blank" rel="noopener noreferrer" className={s.titleLink}>
              {show.title}
              <span className="visually-hidden"> {t('shows.card.onImdb')}</span>
            </a>
          </h3>
          <StatusBadge status={show.status} onCycle={() => void cycleStatus(store, show).catch(() => undefined)} />
        </div>
        <FavoriteStar show={show} onToggle={() => void toggleFavorite(store, show).catch(() => undefined)} />
        <Facts show={show} />
        <Genres genres={show.genres} />
        <Tags tags={show.tags} onTag={onTag} />
        <div id={id} className={s.details} hidden={!open}>
          {open && <Details show={show} />}
        </div>
        {/* At the card's bottom corner, after the details, so a card closes from where its reader ends. */}
        <button
          type="button"
          className={cx(s.toggle, open && s.toggleOpen)}
          aria-expanded={open}
          aria-controls={id}
          aria-label={t('shows.card.more', { title: show.title })}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown size={20} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
    </article>
  );
}
