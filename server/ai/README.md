# server/ai
AI recipe reading: send pasted text or a web page to a language model on OpenRouter and get back a recipe in the importer's shape. One dependency-free `(Request) => Promise<Response>` handler.

## Files
| File | Responsibility |
| --- | --- |
| `index.ts` | The public surface: re-exports `createAiHandler`, `MAX_TEXT` and the types. |
| `handler.ts` | `createAiHandler(options)`: routes `POST /api/ai/extract` and `POST /api/ai/key`, the order of every step, error codes to statuses, logging. |
| `openrouter.ts` | The one fixed chat request (`chatBody()`), `callChat()` with its time limit, `chatError()` (OpenRouter's answers as our codes), `checkKey()`, and the model-id rules (`isModelId()`, `freeModelList()`). |
| `prompt.ts` | The fixed system prompt, the nonce-delimited user message and `RECIPE_SCHEMA`, the closed JSON schema the model must answer in. |
| `validate.ts` | `validateOutput()`: exact keys, exact types, plain text, every limit; rejects instead of repairing. |
| `pageText.ts` | `pageText()`: a fetched page as plain text (up to 20,000 characters) and its `og:image`, in one linear pass with no DOM library. |
| `crypto.ts` | `importSecret()`, `encryptKey()`, `decryptKey()`: AES-256-GCM for a family's own key. |
| `store.ts` | `postgrestStore()`: the family's AI settings and the free-read counter through Supabase's database functions, as the member. |
| `types.ts` | `AiError`, `QuotaScope`, `ClaimResult`, `AiStore`, `AiLogEntry`, `AiOptions`. |
| `testing.ts` | Test-only helpers shared by the test files (fake store, fake network, request builders). Nothing else imports it. |
| `ai.test.ts`, `injection.test.ts`, `openrouter.test.ts`, `validate.test.ts`, `pageText.test.ts`, `crypto.test.ts`, `store.test.ts` | See Tests. |

## How it works
- Production: `../../functions/api/ai/[[path]].ts` exports `onRequest` as the Cloudflare Pages Function for `/api/ai/*`. It builds the handler on the first request of an isolate and keeps it, so the one-time warning about `OPENROUTER_FREE_MODELS` is not repeated per request. It passes no `resolveHost`: Workers have no DNS API, so the importer's guard judges a URL alone.
- Development and `vite preview`: `../../vite.config.ts` mounts `createAiHandler({ resolveHost, ... })` at `/api/ai`, with Node DNS, the keys and secret from `.env.local`, and the app's own `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. It forwards the `authorization` header on every route (the other two ignore it).
- Every answer is JSON with `cache-control: no-store`. Any method but POST, and any path but `/api/ai/extract` and `/api/ai/key` (a trailing slash is fine), gets 405 `method`.
- `POST /api/ai/extract` takes `{ text }` or `{ url }` (exactly one) and answers `{ recipe, report }`, the same shape as `/api/import`. In order:
  1. `Authorization: Bearer <member's Supabase access token>` must be there and use only JWT characters (letters, digits, `- _ . ~ + / =`), or `unauthorized`.
  2. The body is at most 128 KB of JSON with exactly one of `text` or `url`, each a string, or `too-large` / `invalid-input`. A larger `Content-Length` is refused unread; without one, the importer's `readCapped()` reads the body in chunks and cancels it as soon as it passes 128 KB, so no body is ever held whole. Text is trimmed: empty is `invalid-input`, over 20,000 characters (string length) is `too-large`. A URL goes through the importer's `checkUrl()`, so `invalid-url` or `blocked` come before anything is spent.
  3. Without the Supabase URL and key, `unavailable`.
  4. The claim, one call to Supabase with the member's token: 401 or a member in no family is `unauthorized`, a spent allowance is `quota-exceeded` with `scope` `user` or `app`; otherwise the read is `free` or `family` (the family's encrypted key and chosen model).
  5. The configuration is checked before any page is fetched: the free path needs the shared key and at least one valid free model, the family path a 32-byte `AI_KEY_SECRET`, and a model the family chose must be a plain model id; else `unavailable` (`model-failed` for a bad chosen model). A family key with no model chosen runs the free list on the family's own key (spec A5), so that path needs at least one valid `OPENROUTER_FREE_MODELS` entry too, or it is `unavailable`; it does not need the shared `OPENROUTER_API_KEY`.
  6. A URL is fetched with the importer's `fetchPage()` (its guard on every redirect), then `pageText()` reads at most the first 1,000,000 characters of the HTML. Text that comes out empty is `not-a-recipe` and the model is not called.
  7. The family key is decrypted last, so the plaintext lives only for the one model call. A key that will not decrypt is `key-invalid`.
  8. One chat completion to OpenRouter; `chatError()` turns a failure into a code.
  9. `validateOutput()` checks the answer: `found: false`, an empty title or no ingredients is `not-a-recipe`; anything else wrong is `model-failed`.
  10. The `ImportedRecipe` is built from the validated fields. `url` (the final one after redirects), `site` and `image` are set from our own reading of the page, never from the model; `equipment` comes from `detectEquipment(steps)`.
