import { useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { i18n } from '../../../i18n';
import { formatClockDigits, timerLabel } from '../labels';
import { addMinute, dismiss, tick, useTimers } from './store';
import type { Timer } from './store';
import s from './Timers.module.css';

/**
 * Mounted once, in the shell, so timers finish and alert on every screen,
 * not only in cook mode.
 */

let audio: AudioContext | null = null;

/** A soft two-note chime from Web Audio: no sound files to ship. */
function chime(): void {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Context === undefined) return;
    audio ??= new Context();
    const ctx = audio;
    void ctx.resume();
    [880, 1318.5].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.22;
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 1);
    });
  } catch {
    // No audio is not worth failing over; the banner and vibration still work.
  }
}

function alert(timer: Timer): void {
  chime();
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    // Vibration is optional.
  }
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(i18n.t('timers.isDone', { label: timerLabel(i18n.t, timer) }), {
        body: i18n.t('timers.notificationBody', { phrase: timer.phrase, recipe: timer.recipeTitle }),
        tag: timer.id,
      });
    }
  } catch {
    // Some platforms only allow notifications from a service worker.
  }
}

export function DoneBanner({ timer }: { timer: Timer }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={s.banner} role="alert" aria-live="assertive">
      <div className={s.bannerTop}>
        <span className={s.bell} aria-hidden>
          <Bell size={26} strokeWidth={2} />
        </span>
        <div>
          <p className={s.bannerTitle}>{t('timers.isDone', { label: timerLabel(t, timer) })}</p>
          <p className={s.bannerSub}>{t('timers.timerFinished', { time: formatClockDigits(timer.durationSec) })}</p>
        </div>
      </div>
      <div className={s.bannerActions}>
        <button type="button" className={s.plusMinute} onClick={() => addMinute(timer.id)}>
          {t('timers.plusMinute')}
        </button>
        <button type="button" className={s.dismiss} onClick={() => dismiss(timer.id)}>
          {t('timers.dismiss')}
        </button>
      </div>
    </div>
  );
}

export function TimerHost(): JSX.Element | null {
  const timers = useTimers();
  const repeats = useRef(new Map<string, number>());

  // The clock: finish what is due, and alert once per timer.
  useEffect(() => {
    const run = (): void => {
      for (const timer of tick()) {
        repeats.current.set(timer.id, 1);
        alert(timer);
      }
    };
    run();
    const id = window.setInterval(run, 1000);
    return () => window.clearInterval(id);
  }, []);

  // The chime repeats up to three times until somebody dismisses it.
  useEffect(() => {
    const id = window.setInterval(() => {
      for (const timer of timers) {
        const count = repeats.current.get(timer.id);
        if (timer.state !== 'done' || timer.acknowledged || count === undefined || count >= 3) continue;
        repeats.current.set(timer.id, count + 1);
        chime();
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [timers]);

  const ringing = timers.filter((timer) => timer.state === 'done' && !timer.acknowledged);
  const latest = ringing[ringing.length - 1];
  return latest === undefined ? null : (
    <div className={s.bannerLayer}>
      <DoneBanner timer={latest} />
    </div>
  );
}
