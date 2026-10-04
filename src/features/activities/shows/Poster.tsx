import { useEffect, useState } from 'react';
import { Film, Tv } from 'lucide-react';
import type { ShowKind } from '../../../domain/types';
import { cx } from '../../../components/ui';
import s from './Poster.module.css';

/**
 * A show's poster from OMDb's link, loaded and cached by the browser, never
 * stored. Missing, not https, or failing to load: a plain tile with the kind's
 * icon. Always decorative: the title beside it names the show.
 */
export function Poster({ url, kind, className }: { url?: string; kind: ShowKind; className?: string }): JSX.Element {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  if (url === undefined || !url.startsWith('https://') || failed) {
    const Icon = kind === 'series' ? Tv : Film;
    return (
      <span className={cx(s.placeholder, className)} aria-hidden>
        <Icon size={28} strokeWidth={1.6} />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={cx(s.image, className)}
      onError={() => setFailed(true)}
    />
  );
}
