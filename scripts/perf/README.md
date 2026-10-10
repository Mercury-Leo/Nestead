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
| `shows.mjs` | The Shows page in the demo build: opening it, typing a name, cycling a status, a card's toggle, a status filter, Show more (when the list has more than a page), and the page's element count. |
| `warm.mjs` | Opening Shows by its link, the first time in a page load: a phone tap and a desktop hover, on a first visit and with the chunk cached; click to cards, and whether Loading showed. Run it on two builds to compare. |
| `profile.mjs` | A CPU profile of one screen's load (or, with `--drag`, of a task drag), summed by function. Use an unminified build (`--minify false`) to read names. |
| `demodata.ts` | Writes the demo backend's localStorage for a typical and a heavy family (run with `npx vite-node`). |
| `db.perf.ts` | Database timings against the live project as test user A, through the app's own store, cache, actions and startup steps. |
| `showsread.ts` | Read only: the time of the Shows page's first read against the live project, as test user A, through the app's store (run with `npx vite-node`). |
| `fixtures.ts` | The rows both the demo data and the database runs use: three ordinary columns (To do, House, Errands) and tasks spread across them, a third of the one-offs ticked (all in Errands, since a task's column is its index mod 3) with `doneAt` one to three days before the fixture runs, and no repeat ticked. So neither auto-clear nor revive changes the board during a measured run. Shows (`showRows()`) are in the demo data only. |
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
node scripts/perf/warm.mjs <scratch>/demo --data <scratch>/demodata.json --size heavy --out <scratch>/warm.json
npx vite-node scripts/perf/showsread.ts -- --env .env.test --runs 10
node scripts/perf/pageload.mjs <scratch>/demo shows --path /shows --ready "main article" --data <scratch>/demodata.json --size heavy
node scripts/perf/redeploy.mjs <scratch> production deploy
node scripts/perf/pageload.mjs <scratch>/deploy-b deploy --ready "form input[type=email]" --after <scratch>/deploy-a
PERF_OUT=<scratch>/db.json npx vitest run --config scripts/perf/vitest.config.ts
```

`db.perf.ts` takes `PERF_RUNS` (default 5), `PERF_SIZES` (`typical,heavy`), `PERF_ONLY` (e.g. `addRecipe,sync`) and `PERF_EXTRA_LATENCY_MS`.

## Rules & gotchas
- `showsread.ts` only reads: it signs in, reads test user A's membership and shows, and stops rather than create a family if A has none (`signInTester()` would create one). It takes the path of `.env.test` (`--env`), since a worktree has none of its own.
- `db.perf.ts` writes to the production Supabase project, where the `.env.test` users live. It stays in test family A, seeds at most a few hundred rows and 30 tiny photos, and deletes everything it made in `afterAll`, then sweeps anything created since it started. Never raise the sizes into a load test.
- `npm test` with `.env.test` present wipes both test families. If it runs while `db.perf.ts` is measuring, seeded rows vanish mid-run: re-run.
- `.env.local` sets `VITE_BACKEND=supabase` and Vite loads it in every mode, so `vite build --mode demo` alone builds the Supabase app. Set `VITE_BACKEND=local` in the environment, which wins over `.env` files.
- Another client's delete never reaches a store's cache over realtime (see PERFORMANCE.md), so `db.perf.ts` deletes through the app's own store wherever the cache must stay right.
- Supabase's `channel()` returns an existing channel with the same topic, so each startup run gets a fresh client.
- Ticked tasks' `doneAt` is set when `taskRows()` runs, so write `demodata.json` again if it is more than three days old: by then the oldest done one-offs near the board's week, and auto-clear deletes them on the first open, mid-measurement (`fixtures.ts`).
- Browser numbers depend on the host CPU (the 4x slowdown is relative). Compare runs from the same machine, with nothing else busy.
- The demo shows' posters are links in OMDb's current form on Amazon's own host (`https://m.media-amazon.com/images/M/perf-p<n>@._V1_QL75_UX380_CR0,0,380,562_.jpg`), so the app's resizing (`Poster.tsx`) applies as it does to real links. Each script passes the server's port to `launchChrome({ amazon: server.port })`, which points that host at the harness server (`--host-resolver-rules`; the certificate mismatch is ignored like the rest). The server answers the forms in `POSTER_FORMS` with one real poster, downloaded from Amazon the first time into the OS temp folder (`nestead-perf-posters`); offline, the cards show placeholders. A script that leaves out `amazon` sends those requests to the real Amazon, which knows no `perf-p` ids.
- Poster responses carry `Timing-Allow-Origin: *`: posters come from another origin, and without it the page sees no transfer size and `pageload.mjs` counts 0 bytes for them.
- In Git Bash, an option starting with `/` (`--path /shows`) is rewritten into a Windows path. Prefix the command with `MSYS_NO_PATHCONV=1`.
- One run of everything takes about 30 minutes, most of it `db.perf.ts`.
