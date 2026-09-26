import { Trans, useTranslation } from 'react-i18next';
import { cx } from '../../../components/ui/cx';
import { formatList } from '../../../i18n';
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
  const { t } = useTranslation();
  // A comma list, not "a and b": it is cut short, and may go on with "+ 2 more".
  const needText =
    need === undefined || need.length === 0
      ? null
      : need.length > 2
        ? t('recipe.match.needMore', { names: formatList(need.slice(0, 2), 'unit'), count: need.length - 2 })
        : formatList(need, 'unit');
  return (
    <div className={cx(s.match, compact && s.matchCompact)}>
      <div className={s.matchTop}>
        <span className={s.matchText}>
          <Trans
            i18nKey={compact ? 'recipe.match.haveCompact' : 'recipe.match.have'}
            values={{ have, total }}
            components={{ strong: <strong className="tabular" /> }}
          />
        </span>
        <BuyPill missing={missing} compact={compact} />
      </div>
      <MatchBar have={have} total={total} />
      {needText !== null && (
        <p className={s.need}>
          <Trans i18nKey="recipe.match.need" values={{ names: needText }} components={{ strong: <strong dir="auto" /> }} />
        </p>
      )}
    </div>
  );
}
