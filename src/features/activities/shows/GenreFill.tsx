import { useState } from 'react';
import { Tags } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { Button } from '../../../components/ui';
import type { Show } from '../../../domain/types';
import { fillGenres } from './actions';
import type { ShowsFailure } from './client';
import { failureKey } from './ShowCard';
import s from './GenreFill.module.css';

/**
 * Shows added before genres were saved have none (lacksGenres()). This offers
 * to read those again, once each (fillGenres()). Each costs a lookup from the
 * day's allowance, so it waits for someone to ask. It goes away once every
 * show has genres, read here or on another device; if a run stops short, it
 * says why and offers the rest again.
 */
export function GenreFill({ shows, missing }: { shows: readonly Show[]; missing: number }): JSX.Element | null {
  const { t } = useTranslation();
  const { store } = useSession();
  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const [failure, setFailure] = useState<ShowsFailure | null>(null);
  if (missing === 0 && run === null) return null;

  const start = async (): Promise<void> => {
    const total = missing;
    setFailure(null);
    setRun({ done: 0, total });
    try {
      const result = await fillGenres(store, shows, (done) => setRun({ done, total }));
      if (result.failure !== undefined) setFailure(result.failure);
    } catch {
      setFailure('failed');
    } finally {
      setRun(null);
    }
  };

  return (
    <div className={s.fill}>
      <Tags size={20} strokeWidth={2} aria-hidden className={s.icon} />
      <div className={s.text}>
        <p>{run === null ? t('shows.genres.missing', { count: missing }) : t('shows.genres.fetching', { done: run.done, total: run.total })}</p>
        <p className={s.quiet} role="status">
          {failure !== null && t(`shows.failure.${failureKey(failure)}`)}
        </p>
      </div>
      <Button variant="secondary" disabled={run !== null} onClick={() => void start()}>
        {t('shows.genres.fetch')}
      </Button>
    </div>
  );
}
