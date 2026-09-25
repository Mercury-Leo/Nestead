import { Star } from 'lucide-react';
import s from './Rating.module.css';

/** Five stars with halves, read-only. */
export function Stars({ value, size = 14 }: { value: number; size?: number }): JSX.Element {
  return (
    <span className={s.stars} aria-label={`${value.toFixed(1)} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        const pct = fill >= 0.75 ? 100 : fill >= 0.25 ? 50 : 0;
        return (
          <span key={n} className={s.star} style={{ width: size, height: size }}>
            <Star size={size} strokeWidth={0} fill="var(--star-empty)" aria-hidden />
            <span className={s.starFill} style={{ width: `${pct}%` }}>
              <Star size={size} strokeWidth={0} fill="var(--honey)" aria-hidden />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Tap to rate 1-5. Each star is a 44px button. */
export function RatingInput({ value, onChange }: { value: number | undefined; onChange: (value: number) => void }): JSX.Element {
  return (
    <span className={s.rating}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
        >
          <Star size={28} strokeWidth={0} fill={value !== undefined && n <= value ? 'var(--honey)' : 'var(--star-empty)'} aria-hidden />
        </button>
      ))}
    </span>
  );
}