- `POST /api/ai/key` takes `{ key }` and answers `{ saved: true }`. In order: token as above; body at most 128 KB with a string `key` (read the same capped way); the trimmed key must match `^sk-or-[A-Za-z0-9_-]{20,200}$` (else `key-invalid`, OpenRouter not asked); a usable `AI_KEY_SECRET` and the Supabase settings (else `unavailable`); the member's family id from Supabase, before OpenRouter is asked, so the route is no anonymous way to test keys (none is `unauthorized`); `checkKey()` against OpenRouter, which refuses a management or provisioning key; then the encrypted key and its last four characters are stored.
- Error codes and statuses: `unauthorized` 401, `invalid-input` 400, `too-large` 413, `quota-exceeded` 429, `key-invalid` 422, `key-out-of-credit` 402, `model-failed` 502, `not-a-recipe` 422, `timeout` 504, `unavailable` 503, `method` 405, and from the importer `invalid-url` 400, `blocked` 400, `fetch-failed` 502 (its `not-found` becomes `not-a-recipe`).
- How OpenRouter's answer maps (`chatError()`). Free path: 401 and 402 `unavailable` (the shared key is broken), 429 `quota-exceeded` with scope `app`, 408 or our own timeout `timeout`, anything else `model-failed`. Family path: 401 `key-invalid`, 402 `key-out-of-credit`, 408 `timeout`, anything else including 429 `model-failed`. A family whose key fails never falls back to the free tier. A 200 is `model-failed` too unless its first choice finished with `stop` and holds string content, with no `error` at the top or on the choice; `"error": null` counts as no error.
- Limits: pasted text 20,000 characters; request body 128 KB; page text cut at 20,000 characters (from at most the first 1,000,000 characters of HTML); page fetch 10 s and 5 MB; Supabase call 10 s; model call 60 s; key check 10 s; `max_completion_tokens` 6000; `temperature` 0; model output 40,000 characters plus the field limits in `validate.ts`; free reads 5 per user and 45 for the app per UTC day (counted in the database, not here).
- Free models: `OPENROUTER_FREE_MODELS` is split on commas and only plain `vendor/model:free` ids count (`isModelId()`), the first three kept. The request sends `model` as the first and `models` as the whole list, so OpenRouter falls back in order. An entry that is not valid is named in one `warn` when the handler is made, but only if it looks like a model id (a `/`, no `sk-`, at most 100 characters); any other shows as `<hidden entry N>`, N being its place in the list, so a key pasted there never reaches the log. A family's chosen model is sent alone, with no fallbacks; a family with a key and no chosen model uses this same list, on its own key.
- The request is fixed apart from the text: a strict JSON-schema response format, `provider.require_parameters`, no tools, no plugins, no `:online` models. The text sits between `<<<RECIPE nonce>>>` and `<<<END nonce>>>` lines with a new random nonce per read, and the prompt says it is data.
- The family key: `v1:<iv>:<ciphertext>`, both base64url, AES-256-GCM under `AI_KEY_SECRET` (32 random bytes, base64) with the family id as additional authenticated data, so a ciphertext opens only for the family it was made for. It is decrypted only for the call that uses it and is never in a response, a log line or the model's context. Postgres never sees the secret or the plaintext.
- Logging: one JSON line per read or save on `console.info`, `{ ai: { route, error?, status?, model? } }`: the route, our error code, OpenRouter's HTTP status and the model id that answered.

