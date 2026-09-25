import { cx } from '../../../components/ui/cx';
import { BuyPill } from './badges';
import s from './MatchBlock.module.css';

/** One segment per ingredient: sage for have or staple, soft terracotta to buy. */
export function MatchBar({ have, total }: { have: number; total: number }): JSX.Element {
  return (
    <span className={s.matchBar} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < have ? s.segHave : s.segMissing} />
      ))}
    </span>
  );
}

export function MatchBlock({
  have,
  total,
  missing,
  need,
  compact = false,
}: {
  have: number;
  total: number;
  missing: number;
  /** Names of what is missing, for "Need: a, b + 2 more". */
  need?: string[];
  compact?: boolean;
}): JSX.Element {
  const needText =
    need === undefined || need.length === 0
      ? null
      : need.length > 2
        ? `${need.slice(0, 2).join(', ')} + ${need.length - 2} more`
        : need.join(', ');
  return (
    <div className={cx(s.match, compact && s.matchCompact)}>
      <div className={s.matchTop}>
        <span className={s.matchText}>
          You have{' '}
          <strong className="tabular">
            {have}/{total}
          </strong>
          {!compact && ' ingredients'}
        </span>
        <BuyPill missing={missing} compact={compact} />
      </div>
      <MatchBar have={have} total={total} />
      {needText !== null && (
        <p className={s.need}>
          Need: <strong>{needText}</strong>
        </p>
      )}
    </div>
  );
}
