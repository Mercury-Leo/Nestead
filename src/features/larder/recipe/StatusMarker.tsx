import { Check, Plus } from 'lucide-react';
import { cx } from '../../../components/ui';
import type { LineStatus } from '../../../domain/kitchen/fit';
import s from './StatusMarker.module.css';

/** Have, staple or to buy: the round marker beside an ingredient. */
export function StatusMarker({ status, className }: { status: LineStatus; className?: string }): JSX.Element {
  if (status === 'have') {
    return (
      <span className={cx(s.marker, s.markerHave, className)} aria-label="Have">
        <Check size={14} strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === 'staple') {
    return (
      <span className={cx(s.marker, s.markerStaple, className)} aria-label="Staple">
        <span className={s.stapleDot} />
      </span>
    );
  }
  return (
    <span className={cx(s.marker, s.markerMissing, className)} aria-label="To buy">
      <Plus size={14} strokeWidth={2.6} aria-hidden />
    </span>
  );
}
