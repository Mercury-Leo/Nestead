# ai
The browser side of `/api/ai`: send a pasted recipe, a link or a new family key with the member's token, get a typed outcome back, and turn every error code into words.

## Files
| File | Responsibility |
| --- | --- |
| `client.ts` | `extractRecipe()` and `saveFamilyKey()` (typed outcomes), `nextUtcMidnight()`, `aiErrorMessage()`, and the types `FamilyAi`, `AiInput`, `AiFailure`, `ExtractOutcome`, `SaveKeyOutcome`. |
| `client.test.ts` | The request sent, each kind of answer, signed out, every code in words, when free reads come back. |

## How it works
- The token comes from `session.ai.token()` (`FamilyAi` is `NonNullable<Session['ai']>`, so it exists for real accounts only). It goes in an `authorization: Bearer` header on every call and nowhere else (`post()`).
- Order in `post()`: offline first (`navigator.onLine`, as the importer checks it), then the token. A `null` token is `unauthorized` with no request made. A failed `fetch` is `unavailable`, or `offline` if the browser went offline meanwhile.
- Anything that is not a JSON object is `unavailable`, whatever the status. `{ error }` becomes `{ kind: 'error', code }`, plus `scope` (`user` or `app`) when the server sends one with `quota-exceeded`. `extractRecipe()` also needs both `recipe` and `report`, and `saveFamilyKey()` needs `saved: true`, or the outcome is `unavailable`.
- `aiErrorMessage(code, { input, scope, now })` words depend on what was being read: `input: 'key'` is a key the person just typed, so `key-invalid` is `ai.error.keyRejected`; for text or a link it is a stored key that stopped working (`keyBroken`). `key-out-of-credit` splits the same way, `invalid-input` says "paste a recipe" only for text, and `too-large` reuses `import.error.tooLarge` for a link and `ai.error.textTooLong` for text.
- `offerWrite` is `true` for `model-failed`, `not-a-recipe` and `fetch-failed`, so the screen can offer "write it yourself". The offline and link errors reuse `import.offline` and `import.error.*`; the rest are under `ai.error.*` in `../i18n/locales/`.
- Free reads come back at 00:00 UTC (`nextUtcMidnight()`). The quota message shows that moment in the device's own time zone and locale (`formatDate()`), with `ai.error.quotaUser` for the person's 5 reads and `ai.error.quotaApp` for Nestead's shared allowance.
- `method` and any code this file does not know fall to `ai.error.unavailable`.

## Connections
- Uses: `../../server/ai` and `../../server/import` (types only), `../auth/session.tsx` (the `Session` type) and `../i18n`.
- Used by: `../features/larder/import/` (reading pasted text or a link) and `../features/family/` (saving the family key).

## Rules & gotchas
- Types only from `server/` (`import type`); a value import would put server code in the bundle.
- Never store or log the key, the token or the server's error text. Messages come only from i18n keys, and an outcome carries a code (and a scope), never the server's words.
- Screens call this module, never `/api/ai` directly.
- A new `AiError` code in `server/ai` shows as "not available right now" until it gets a `case` in `aiErrorMessage()` and a place in the code list of `client.test.ts`: the `default` branch hides it from the compiler.
- Keep both keys of a choice as literal strings in `t()` (an `if` or a ternary, not a computed key), or `../i18n/i18n.test.ts` cannot see that they are used.

## Tests
`client.test.ts` (jsdom, `fetch` stubbed): the route, body and `Bearer` header; a recipe passed through; an error code and quota scope passed through; no request when signed out; a non-JSON answer is `unavailable`; the key posted once to `/api/ai/key`; a message for every code and input; the user, app, key and stored-key wordings; `offerWrite`; `nextUtcMidnight()` across a day and a year end.
