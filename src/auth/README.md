# auth
Who is signed in and which family's `DataStore` they get: two interchangeable sessions behind one `useSession()`. Nothing here knows which backend is underneath, except `session.tsx`, which names it.

## Files
| File | Responsibility |
| --- | --- |
| `session.tsx` | `Session` type (and `Family`, re-exported from `../data/types.ts`), `useSession()`, and `SessionProvider`: the swap point, which picks a session and backend by `VITE_BACKEND`. |
| `demoSession.tsx` | Local backend: family `demo-family`, members Alex and Sam, "I am" per tab in sessionStorage; seeds columns and the demo kitchen. |
| `accountSession.tsx` (+ `accountSession.test.tsx`) | `AccountSession`: real sign-in over any backend's `Account`. Phases: loading, signedOut, recovering, noFamily, ready. |
| `openFamily.ts` | `openFamily()`: membership plus a cached, preloading store and the new-family setup; `lastFamilyOf()` and `rememberFamily()`, the device's guess. |
| `invite.ts` (+ `invite.test.ts`) | `/join/<code>` links: `captureInvite()`, `pendingInvite()`, `clearInvite()`, `inviteLink()`. |
| `useInviteFamily.ts` | Names the family behind an invite code through `Account.inviteFamilyName()`. |
| `auth.css` | Global `.gate` styles for the screens below, imported last in `main.tsx`. |
| `screens/SignIn.tsx` | Email and password sign-in, sign-up, forgotten password, remember-me. |
| `screens/JoinOrCreate.tsx` | Signed in but in no family: `Account.joinFamily()` or `createFamily()`. |
| `screens/SetNewPassword.tsx` | After a recovery link: `Account.setPassword()`. |

## How it works
- `SessionProvider` compares `import.meta.env.VITE_BACKEND` directly, so a Supabase build leaves `DemoSession` and the demo seed out of the bundle; an unknown value throws (`session.tsx`). With `supabase` it renders `<AccountSession account={supabaseAccount()}>`.
- `AccountSession` and the screens it shows talk only to the `Account` they are given (`../data/types.ts`); the screens get it as a prop.
- `resolve()` calls `openFamily()`, which reads membership and returns `withCache(account.openStore(...))` with `preloadStore()` already running and `seedDefaultColumns()` and `ensureKitchen()` under way. With a family, `resolve()` clears the pending invite, remembers the family for this user on this device, and waits for that setup (`accountSession.tsx`, `openFamily.ts`).
- On a device that has opened the app before, `openFamily()` starts the remembered family's store while membership is being read, which saves a round trip on launch. If membership names another family, that store is dropped and a new one starts. A user belongs to one family at most, so the backend shows a stale guess no rows and refuses its setup writes (`openFamily.ts`).
- `resolvedFor` keeps the store across repeat auth events for the same user (startup, hourly refresh) instead of rebuilding it and its channels (`accountSession.tsx`).
- A recovery link is read once, before `watchUser()` (`Account.takeRecoveryLink()`), and holds the phase on `SetNewPassword`; so does a change `watchUser()` flags as recovery (`accountSession.tsx`).
- `main.tsx` calls `captureInvite()` before the router reads the address; the code waits in localStorage until the person is in a family (`invite.ts`).

## Connections
- Uses: `../data/` (`Account`, `withCache`, `preloadStore`, `useCollection`, `createLocalStore` for the demo), `../data/supabase/supabaseAccount.ts` (`session.tsx` only), `../features/board/defaultColumns.ts`, `../features/larder/setup.ts`, `../features/larder/seed/seedKitchen.ts`.
- Used by: `../main.tsx`, `../app/`, and every screen through `useSession()`.

## Rules & gotchas
- Screens depend on the `Session` shape: `setMe` exists only in demo mode; `family`, `rotateJoinCode` and `refreshFamily` only with Supabase (`session.tsx`).
- `families` is not in the realtime publication, so a code rotated elsewhere appears only through `refreshFamily()` (`session.tsx`).
- The remembered family is only a head start. Nothing shows until membership confirms it, and it must never decide what a user may see; RLS does that (`openFamily.ts`). It lives in the device preference `lastFamily`, keyed by user id, and is cleared when membership finds no family.
- Nothing in this folder but `session.tsx` may import a backend's adapter; `../data/boundary.test.ts` fails otherwise. Error messages the screens show come from the `Account` as is, so a new backend changes their wording.
- `supabaseAccount()` throws without `VITE_SUPABASE_*`, so it is called only in the `supabase` branch of `SessionProvider`.

## Tests
`invite.test.ts` (jsdom): link format, capture, keeping query and hash, clearing. `accountSession.test.tsx` (jsdom): `AccountSession` over an in-memory `Account` and the local store: sign-in screen, creating a family through to the app, a rotated code, a recovery link, signing out. The Supabase `Account` itself is tested live in `../data/supabase/`.
