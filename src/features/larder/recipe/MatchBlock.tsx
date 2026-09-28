import { Trans } from 'react-i18next';
import { formatList } from '../../../i18n';
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

/** "Need: fresh dill, Greek yogurt", every name: it sits behind a disclosure, so it has room. */
export function NeedLine({ need, className }: { need: string[]; className?: string }): JSX.Element | null {
  if (need.length === 0) return null;
  return (
    <p className={className ?? s.need}>
      <Trans i18nKey="recipe.match.need" values={{ names: formatList(need, 'unit') }} components={{ strong: <strong dir="auto" /> }} />
    </p>
  );
}
