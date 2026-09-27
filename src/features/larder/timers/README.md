# timers
Cook-mode timers: a store that lives on this device, and the host that finishes and announces them on any screen.

## Files
| File | Responsibility |
| --- | --- |
| `store.ts` | Timer state and actions: `useTimers`, `start`, `pause`, `resume`, `cancel`, `addMinute`, `dismiss`, `clearFinished`, `tick`; `useNow()`. |
| `TimerHost.tsx` (+ `Timers.module.css`) | Mounted once in `../../../app/Shell.tsx`: ticks every second, raises alerts, shows the done banner. |

## How it works
- A running timer stores `endsAt`, never time left; `remaining()` works it out from `Date.now()`, so a background tab or a reload stays right (`store.ts`).
- State is a module-level array written with `writePreference('device', 'timers')` on every change and read back on load (`store.ts`).
- One timer per chip: `start()` replaces an earlier run of the same recipe and `chipKey` (`store.ts`).
- `TimerHost` calls `tick()` on mount and every second; each finished timer chimes (Web Audio), vibrates, and sends a notification if allowed and the page is hidden (`TimerHost.tsx`).
- The chime repeats every 4 s, up to three times, until someone dismisses it (`TimerHost.tsx`).

## Connections
- Uses: `../../../data/local/localStore.ts`, `../../../domain/kitchen/durations.ts` (`TimerLabel`), `../labels.ts`, `../../../i18n/`.
- Used by: `../../../app/Shell.tsx` (`TimerHost`), `../cook/` (the store).

## Rules & gotchas
- Timers belong to the device, not the family: they never touch the `DataStore` (`store.ts`; see [ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md#the-kitchen-larder)).
- The literal scope `'device'` puts them at `nestead:device:pref:timers`, in the same namespace as `readDevicePreference()` (`store.ts`, `../../../data/local/localStore.ts`).
- Other tabs do not see timer changes: the store has no `storage` listener (`store.ts`).
- `label` is an English fallback kept for timers saved before `labelKind` existed (`store.ts`).
