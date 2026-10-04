# scripts/perf
Measurements behind [docs/PERFORMANCE.md](../../docs/PERFORMANCE.md): bundle size, page load, how the open app responds, and database timings. None of it runs in `npm test`.

## Files
| File | Responsibility |
| --- | --- |
| `bundle.mjs` | Builds through Vite's API and reports each chunk's modules and its raw, gzip and brotli size. |
| `browser.mjs` | Shared by the browser scripts: a local stand-in for Cloudflare Pages (and for Amazon's poster servers), headless Chrome, a small CDP client, throttling, and the interaction helpers (`INTERACTION_INSTRUMENT`, `interactions()`). |
| `pageload.mjs` | Cold and warm loads of a build, throttled like a phone: usable, FCP, LCP, CLS, long tasks, bytes by type (images apart). `--path` opens another page than the board. With `--after <previous build>`, the first open after a deploy instead of a warm load. |
| `redeploy.mjs` | Builds twice, the second time with a one-attribute change to the board page, and reports which files an app-only deploy makes every device download again. |
| `interact.mjs` | The open demo build with a heavy family: opening screens, ticking list items, typing a search, dragging a task, memory over 60 screens. |
| `shows.mjs` | The Shows page in the demo build: opening it, typing a name, cycling a status, a card's toggle, a status filter, and the page's element count. |
| `profile.mjs` | A CPU profile of one screen's load (or, with `--drag`, of a task drag), summed by function. Use an unminified build (`--minify false`) to read names. |
| `demodata.ts` | Writes the demo backend's localStorage for a typical and a heavy family (run with `npx vite-node`). |
| `db.perf.ts` | Database timings against the live project as test user A, through the app's own store, cache, actions and startup steps. |
| `fixtures.ts` | The rows both the demo data and the database runs use; shows (`showRows()`) are in the demo data only. |
| `net.ts` | Counts and times every request the Supabase clients make, per client. |
| `stats.ts` | Median and min–max of repeated runs. |
| `vitest.config.ts` | Runs `*.perf.ts` in Node with `.env.test` loaded. |

## How to run
Paths are relative to the repo. `<scratch>` is any folder outside it.

```
node scripts/perf/bundle.mjs production <scratch>/prod <scratch>/bundle-prod.json
VITE_BACKEND=local node scripts/perf/bundle.mjs demo <scratch>/demo <scratch>/bundle-demo.json
npx vite-node scripts/perf/demodata.ts <scratch>/demodata.json
node scripts/perf/pageload.mjs <scratch>/prod prod --ready "form input[type=email]" --out <scratch>/page-prod.json
node scripts/perf/pageload.mjs <scratch>/demo demo --data <scratch>/demodata.json --size typical --out <scratch>/page-demo.json
node scripts/perf/interact.mjs <scratch>/demo --data <scratch>/demodata.json --size heavy --out <scratch>/interact.json
node scripts/perf/shows.mjs <scratch>/demo --data <scratch>/demodata.json --size heavy --out <scratch>/shows.json
node scripts/perf/pageload.mjs <scratch>/demo shows --path /shows --ready "main article" --data <scratch>/demodata.json --size heavy
node scripts/perf/redeploy.mjs <scratch> production deploy
node scripts/perf/pageload.mjs <scratch>/deploy-b deploy --ready "form input[type=email]" --after <scratch>/deploy-a
PERF_OUT=<scratch>/db.json npx vitest run --config scripts/perf/vitest.config.ts
```

`db.perf.ts` takes `PERF_RUNS` (default 5), `PERF_SIZES` (`typical,heavy`), `PERF_ONLY` (e.g. `addRecipe,sync`) and `PERF_EXTRA_LATENCY_MS`.

## Rules & gotchas
- `db.perf.ts` writes to the production Supabase project, where the `.env.test` users live. It stays in test family A, seeds at most a few hundred rows and 30 tiny photos, and deletes everything it made in `afterAll`, then sweeps anything created since it started. Never raise the sizes into a load test.
- `npm test` with `.env.test` present wipes both test families. If it runs while `db.perf.ts` is measuring, seeded rows vanish mid-run: re-run.
- `.env.local` sets `VITE_BACKEND=supabase` and Vite loads it in every mode, so `vite build --mode demo` alone builds the Supabase app. Set `VITE_BACKEND=local` in the environment, which wins over `.env` files.
- Another client's delete never reaches a store's cache over realtime (see PERFORMANCE.md), so `db.perf.ts` deletes through the app's own store wherever the cache must stay right.
- Supabase's `channel()` returns an existing channel with the same topic, so each startup run gets a fresh client.
- Browser numbers depend on the host CPU (the 4x slowdown is relative). Compare runs from the same machine, with nothing else busy.
- The demo shows' poster links point at `https://perf-posters.invalid`; `installDemoData()` swaps in the harness server's origin, and the server answers `/perf-posters/<name>._V1_SX<width>.jpg` with one real OMDb poster at 100, 200 or 300 px. It downloads them from Amazon the first time into the OS temp folder (`nestead-perf-posters`); offline, the cards show placeholders and image bytes read 0. Keep `POSTER_ORIGIN` the same in `fixtures.ts` and `browser.mjs`.
- In Git Bash, an option starting with `/` (`--path /shows`) is rewritten into a Windows path. Prefix the command with `MSYS_NO_PATHCONV=1`.
- One run of everything takes about 30 minutes, most of it `db.perf.ts`.
