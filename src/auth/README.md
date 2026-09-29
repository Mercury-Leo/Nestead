# auth
Who is signed in and which family's `DataStore` they get: two interchangeable sessions behind one `useSession()`.

## Files
| File | Responsibility |
| --- | --- |
| `session.tsx` | `Session` and `Family` types, `useSession()`, and `SessionProvider`, which picks a session by `VITE_BACKEND`. |
| `demoSession.tsx` | Local backend: family `demo-family`, members Alex and Sam, "I am" per tab in sessionStorage; seeds columns and the demo kitchen. |
| `supabaseSession.tsx` | Supabase Auth phases: loading, signedOut, recovering, noFamily, ready. |
| `openFamily.ts` | `openFamily()`: membership plus a cached, preloading store and the new-family setup; `lastFamilyOf()` and `rememberFamily()`, the device's guess. |
| `membership.ts` (+ `membership.test.ts`) | `readMembership()` (member and family in one request) and `readFamily()`. |
| `invite.ts` (+ `invite.test.ts`) | `/join/<code>` links: `captureInvite()`, `pendingInvite()`, `clearInvite()`, `inviteLink()`. |
| `useInviteFamily.ts` | Names the family behind an invite code through the `invite_family_name` RPC. |
| `auth.css` | Global `.gate` styles for the screens below, imported last in `main.tsx`. |
| `screens/SignIn.tsx` | Email and password sign-in, sign-up, forgotten password, remember-me. |
| `screens/JoinOrCreate.tsx` | Signed in but in no family: the `join_family` or `create_family` RPC. |
| `screens/SetNewPassword.tsx` | After a recovery link: `auth.updateUser({ password })`. |

## How it works
- `SessionProvider` compares `import.meta.env.VITE_BACKEND` directly, so a Supabase build leaves `DemoSession` and the demo seed out of the bundle (`session.tsx`).
- `resolve()` calls `openFamily()`, which reads membership and returns `withCache(createSupabaseStore(...))` with `preloadStore()` already running and `seedDefaultColumns()` and `ensureKitchen()` under way. With a family, `resolve()` clears the pending invite, remembers the family for this user on this device, and waits for that setup (`supabaseSession.tsx`, `openFamily.ts`).
- On a device that has opened the app before, `openFamily()` starts the remembered family's store while membership is being read, which saves a round trip on launch. If membership names another family, that store is dropped and a new one starts. A user belongs to one family at most, so RLS shows a stale guess no rows and refuses its setup writes (`openFamily.ts`).
- `resolvedFor` keeps the store across repeat auth events for the same user (startup, hourly refresh) instead of rebuilding it and its channels (`supabaseSession.tsx`).
- A recovery link is read before the client starts (`takeRecoveryLink()` in `../data/supabase/supabaseClient.ts`) and holds the phase on `SetNewPassword` (`supabaseSession.tsx`).
- `main.tsx` calls `captureInvite()` before the router reads the address; the code waits in localStorage until the person is in a family (`invite.ts`).

## Connections
- Uses: `../data/` (`createStore`, `withCache`, `preloadStore`, `useCollection`), `../data/supabase/`, `../features/board/defaultColumns.ts`, `../features/larder/setup.ts`, `../features/larder/seed/seedKitchen.ts`.
- Used by: `../main.tsx`, `../app/`, and every screen through `useSession()`.

## Rules & gotchas
- Screens depend on the `Session` shape: `setMe` exists only in demo mode; `family`, `rotateJoinCode` and `refreshFamily` only with Supabase (`session.tsx`).
- `readMembership()` must filter by `id`: RLS returns every member of the family (`membership.ts`).
- `families` is not in the realtime publication, so a code rotated elsewhere appears only through `refreshFamily()` (`session.tsx`).
- The remembered family is only a head start. Nothing shows until membership confirms it, and it must never decide what a user may see; RLS does that (`openFamily.ts`). It lives in the device preference `lastFamily`, keyed by user id, and is cleared when membership finds no family.
- The screens and `useInviteFamily` call `getSupabaseClient()`, which throws without `VITE_SUPABASE_*`; they render only under `SupabaseSession`.

## Tests
`invite.test.ts` (jsdom): link format, capture, keeping query and hash, clearing. `membership.test.ts`: the live project from `.env.test`; skips without it.
