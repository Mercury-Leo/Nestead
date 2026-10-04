import { useEffect, useState } from 'react';
import { Film, Tv } from 'lucide-react';
import type { ShowKind } from '../../../domain/types';
import { cx } from '../../../components/ui';
import s from './Poster.module.css';

/**
 * OMDb's poster links end in `._V1_SX300.jpg`, a 300 px wide poster, and
 * Amazon's servers make the same poster at another width on request. A card
 * shows it 84–96 px wide, so the browser picks from 100, 200 and 300 px by
 * `sizes` and the screen's density: about half the bytes on most phones.
 */
const SIZED = /\._V1_SX300\.jpg$/;
const WIDTHS = [100, 200] as const;

export function posterSrcSet(url: string): string | undefined {
  if (!SIZED.test(url)) return undefined;
  return [...WIDTHS.map((width) => `${url.replace(SIZED, `._V1_SX${width}.jpg`)} ${width}w`), `${url} 300w`].join(', ');
}

/**
 * A show's poster from OMDb's link, loaded and cached by the browser, never
 * stored. Missing, not https, or failing to load: a plain tile with the kind's
 * icon. A smaller width that fails falls back to OMDb's own link first. Always
 * decorative: the title beside it names the show.
 *
 * `sizes` is how wide the poster is drawn, as in <img sizes>.
 */
export function Poster({ url, kind, sizes, className }: { url?: string; kind: ShowKind; sizes: string; className?: string }): JSX.Element {
  const [attempt, setAttempt] = useState<'sized' | 'original' | 'failed'>('sized');
  useEffect(() => setAttempt('sized'), [url]);

  if (url === undefined || !url.startsWith('https://') || attempt === 'failed') {
    const Icon = kind === 'series' ? Tv : Film;
    return (
      <span className={cx(s.placeholder, className)} aria-hidden>
        <Icon size={28} strokeWidth={1.6} />
      </span>
    );
  }
  const srcSet = attempt === 'sized' ? posterSrcSet(url) : undefined;
  return (
    <img
      // A new element per attempt, so the browser drops the srcset it chose from.
      key={attempt}
      src={url}
      srcSet={srcSet}
      sizes={srcSet === undefined ? undefined : sizes}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={cx(s.image, className)}
      onError={() => setAttempt(srcSet === undefined ? 'failed' : 'original')}
    />
  );
}
