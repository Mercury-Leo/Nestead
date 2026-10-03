# family
The Family page (`/family`): members, the invite link and join code, the AI assistant card, and this device's theme and language.

## Files
| File | Responsibility |
| --- | --- |
| `FamilyPage.tsx` (+ `FamilyPage.module.css`) | Invite link (share sheet or copy), join code, rotating the code, members, and one "On this device" card with the theme toggle and language picker. |
| `AiCard.tsx` | The "AI assistant" card: the free reads left, or the family's own OpenRouter key (its last four characters, who added it and when), a write-only key `Sheet`, a Remove confirmation `Sheet`, and the model choice. Styles live in `FamilyPage.module.css`. |
| `FamilyPage.test.tsx` | Renders this page and `../board/BoardPage.tsx` with a signed-in session's shape, since the invite copy never shows in demo mode, and the AI card with stubbed `fetch` and a stubbed `Session.ai`. |

## How it works
- On mount it calls `refreshFamily()`, since `families` is not in the realtime publication and another member may have rotated the code (`FamilyPage.tsx`, `../../auth/session.tsx`).
- "New code" confirms in a `Sheet`, then calls `rotateJoinCode()`; old codes and links stop working, which only the `Sheet` explains (`FamilyPage.tsx`, `../../auth/invite.ts`).
- Share uses `navigator.share` where it exists; closing the share sheet is not treated as a failure, anything else falls back to copying (`FamilyPage.tsx`).
- The language picker shows only when `LOCALES` has more than one entry (`FamilyPage.tsx`, `../../i18n/i18n.ts`).
- The AI card has three states: no `Session.ai` (demo) shows a note; no family key shows the free reads left and "Add family OpenRouter key"; a key shows its last four characters, who added it ("a former member" once they have left) and when, the model choice, Replace and Remove (`AiCard.tsx`, `../../auth/session.tsx`).
- The status is read when the card mounts, not through realtime, since the AI tables are not in the publication: another member's change shows on the next visit (`AiCard.tsx`).
- The key field is write-only. It is a password field with autocomplete off, cleared before `saveFamilyKey()` is awaited, and never put in storage, router state, a log or an error message; nothing shows the key again, only its last four characters. A refused key shows `aiErrorMessage()` and an empty field (`AiCard.tsx`, `../../ai/client.ts`).
- Remove asks in a `Sheet` before calling `clearKey()`; the free models are used again afterwards. A failed Remove or model save says `family.ai.failed`, never the server's own words (`AiCard.tsx`).
- The model is "Free models" (saved as `null`) or a typed OpenRouter id, checked in the field against the pattern the server and database check: `vendor/model`, lower case, at most 100 characters, optional `:free`, not starting with `openrouter/` (`AiCard.tsx`, `../../../server/ai/openrouter.ts`, `../../../supabase/schema.sql`).

## Connections
- Uses: `../../auth/session.tsx`, `../../auth/invite.ts`, `../../ai/client.ts` (`saveFamilyKey`, `aiErrorMessage`), `../../components/` (PageHeader, ui, theme/ThemeToggle), `../../i18n/`.
- Used by: `../../app/AppRoutes.tsx` (lazy, and not waiting for the kitchen).

## Rules & gotchas
- In demo mode there is no `family`, `rotateJoinCode`, `refreshFamily` or `ai`; the page shows a note instead of a code, and the AI card a note (`FamilyPage.tsx`, `AiCard.tsx`).
- This page is the only place to change language, and below 1024px the only place to change theme: the sidebar with its toggle shows from 1024px (`../../app/Shell.module.css`).
- The invite text must keep saying the code is not a password (`family.invite.howTo`); `FamilyPage.test.tsx` checks it.
- Links inside translations use `<a>…</a>` with `components={{ a: <a href=… /> }}`, not `<link>`: `link` is an HTML void element, so `<Trans>` drops the words out of the anchor and leaves an empty link (`AiCard.tsx`, `FamilyPage.test.tsx`).
- Never show a raw error from `clearKey()` or `setModel()`: a database check-constraint error can carry the stored row in its details (`AiCard.tsx`).

## Tests
`FamilyPage.test.tsx` (jsdom): with a family, the page shows the link, the code, the not-a-password note and New code, and puts theme and language under "On this device"; the board shows the code and a link to this page only while you are the only member.

The AI card, with a stubbed `fetch` and `Session.ai`: the free reads left and Add; the key line, Replace, Remove and the model choice, or "a former member"; the demo note. Saving a key sends it, empties the field before the answer, and leaves it in no input, no page text or attribute and no storage, also after a refusal or a failed token; Cancel forgets a typed key. Remove asks first, records `clear`, and says `family.ai.failed` when it fails. Model ids the server would refuse show the error and record nothing; a valid one records `model:<id>`, and Free models records `model:null`. jsdom has no modal `<dialog>`, so the test file stubs `showModal()` and `close()`.
