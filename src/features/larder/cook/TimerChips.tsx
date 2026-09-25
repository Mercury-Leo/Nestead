import { Bell, Check, Pause, Play, Timer as TimerIcon, X } from 'lucide-react';
import { cx } from '../../../components/ui';
import type { DetectedDuration } from '../../../domain/kitchen/durations';
import { formatClock } from '../../../domain/kitchen/quantity';
import { addMinute, cancel, dismiss, pause, remaining, resume } from '../timers/store';
import type { Timer } from '../timers/store';
import s from './CookMode.module.css';

/** A timer found in a step's text, and a running timer in the tray. */

export function TimerChip({
  duration,
  timer,
  now,
  onPress,
}: {
  duration: DetectedDuration;
  timer: Timer | undefined;
  now: number;
  onPress: () => void;
}): JSX.Element {
  const left = timer === undefined ? duration.seconds : remaining(timer, now);
  const state = timer?.state ?? 'idle';
  const label =
    state === 'idle'
      ? `Start timer: ${duration.phrase}`
      : state === 'running'
        ? `Pause timer: ${duration.phrase}, ${formatClock(left)} left`
        : state === 'paused'
          ? `Resume timer: ${duration.phrase}, ${formatClock(left)} left`
          : `${duration.phrase} is done. Start again`;
  return (
    <button type="button" className={cx(s.chip, s[`chip_${state}`])} aria-label={label} onClick={onPress}>
      <span className={s.chipIcon} aria-hidden>
        {state === 'idle' ? (
          <Play size={16} strokeWidth={0} fill="currentColor" />
        ) : state === 'done' ? (
          <Check size={18} strokeWidth={2.6} />
        ) : (
          <TimerIcon size={18} strokeWidth={2.2} />
        )}
      </span>
      <span className={s.chipPhrase}>{duration.phrase}</span>
      {state === 'running' && <span className={cx(s.chipTime, 'tabular')}>· {formatClock(left)}</span>}
      {state === 'paused' && <span className={cx(s.chipTime, 'tabular')}>· paused {formatClock(left)}</span>}
      {state === 'done' && <span className={s.chipTime}>· done</span>}
    </button>
  );
}

export function TrayCard({ timer, now, desktop }: { timer: Timer; now: number; desktop: boolean }): JSX.Element {
  const left = remaining(timer, now);
  if (timer.state === 'done') {
    return (
      <div className={cx(s.card, s.cardDone)}>
        <span className={s.cardBell} aria-hidden>
          <Bell size={22} strokeWidth={2} />
        </span>
        <div className={s.cardText}>
          <span className={s.cardTitle}>{timer.label} — done</span>
          <span className={s.cardSub}>{formatClock(timer.durationSec)} finished</span>
        </div>
        {desktop && (
          <button type="button" className={s.cardGhost} onClick={() => addMinute(timer.id)}>
            +1 min
          </button>
        )}
        <button type="button" className={s.cardDark} onClick={() => dismiss(timer.id)}>
          Dismiss
        </button>
      </div>
    );
  }
  const progress = timer.durationSec === 0 ? 1 : 1 - left / timer.durationSec;
  return (
    <div className={cx(s.card, timer.state === 'paused' && s.cardPaused)}>
      <div className={s.cardText}>
        <span className={s.cardTitle}>
          {timer.label}
          {desktop ? <span className={s.cardPhrase}> · {timer.phrase}</span> : null}
        </span>
        {!desktop && <span className={s.cardPhrase}>{timer.phrase}</span>}
        <span className={s.bar} aria-hidden>
          <span style={{ width: `${Math.min(100, Math.max(2, progress * 100))}%` }} />
        </span>
      </div>
      <span className={cx(s.clock, 'tabular')} aria-label={`${formatClock(left)} left`}>
        {formatClock(left)}
      </span>
      {timer.state === 'running' ? (
        <button type="button" className={s.round} aria-label={`Pause ${timer.label}`} onClick={() => pause(timer.id)}>
          <Pause size={22} strokeWidth={0} fill="currentColor" />
        </button>
      ) : (
        <button type="button" className={s.round} aria-label={`Resume ${timer.label}`} onClick={() => resume(timer.id)}>
          <Play size={22} strokeWidth={0} fill="currentColor" />
        </button>
      )}
      <button type="button" className={s.round} aria-label={`Cancel ${timer.label}`} onClick={() => cancel(timer.id)}>
        <X size={22} strokeWidth={2.2} />
      </button>
    </div>
  );
}
