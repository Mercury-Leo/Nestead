import { Bell, Check, Pause, Play, Timer as TimerIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../../components/ui';
import type { DetectedDuration } from '../../../domain/kitchen/durations';
// i18n: formatClock (domain/kitchen/quantity.ts) writes "4:05" with Latin digits whatever the locale.
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
  const { t } = useTranslation();
  const left = timer === undefined ? duration.seconds : remaining(timer, now);
  const state = timer?.state ?? 'idle';
  const label =
    state === 'idle'
      ? t('timers.start', { phrase: duration.phrase })
      : state === 'running'
        ? t('timers.pause', { phrase: duration.phrase, left: formatClock(left) })
        : state === 'paused'
          ? t('timers.resume', { phrase: duration.phrase, left: formatClock(left) })
          : t('timers.again', { phrase: duration.phrase });
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
      {state === 'running' && <span className={cx(s.chipTime, 'tabular')}>{t('timers.running', { left: formatClock(left) })}</span>}
      {state === 'paused' && <span className={cx(s.chipTime, 'tabular')}>{t('timers.paused', { left: formatClock(left) })}</span>}
      {state === 'done' && <span className={s.chipTime}>{t('timers.done')}</span>}
    </button>
  );
}

export function TrayCard({ timer, now, desktop }: { timer: Timer; now: number; desktop: boolean }): JSX.Element {
  const { t } = useTranslation();
  const left = remaining(timer, now);
  if (timer.state === 'done') {
    return (
      <div className={cx(s.card, s.cardDone)}>
        <span className={s.cardBell} aria-hidden>
          <Bell size={22} strokeWidth={2} />
        </span>
        <div className={s.cardText}>
          {/* i18n: timer.label comes from detectDurations (domain/kitchen/durations.ts): "Oven", "Step 3" or a verb from the step. */}
          <span className={s.cardTitle}>{t('timers.cardDone', { label: timer.label })}</span>
          <span className={s.cardSub}>{t('timers.finished', { time: formatClock(timer.durationSec) })}</span>
        </div>
        {desktop && (
          <button type="button" className={s.cardGhost} onClick={() => addMinute(timer.id)}>
            {t('timers.plusMinute')}
          </button>
        )}
        <button type="button" className={s.cardDark} onClick={() => dismiss(timer.id)}>
          {t('timers.dismiss')}
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
      <span className={cx(s.clock, 'tabular')} aria-label={t('timers.left', { time: formatClock(left) })}>
        {formatClock(left)}
      </span>
      {timer.state === 'running' ? (
        <button type="button" className={s.round} aria-label={t('timers.pauseLabel', { label: timer.label })} onClick={() => pause(timer.id)}>
          <Pause size={22} strokeWidth={0} fill="currentColor" />
        </button>
      ) : (
        <button type="button" className={s.round} aria-label={t('timers.resumeLabel', { label: timer.label })} onClick={() => resume(timer.id)}>
          <Play size={22} strokeWidth={0} fill="currentColor" />
        </button>
      )}
      <button type="button" className={s.round} aria-label={t('timers.cancelLabel', { label: timer.label })} onClick={() => cancel(timer.id)}>
        <X size={22} strokeWidth={2.2} />
      </button>
    </div>
  );
}
