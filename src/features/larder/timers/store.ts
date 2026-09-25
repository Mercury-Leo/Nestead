import { useEffect, useState, useSyncExternalStore } from 'react';
import { readPreference, writePreference } from '../../../data/local/localStore';

/**
 * Cook-mode timers. They belong to this device, not the family: the oven
 * timer is ticking in this kitchen. Several can run at once.
 *
 * A running timer stores when it ends, never how long is left, so the time
 * shown is always worked out from Date.now(). It stays right in a background
 * tab, across route changes and after a reload.
 */

export interface Timer {
  id: string;
  recipeId: string;
  recipeTitle: string;
  stepIndex: number;
  /** Which chip in which step started it; one active timer per chip. */
  chipKey: string;
  /** "Oven", "Sear", "Step 3". */
  label: string;
  /** "bake 50 min". */
  phrase: string;
  durationSec: number;
  /** Epoch ms; set while running. */
  endsAt: number | null;
  /** Seconds left; authoritative while paused. */
  remainingSec: number;
  state: 'running' | 'paused' | 'done';
  /** Done, and somebody has seen it: no more alerts, no tray card. */
  acknowledged: boolean;
}

export type NewTimer = Pick<Timer, 'recipeId' | 'recipeTitle' | 'stepIndex' | 'chipKey' | 'label' | 'phrase' | 'durationSec'>;

// Per device, so not per family: the preference helper's scope is "device".
const SCOPE = 'device';
const KEY = 'timers';

function load(): Timer[] {
  const raw = readPreference(SCOPE, KEY);
  return Array.isArray(raw) ? (raw as Timer[]) : [];
}

let timers: Timer[] = load();
const listeners = new Set<() => void>();

function set(next: Timer[]): void {
  timers = next;
  writePreference(SCOPE, KEY, timers);
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTimers(): Timer[] {
  return useSyncExternalStore(subscribe, () => timers);
}

/** A clock that re-renders its user every quarter second while mounted. */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function remaining(timer: Timer, now: number): number {
  if (timer.state === 'running' && timer.endsAt !== null) return Math.max(0, (timer.endsAt - now) / 1000);
  return timer.state === 'done' ? 0 : timer.remainingSec;
}

function update(id: string, change: (timer: Timer) => Timer): void {
  set(timers.map((timer) => (timer.id === id ? change(timer) : timer)));
}

function askToNotify(): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }
  } catch {
    // Some browsers throw instead of rejecting; a refusal is fine either way.
  }
}

export function findTimer(recipeId: string, chipKey: string): Timer | undefined {
  return timers.find((timer) => timer.recipeId === recipeId && timer.chipKey === chipKey);
}

/** Starts a chip's timer, replacing any earlier run of the same chip. */
export function start(spec: NewTimer): void {
  askToNotify();
  const now = Date.now();
  const timer: Timer = {
    ...spec,
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    endsAt: now + spec.durationSec * 1000,
    remainingSec: spec.durationSec,
    state: 'running',
    acknowledged: false,
  };
  set([...timers.filter((t) => !(t.recipeId === spec.recipeId && t.chipKey === spec.chipKey)), timer]);
}

export function pause(id: string): void {
  update(id, (timer) =>
    timer.state !== 'running' ? timer : { ...timer, state: 'paused', remainingSec: remaining(timer, Date.now()), endsAt: null },
  );
}

export function resume(id: string): void {
  update(id, (timer) =>
    timer.state !== 'paused' ? timer : { ...timer, state: 'running', endsAt: Date.now() + timer.remainingSec * 1000 },
  );
}

export function cancel(id: string): void {
  set(timers.filter((timer) => timer.id !== id));
}

/** "+1 min": a done timer runs again for a minute; a running one gets longer. */
export function addMinute(id: string): void {
  const now = Date.now();
  update(id, (timer) => {
    if (timer.state === 'done') {
      return { ...timer, state: 'running', endsAt: now + 60_000, remainingSec: 60, durationSec: timer.durationSec + 60, acknowledged: false };
    }
    if (timer.state === 'running' && timer.endsAt !== null) {
      return { ...timer, endsAt: timer.endsAt + 60_000, durationSec: timer.durationSec + 60 };
    }
    return { ...timer, remainingSec: timer.remainingSec + 60, durationSec: timer.durationSec + 60 };
  });
}

export function dismiss(id: string): void {
  update(id, (timer) => ({ ...timer, acknowledged: true }));
}

/** Clears a recipe's finished timers, e.g. on "Finish cooking". */
export function clearFinished(recipeId: string): void {
  set(timers.filter((timer) => !(timer.recipeId === recipeId && timer.state === 'done')));
}

/**
 * Marks timers whose time has come as done and returns them. Called by the
 * host every second, and once on load for timers that ended while closed.
 */
export function tick(now = Date.now()): Timer[] {
  const finished: Timer[] = [];
  let changed = false;
  const next = timers.map((timer) => {
    if (timer.state === 'running' && timer.endsAt !== null && timer.endsAt <= now) {
      changed = true;
      const done: Timer = { ...timer, state: 'done', remainingSec: 0, endsAt: null };
      finished.push(done);
      return done;
    }
    return timer;
  });
  if (changed) set(next);
  return finished;
}
