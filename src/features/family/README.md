# family
The Family page (`/family`): members, the invite link and join code, and this device's theme and language.

## Files
| File | Responsibility |
| --- | --- |
| `FamilyPage.tsx` (+ `FamilyPage.module.css`) | Invite link (share sheet or copy), join code, rotating the code, members, and one "On this device" card with the theme toggle and language picker. |
| `FamilyPage.test.tsx` | Renders this page and `../board/BoardPage.tsx` with a signed-in session's shape, since the invite copy never shows in demo mode. |

## How it works
- On mount it calls `refreshFamily()`, since `families` is not in the realtime publication and another member may have rotated the code (`FamilyPage.tsx`, `../../auth/session.tsx`).
- "New code" confirms in a `Sheet`, then calls `rotateJoinCode()`; old codes and links stop working, which only the `Sheet` explains (`FamilyPage.tsx`, `../../auth/invite.ts`).
- Share uses `navigator.share` where it exists; closing the share sheet is not treated as a failure, anything else falls back to copying (`FamilyPage.tsx`).
- The language picker shows only when `LOCALES` has more than one entry (`FamilyPage.tsx`, `../../i18n/i18n.ts`).

## Connections
- Uses: `../../auth/session.tsx`, `../../auth/invite.ts`, `../../components/` (PageHeader, ui, theme/ThemeToggle), `../../i18n/`.
- Used by: `../../app/AppRoutes.tsx` (lazy, and not waiting for the kitchen).

## Rules & gotchas
- In demo mode there is no `family`, `rotateJoinCode` or `refreshFamily`; the page shows a note instead of a code (`FamilyPage.tsx`).
- This page is the only place to change language, and below 1024px the only place to change theme: the sidebar with its toggle shows from 1024px (`../../app/Shell.module.css`).
- The invite text must keep saying the code is not a password (`family.invite.howTo`); `FamilyPage.test.tsx` checks it.

## Tests
`FamilyPage.test.tsx` (jsdom): with a family, the page shows the link, the code, the not-a-password note and New code, and puts theme and language under "On this device"; the board shows the code and a link to this page only while you are the only member.
