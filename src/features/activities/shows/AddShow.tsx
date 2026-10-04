import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ShowDetails, ShowHit, ShowKind } from '../../../../server/shows';
import { useSession } from '../../../auth/session';
import { BackArrow, Button, Segmented, Sheet, Tag, TextField } from '../../../components/ui';
import type { Show } from '../../../domain/types';
import { addShow } from './actions';
import { kindLabel } from './labels';
import { lookupShow, searchShows } from './omdb';
import type { ShowsFailure } from './omdb';
import { Poster } from './Poster';
import { Facts, failureKey } from './ShowCard';
import s from './AddShow.module.css';

/**
 * Search, results, preview, save. Each step costs OMDb one request at most:
 * search runs when the form is sent, never per keystroke, and a result that is
 * already on the family's list opens that entry instead of being read again.
 */

type Kind = 'all' | ShowKind;

interface Chosen {
  hit: ShowHit;
  details?: ShowDetails;
  failure?: ShowsFailure | 'save';
}

export function AddShow({ shows, onClose, onShow }: { shows: readonly Show[]; onClose: () => void; onShow: (show: Show) => void }): JSX.Element {
  const { t } = useTranslation();
  const { store, me } = useSession();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<ShowHit[] | null>(null);
  const [failure, setFailure] = useState<ShowsFailure | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [saving, setSaving] = useState(false);
  // Only the latest question's answer is shown; going back or asking again drops the one in flight.
  const asked = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // The sheet focuses its first control (Close) as it opens, so the field takes focus a frame later.
  useEffect(() => {
    if (chosen !== null) {
      heading.current?.focus();
      return undefined;
    }
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [chosen === null]);

  const search = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const text = query.trim();
    if (text === '' || searching) return;
    const ticket = ++asked.current;
    setSearching(true);
    setFailure(null);
    const answer = await searchShows(text, kind === 'all' ? undefined : kind);
    if (ticket !== asked.current) return;
    setSearching(false);
    setHits(answer.ok ? answer.value : null);
    setFailure(answer.ok ? null : answer.failure);
  };

  const choose = async (hit: ShowHit): Promise<void> => {
    const existing = shows.find((row) => row.imdbId === hit.imdbId);
    if (existing !== undefined) {
      onShow(existing);
      return;
    }
    const ticket = ++asked.current;
    setChosen({ hit });
    const answer = await lookupShow(hit.imdbId);
    if (ticket !== asked.current) return;
    setChosen(answer.ok ? { hit, details: answer.value } : { hit, failure: answer.failure });
  };

  const back = (): void => {
    asked.current += 1;
    setChosen(null);
  };

  const save = async (): Promise<void> => {
    const details = chosen?.details;
    if (chosen === null || details === undefined || saving) return;
    setSaving(true);
    try {
      const { show } = await addShow(store, shows, details, me.id);
      onShow(show);
    } catch {
      setChosen({ ...chosen, failure: 'save' });
      setSaving(false);
    }
  };

  const kinds = (['all', 'movie', 'series'] as const).map((value) => ({ value, label: t(`shows.kinds.${value}`) }));

  const footer =
    chosen === null ? undefined : (
      <div className={s.footer}>
        <Button variant="ghost" icon={BackArrow} onClick={back}>
          {t('shows.addSheet.back')}
        </Button>
        <Button variant="primary" size="lg" icon={Plus} disabled={chosen.details === undefined || saving} onClick={() => void save()}>
          {saving ? t('shows.addSheet.saving') : t('shows.addSheet.save')}
        </Button>
      </div>
    );

  return (
    <Sheet open onClose={onClose} title={t('shows.addSheet.title')} footer={footer}>
      {chosen === null ? (
        <>
          <form className={s.form} role="search" onSubmit={(event) => void search(event)}>
            <TextField
              ref={input}
              label={t('shows.addSheet.query')}
              icon={Search}
              type="search"
              dir="auto"
              enterKeyHint="search"
              value={query}
              placeholder={t('shows.addSheet.placeholder')}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className={s.formRow}>
              <Segmented label={t('shows.addSheet.kind')} size="sm" value={kind} onChange={setKind} options={kinds} />
              <Button type="submit" variant="primary" disabled={searching || query.trim() === ''}>
                {searching ? t('shows.addSheet.searching') : t('shows.addSheet.search')}
              </Button>
            </div>
          </form>
          <div aria-live="polite">
            {failure !== null && <p className={s.note}>{t(`shows.failure.${failureKey(failure)}`)}</p>}
            {hits !== null && hits.length === 0 && <p className={s.note}>{t('shows.addSheet.noResults')}</p>}
          </div>
          {hits !== null && hits.length > 0 && (
            <ul className={s.hits} aria-label={t('shows.addSheet.results')}>
              {hits.map((hit) => {
                const inList = shows.some((row) => row.imdbId === hit.imdbId);
                return (
                  <li key={hit.imdbId}>
                    <button type="button" className={s.hit} onClick={() => void choose(hit)}>
                      <span className={s.hitPoster}>
                        <Poster url={hit.posterUrl} kind={hit.kind} sizes="44px" />
                      </span>
                      <span className={s.hitText}>
                        <span className={s.hitTitle} dir="auto">
                          {hit.title}
                        </span>
                        <span className={s.hitMeta}>
                          {hit.year !== undefined && <span className="tabular">{hit.year}</span>} <span>{kindLabel(t, hit.kind)}</span>
                        </span>
                      </span>
                      {inList && <Tag className={s.inList}>{t('shows.addSheet.inList')}</Tag>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <div className={s.preview}>
          <span className={s.previewPoster}>
            <Poster url={chosen.details?.posterUrl ?? chosen.hit.posterUrl} kind={chosen.hit.kind} sizes="112px" />
          </span>
          <div className={s.previewText}>
            <h3 ref={heading} tabIndex={-1} className={s.previewTitle} dir="auto">
              {chosen.details?.title ?? chosen.hit.title}
            </h3>
            {chosen.details !== undefined && <Facts show={chosen.details} />}
            {chosen.details?.plot !== undefined && (
              <p className={s.plot} dir="auto">
                {chosen.details.plot}
              </p>
            )}
            <p className={s.note} aria-live="polite">
              {chosen.details === undefined && chosen.failure === undefined && t('shows.addSheet.reading')}
              {chosen.failure === 'save' && t('shows.addSheet.saveFailed')}
              {chosen.failure !== undefined && chosen.failure !== 'save' && t(`shows.failure.${failureKey(chosen.failure)}`)}
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}