## Connections
- Uses: `../import/` (`checkUrl`, `fetchPage`, `readCapped`, `siteOf`, `detectEquipment`, `decodeEntities`), OpenRouter at `https://openrouter.ai/api/v1`, and Supabase PostgREST (the database functions in `../../supabase/schema.sql`), all over `fetch`; AES-GCM over WebCrypto.
- Used by: `../../functions/api/ai/[[path]].ts`, `../../vite.config.ts`, and, for types only, `../../src/ai/`.
- Variables, all server-only and none with a `VITE_` prefix. In production, on the Cloudflare Pages project: the secrets `OPENROUTER_API_KEY` and `AI_KEY_SECRET`, and the plain variables `OPENROUTER_FREE_MODELS`, `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The dev server reads `OPENROUTER_API_KEY`, `OPENROUTER_FREE_MODELS` and `AI_KEY_SECRET` from `.env.local`, and passes the app's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in place of `SUPABASE_URL` and `SUPABASE_ANON_KEY`. `../../.env.example` explains each.

## Rules & gotchas
- The browser code imports only types from here (`import type`); a value import would put server code in the app bundle.
- Only `store.ts` calls the database functions on the server side (the browser's calls are in `src/data/supabase/`). No other code here names one; add a new call there. `types.ts` mentions `claim_ai_request` in a comment, and `ai.test.ts` and `store.test.ts` assert the URL it is called at.
- Never log or return either key, the member's token, `AI_KEY_SECRET`, the input text, the page text or the model's output, and never OpenRouter's error text, which can repeat the input back. No `catch` logs a request or an error message.
- No tools, plugins or `:online` models, and the server never acts on the model's output: it is validated and returned as data, and the person decides whether to save it.
- Every Supabase call carries the member's own token with the project's publishable key, never a service key, so the database decides what a member may do. The function never decodes the token itself.
- A claimed free read counts even if a later step fails (the page, the model, the validation). The claim is the one atomic step, and it comes before the page is fetched so a person with no reads left is told at once.
- Call the injected `fetch` unbound (`const doFetch = options.fetch; doFetch(...)`): as a method it throws "Illegal invocation" on Workers when it is the global.
- Dev and production share one Supabase project, but their `AI_KEY_SECRET`s differ. A key saved through `npm run dev` does not decrypt in production, where reads answer `key-invalid` until it is added again. Locally, save keys only to the test families.
- A Cloudflare Pages variable applies to deploys made after it is set, and the handler is built once per isolate: change one, then deploy again.
- `tsconfig.json` includes `server/` and `functions/`, so `npm run build` type-checks them.

## Tests
No test calls OpenRouter or Supabase. `ai.test.ts` and `injection.test.ts` call `blockRealNetwork()` (`testing.ts`), which stubs the global `fetch` to throw for every test in the file, and each test passes its own `fetch` and store. The other test files never touch the global `fetch`: they pass their own.
- `ai.test.ts`: both routes end to end with a fake store and network: the free and family paths, every check that comes before any work (a body over 128 KB in bytes but not in characters, and a streamed body with no `Content-Length` cut off soon after 128 KB), configuration gaps, every OpenRouter answer mapped, a URL read (redirects, private addresses, the 5 MB cap, the 1,000,000-character cut), logs and answers free of keys, routing, and the one-time warning, which never prints an entry that could be a key.
- `injection.test.ts`: hostile pages and hostile model answers, with `../../tests/fixtures/ai/`: text stays inside markers the page cannot know, hidden elements are dropped, and an obeying model's extra fields, images, markup and oversized output achieve nothing.
- `openrouter.test.ts`: model ids, the fixed request, `callChat()` outcomes (`"error": null` included), `chatError()`, `checkKey()`, and that `fetch` is called unbound.
- `validate.test.ts`: the prompt and schema, `validateOutput()` accepting and rejecting, and tag stripping in linear time on 40,000 characters of unclosed `<a`.
- `pageText.test.ts`: dropped and hidden elements, region choice, entities (one past U+10FFFF kept as written), `og:image`, the cut, and linear time on unclosed tags.
- `crypto.test.ts`: round trip, another family, tampering, another secret, unknown versions, a bad secret.
- `store.test.ts`: the database calls and headers, the member's token, refusals, and unexpected answers.
