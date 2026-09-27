# auth
Who is signed in and which family's `DataStore` they get: two interchangeable sessions behind one `useSession()`.

## Files
| File | Responsibility |
| --- | --- |
| `session.tsx` | `Session` and `Family` types, `useSession()`, and `SessionProvider`, which picks a session by `VITE_BACKEND`. |
| `demoSession.tsx` | Local backend: family `demo-family`, members Alex and Sam, "I am" per tab in sessionStorage; seeds columns and the demo kitchen. |
| `supabaseSession.tsx` | Supabase Auth phases: loading, signedOut, recovering, noFamily, ready. Builds and preloads the cached store. |
| `membership.ts` (+ `membership.test.ts`) | `readMembership()` (member and family in one request) and `readFamily()`. |
| `invite.ts` (+ `invite.test.ts`) | `/join/<code>` links: `captureInvite()`, `pendingInvite()`, `clearInvite()`, `inviteLink()`. |
| `useInviteFamily.ts` | Names the family behind an invite code through the `invite_family_name` RPC. |
| `auth.css` | Global `.gate` styles for the screens below, imported last in `main.tsx`. |
| `screens/SignIn.tsx` | Email and password sign-in, sign-up, forgotten password, remember-me. |
| `screens/JoinOrCreate.tsx` | Signed in but in no family: the `join_family` or `create_family` RPC. |
| `screens/SetNewPassword.tsx` | After a recovery link: `auth.updateUser({ password })`. |

## How it works
- `SessionProvider` compares `import.meta.env.VITE_BACKEND` directly, so a Supabase build leaves `DemoSession` and the demo seed out of the bundle (`session.tsx`).
- `resolve()` reads membership; with a family it clears the pending invite, builds `withCache(createSupabaseStore(...))`, calls `preloadStore()`, then runs `seedDefaultColumns()` and `ensureKitchen()` together (`supabaseSession.tsx`).
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
- The screens and `useInviteFamily` call `getSupabaseClient()`, which throws without `VITE_SUPABASE_*`; they render only under `SupabaseSession`.

## Tests
`invite.test.ts` (jsdom): link format, capture, keeping query and hash, clearing. `membership.test.ts`: the live project from `.env.test`; skips without it.
