# Performance
Where Nestead spends its time, measured on 2026-09-29 on branch `perf/pass`. The scripts and how to run them are in [scripts/perf/](../scripts/perf/README.md). Every number is the median of 5 runs after one warm-up, with the min–max spread in brackets. The Shows page has its own pass, measured on 2026-10-04: [Shows](#shows-2026-10-04-branch-activitiesshows) at the end.

## Method
- **Page load** (`pageload.mjs`): headless Chrome loads a production build served the way Cloudflare Pages serves it (HTTP/2, brotli, the `_headers` cache rules, 304s). The network is throttled to 150 ms per request, 1.6 Mbps down and 750 kbps up, and the CPU runs 4× slower, on a 412 px wide screen. Cold loads clear the HTTP cache first; warm loads keep it. "Usable" is the first frame painted after the first task card (demo) or the sign-in field (Supabase build) is in the page.
- **After a deploy** (`redeploy.mjs`, `pageload.mjs --after`): two builds, the second with a one-attribute change to the board page. A device that has the first one cached then opens the second.
- **Using the app** (`interact.mjs`): the demo build with the heavy family, CPU 4× slower. Clicks and keys go through DevTools input events, so the Event Timing API reports them the way it feeds INP (input to next paint). The drag moves the first card past three others in 20 steps.
- **Database** (`db.perf.ts`): Node, signed in as test user A, against the production project. It seeds its own rows into test family A and deletes them after. Everything goes through the app's own code: `withCache(createSupabaseStore())`, the kitchen actions, the board's `placeTask()`, and `resolve()`'s startup steps. Every request is counted and attributed to the client that made it. "Done" is when the action's promise resolves. "Settled" is when the last request it set off (including re-reads after realtime echoes) has finished.
- **Bundle** (`bundle.mjs`): module sizes per chunk, plus each file compressed with brotli (quality 11).
- **Families**: typical is 40 tasks, 25 recipes, 30 pantry rows and 40 list items. Heavy is 300 tasks, 150 recipes (30 with photos), 120 pantry rows and 200 list items. Both have 3 columns, 2 list groups and 1 diet profile. The 12-ingredient recipe used for the list is extra.

What these numbers cannot show:
- **A signed-in page load in the browser.** The browser harness does not sign in to the hosted auth service. The Supabase build is measured up to its sign-in screen, which uses the same bundle. The signed-in startup's network part is measured in Node. The baseline ran a copy of `resolve()`'s steps; since the startup change, the harness calls `openFamily()`, which `resolve()` itself calls.
- **Connection setup to Supabase.** Chrome's throttling adds its latency per request, not per round trip. From here a new TLS connection to the project took 12 ms and a request round trip about 95 ms. A phone pays more for both.
- **Real wire sizes.** Supabase sends gzip. The tables give the JSON size after decompression. The fixture library repeats the nine demo recipes, so it compresses far better (32×) than a real one would (5–8× is usual for JSON text).
- **The demo and production entries differ.** The demo entry has no Supabase SDK: 376 KB against 604 KB raw.

## Baseline

### Page load (throttled like a phone)
| Build | Cache | Usable | FCP | LCP | CLS | Long tasks | Requests | Bytes | Fonts, done by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase, sign-in screen | cold | 1270 ms (1240–1280) | 1264 (1228–1272) | 1276 (1244–1284) | 0.010 | 0 | 9 | 224 KB | 41 KB, 1664 ms |
| Supabase, sign-in screen | warm | 272 ms (263–278) | 276 (264–284) | 280 (268–284) | 0 | 0 | 8 | 10 KB | cached |
| Demo, typical family | cold | 1213 ms (1198–1270) | 1100 (1068–1248) | 1100 (1068–1248) | **0.107** in 3 of 5 runs, else 0 | 84 (72–171) | 10 | 232 KB | 98 KB, 1770 ms |
| Demo, typical family | warm | 430 ms (426–446) | 300 (296–316) | 412 (404–428) | 0 | 71 (69–84) | 9 | 10 KB | cached |
| Demo, heavy family | cold | **1763 ms** (1643–1856) | 1072 (1060–1584) | 1072 (1060–1584) | 0.107 in 1 of 5 runs, else 0 | **608** (538–648) | 10 | 232 KB | 98 KB, 1899 ms |
| Demo, heavy family | warm | 868 ms (833–892) | 300 (284–316) | 780 (748–812) | 0 | 553 (533–577) | 9 | 10 KB | cached |

### Using the app (demo, heavy family, CPU 4× slower)
| What | Result |
| --- | --- |
| Drag a task past three cards | **p95 frame 111 ms (83–116), about 9 fps; worst 115 ms; 1507 ms (1478–1870) of long tasks; drop 296 ms (272–424)** |
| Open the library | 779 ms (740–1111), 312 ms (174–774) long tasks; first visit, loading its chunk: 1298 ms |
| Open the shopping list | 276 ms (270–331), 130 ms (98–281) long tasks |
| Open a recipe | 82 ms (72–107) |
| Tick a list item (slowest interaction) | 160 ms (152–192) |
| Type "chicken" in Search (slowest keystroke) | 48 ms (32–56) |
| Memory after 0, 20, 40, 60 screens | 6.6, 7.8, 7.9, 8.1 MB heap; 7888, 7927, 7927, 7927 nodes; 588, 614, 614, 614 listeners |

### Database (Node, round trip about 95 ms)
| What | Typical | Heavy |
| --- | --- | --- |
| Startup: loading screen gone | 245 ms (192–267) | 247 ms (224–263) |
| Startup: board rows loaded | 245 ms (208–272) | 297 ms (247–355) |
| Startup: kitchen rows loaded | 294 ms (239–365) | 419 ms (376–458) |
| Startup: requests, JSON read | 11, 144 KB | 11, **811 KB** (recipes 556 KB) |
| Add a task: done / settled | 113 / 666 ms; 2 re-reads, 40 KB | 111 / 632 ms; 2 re-reads, **292 KB** |
| Move a task: done / settled | 121 / 647 ms; 2 re-reads, 40 KB | 105 / 606 ms; 2 re-reads, 291 KB |
| Tick a list item: done / settled | 138 / 670 ms; 2 re-reads, 37 KB | 95 / 636 ms; 2 re-reads, 148 KB |
| Add a 12-ingredient recipe to the list | **1291 ms** (1196–1616); 25 requests, 306 KB | **1034 ms** (938–1125); 23 requests, 929 KB |
| Take it off the list | **1058 ms** (1002–1154); 22 requests, 226 KB | **1256 ms** (1070–1526); 22 requests, 840 KB |
| Move 15 bought items to the pantry | **3032 ms** (2885–3620); 67 requests, 448 KB | **2864 ms** (2703–4384); 67 requests, **1841 KB** |
| Signed URLs for 30 recipe photos | – | 382 ms (185–767), 30 requests |
| Another device sees an edit | 667 ms (588–699); it re-reads 20 KB, the writer 40 KB | 620 ms (594–667); it re-reads 146 KB, the writer 291 KB |
| Another device sees a deletion | **never** (3 of 3, 10 s each) | **never** (3 of 3) |
| One row: create / update / remove | 94 / 98 / 106 ms | 96 / 100 / 92 ms |
| Read a whole table | 88–104 ms; recipes 157–163 ms | 88–114 ms; tasks 160 ms, recipes 254–281 ms |

### Bundle (production, Supabase)
| | Raw | Brotli |
| --- | --- | --- |
| First load: `index.html`, entry JS, CSS | 655 KB | 172 KB |
| Entry JS | 604 KB | 157 KB |
| All JS | 785 KB | 215 KB |
| Font files shipped | 34 files, 752 KB | English first paint fetches 3–4 of them |

The entry chunk before minification: `@supabase/auth-js` 397 KB, `react-dom` 131 KB, `@supabase/storage-js` 111 KB, `@supabase/postgrest-js` 108 KB, `@supabase/realtime-js` 97 KB, `i18next` 81 KB, `src/domain/kitchen` 58 KB, `@supabase/phoenix` 55 KB. The demo entry, which has no Supabase SDK, is 376 KB raw and 108 KB brotli. Everything ships as one entry chunk, so any deploy makes every device download all of it again.

## Ranked by measured cost
1. **Dragging a task on a busy board.** It runs at about 9 fps, with 1.5 s of long tasks per drag, and the drop takes 296 ms. Every pointer move re-renders all 300 cards. A third of the time (568 ms per drag in the profile) is `formatDate()` building a new `Intl.DateTimeFormat` for each dated card, and another ~200 ms is i18next lookups inside the cards.
2. **Writes that touch many rows go one at a time.** Moving 15 items to the pantry takes about 3 s (30 serial writes), adding a recipe to the list 1.0–1.3 s, and taking it off 1.1–1.3 s. Each of those writes also sets off whole-table re-reads (next item).
3. **Every write re-reads the whole table**: twice on the device that wrote (its own notify, then the realtime echo) and once on every other open device. At heavy size, a task edit costs 292 KB of JSON on the writer and 146 KB on each other device. Another device sees the change after 620–667 ms.
4. **Startup reads every table in full.** At heavy size that is 811 KB of JSON (556 KB of it recipes, which the board does not use) before the kitchen is usable. Membership and the reads run one after the other, so the loading screen waits for two round trips. The setup checks re-read two tables that the preload is already reading. That costs requests, not time.
5. **A busy board renders slowly.** Cold usable time goes from 1.21 s (typical) to 1.76 s (heavy), with 608 ms of long tasks. `formatDate()` is again the top function.
6. **Opening the library** takes 779 ms, of which 312 ms is long tasks. The profile shows `normalizeText()`, a new `Intl` formatter per number and list (`formatNumber()`, `formatList()`), react-i18next's per-component setup, and icon building.
7. **The board shifts on some cold loads** (CLS 0.107 in about half). I suspected fonts, which finish at about 1.8 s, after the first paint. The layout-shift sources say otherwise. The "New column" box paints alone before the columns arrive, then moves when they land, for a score of 0.1065. The font swap adds only 0.0003.
8. **One 604 KB entry chunk** (157 KB brotli). About 228 KB raw of it is the Supabase SDK. Any deploy re-downloads all of it.
9. **30 photos cost 30 signed-URL requests** (382 ms, 185–767).
10. **Ticking a list item** at heavy size takes 160 ms at its slowest. That's fine for now.

Ruled out:
- Typing in Search (48 ms per key) and opening a recipe (82 ms).
- Memory: node and listener counts are flat over 60 screens, and the heap grows about 0.2 MB per 20 screens.
- Query time, and with it the RLS helper. Reading a whole table (88–104 ms) takes as long as a bare round trip (92–97 ms), so time on the server is in the noise at family size. Only recipes stand out, because of their size.

## Found on the way
**Another device never sees a deletion.** `subscribe()` listens for `postgres_changes` filtered on `family_id`. With the default replica identity, a DELETE event carries only the primary key, so the filter never matches it and Realtime never delivers it. A task, list item or recipe deleted on one phone stays on the others until something else in that table changes. `db.perf.ts` shows it 3 times out of 3 at each size. The fix needs a decision (see below).

## After this pass
Measured on the final commits with the same scripts, data and throttling. Before is the baseline above. **Bold** marks a change clear of both spreads.

### Database (typical / heavy family)
| What | Before | After |
| --- | --- | --- |
| Startup, device that has opened the app before: loading screen gone | 245 (192–267) / 247 (224–263) ms | **125 (101–179) / 132 (121–202) ms** |
| Same: board rows loaded | 245 (208–272) / 297 (247–355) ms | **127 (101–179) / 176 (139–227) ms** |
| Same: kitchen rows loaded | 294 (239–365) / 419 (376–458) ms | 192 (158–492) / **307 (300–345) ms** |
| Startup on a new device: loading screen gone | 245 / 247 ms | 216 (201–225) / 213 (180–236) ms, unchanged |
| Add a task: requests settled | 666 / 632 ms | **215 / 275 ms** |
| Add a task: re-reads, JSON | 2, 40 / 292 KB | **1, 20 / 146 KB** |
| Move a task: requests settled, JSON | 647 / 606 ms, 40 / 291 KB | **223 / 251 ms, 20 / 145 KB** |
| Tick a list item: requests settled, JSON | 670 / 636 ms, 37 / 148 KB | **215 / 197 ms, 18 / 74 KB** |
| Add a 12-ingredient recipe to the list | 1291 (1196–1616) / 1034 (938–1125) ms | 1109 (1038–1314) / 1156 (1045–1290) ms, unchanged (creates, proposal 3) |
| Take it off the list | 1058 (1002–1154) / 1256 (1070–1526) ms; 22 requests | **141 (132–210) / 239 (143–273) ms; 13 / 14 requests** |
| Move 15 bought items to the pantry | 3032 (2885–3620) / 2864 (2703–4384) ms | **1529 (1418–1650) / 1812 (1627–2224) ms** |
| Signed URLs for 30 recipe photos | – / 382 (185–767) ms, 30 requests | – / **146 (132–182) ms, 1 request** |
| Another device sees an edit | 667 / 620 ms | 653 / 637 ms, unchanged (proposal 2) |
| Another device sees a deletion | never | never (proposal 1) |

### Page load (throttled like a phone)
| Build | Cache | Usable before | Usable after | Long tasks | Downloaded, requests |
| --- | --- | --- | --- | --- | --- |
| Supabase, sign-in screen | cold | 1270 (1240–1280) ms | 1288 (1256–1303) ms, within the spread | 0 → 0 | 224 → 228 KB, 9 → 12 |
| Supabase, sign-in screen | warm | 272 (263–278) ms | 277 (260–306) ms | 0 → 0 | 10 → 11 KB |
| Supabase, sign-in screen | first open after an app-only deploy | 1202 (1188–1217) ms | **672 (658–678) ms** | 0 → 0 | **168 → 57 KB** |
| Demo, typical family | cold | 1213 (1198–1270) ms | 1209 (1176–1270) ms | 84 → 136 (70–196) ms | 232 → 234 KB |
| Demo, typical family | warm | 430 (426–446) ms | 406 (399–430) ms | 71 → 67 ms | 10 KB |
| Demo, heavy family | cold | 1763 (1643–1856) ms | 1576 (1541–1768) ms | 608 → 500 (464–675) ms | 232 → 234 KB |
| Demo, heavy family | warm | 868 (833–892) ms | 808 (766–840) ms | **553 (533–577) → 499 (444–523) ms** | 10 KB |

CLS was 0 in all five final cold runs, against 0.107 in three of five typical and one of five heavy runs before. None of the fixes touched its cause, the "New column" box, so this is the race landing the other way, not a fix (proposal 5).

### Using the app (demo, heavy family, CPU 4× slower)
| What | Before | After |
| --- | --- | --- |
| Drag a task: p95 frame | 111 (83–116) ms, about 9 fps | **17 (14–24) ms, about 60 fps** |
| Drag a task: long tasks | 1507 (1478–1870) ms | **255 (248–288) ms** |
| Drag a task: drop | 296 (272–424) ms | **168 (168–200) ms** |
| Drag a task: worst frame (picking up) | 115 (98–124) ms | 105 (98–112) ms |
| Open the library | 779 (740–1111) ms, 312 ms long tasks | 748 (702–883) ms, 202 (181–880) ms long tasks |
| Open the shopping list | 276 (270–331) ms | 269 (256–339) ms |
| Open a recipe | 82 ms | 81 ms |
| Tick a list item | 160 (152–192) ms | 152 (136–208) ms |
| Type in Search | 48 ms | 48 ms |
| Memory after 0 and 60 screens | 6.6 → 8.1 MB; 7927 nodes, 614 listeners | 5.8 → 7.3 MB; 7931 nodes, 614 listeners |

### Bundle (production)
| | Before | After |
| --- | --- | --- |
| Entry chunk | 604 KB raw, 157 KB brotli | 161 KB raw, 47 KB brotli, plus `react` 161 KB, `supabase` 222 KB and `i18n` 61 KB raw (46, 48 and 19 KB brotli) |
| First load, brotli | 172 KB in 3 files | 175 KB in 6 files |
| Downloaded again after an app-only deploy (brotli) | 208 KB | **98 KB** |

## What changed
One commit per fix on `perf/pass`. Each was measured on its own, against the commit before it.

| Commit | Fix | Measured on its own |
| --- | --- | --- |
| `6b4a641` | Reuse `Intl` formatters (`src/i18n/format.ts`) | Drag: long tasks 1507 → 305 ms, p95 frame 111 → 75 ms, drop 296 → 208 ms. Warm heavy board: long tasks 553 → 498 ms |
| `0f86689` | A drag no longer re-renders every card: memoised `TaskCard`, a stable drag context (`src/features/board/`) | Drag: p95 frame 75 → 15 ms (60 fps), drop 208 → 168 ms. The same drag lands the card in the same place |
| `19001ac`, `7d6974a` | Kitchen writes: removes and updates go out together; creates stay in order (`src/features/larder/actions.ts`) | Take a recipe off the list: 1058 → 197 ms (typical), 1256 → 154 ms (heavy). Move 15 to the pantry: 3032 → 1609 ms, 2864 → 1565 ms |
| `c41d9c7` | The Supabase store drops realtime echoes of its own writes (`src/data/supabase/supabaseStore.ts`) | Writer re-reads per edit: 2 → 1. Add a task, requests settled: 666 → 215 ms (typical), 632 → 280 ms (heavy). JSON per heavy task edit: 292 → 146 KB |
| `f573a75`, `e7ef430` | Startup loads the remembered family while membership is read (`src/auth/openFamily.ts`) | Returning device, typical family: loading screen gone 245 → 111 ms, kitchen rows 294 → 166 ms. Heavy: kitchen rows 419 → 318 ms |
| `e64c751` | A screen's photo URLs are signed in one request (`src/data/supabase/supabaseStore.ts`) | 30 photos: 30 → 1 request, 382 → 134 ms |
| `4caed51` | React, i18next and Supabase get chunks of their own (`vite.config.ts`) | First open after an app-only deploy: usable 1202 → 672 ms, 168 → 57 KB downloaded. First ever open: 1275 → 1284 ms (within the spread) |

## Tried and not kept
- **Caching `normalizeText()`** (`src/domain/kitchen/normalize.ts`). Opening the library went from 814 ms (780–872) to 678 ms (657–886), and opening the list from 301 (253–386) to 278 (263–340). Both medians improved, but the ranges overlap, so it was reverted. It may be worth another look with more runs.
- **Preloading fonts.** The shift they were meant to fix turned out to be the "New column" box (proposal 5). A preload would also make 98 KB of fonts compete with 157 KB of JavaScript on a 1.6 Mbps link. Not attempted.
- **Fewer `useTranslation()` calls on busy screens.** react-i18next builds a wrapper per component the first time it renders: 26 ms of the heavy board's load and 64 ms of the library's. Passing `t` down from the column or grid would remove most of it, but the gain is small next to the spread. Not attempted.

## Waiting on your OK
Each of these is outside the envelope: it changes the `Collection` contract, the schema, a dependency, or something users can see.

1. **Deliver deletions to other devices.** This is a correctness bug, not speed. There are two ways to fix it:
   - **Quick:** subscribe to DELETE events without the `family_id` filter, and notify only for ids this store has listed. Expected gain: a deletion shows on other devices about as fast as an edit (620–670 ms). Risk: Realtime does not apply RLS to DELETE events, so every client would receive the ids, though not the contents, of rows deleted in other families. Files: `src/data/supabase/supabaseStore.ts`.
   - **Thorough:** database triggers that broadcast each change on a private channel per family (Realtime "broadcast from database", authorised by RLS on `realtime.messages`). It also delivers row payloads, which item 2 needs. Risk: a schema change, applied to the live project by you, plus channel authorisation. Files: a new migration, `supabase/schema.sql`, `src/data/supabase/supabaseStore.ts`.
2. **Apply the realtime row instead of re-reading the table.** Right now every change costs each other device a whole-table read (146 KB of JSON per task edit at heavy size), and the writer still does one. Expected gain: other devices show an edit about 100–250 ms sooner (the re-read), and those reads disappear. Risk: the `Collection` contract changes (a listener learns which row changed), and the cache needs a full re-read after a reconnect, since events can be missed. It depends on item 1 for deletions. Files: `src/data/types.ts`, `cache.ts`, `local/localStore.ts`, `supabase/supabaseStore.ts`, `collection.contract.ts`, `cache.test.ts`.
3. **Make many rows in one request.** Adding a 12-ingredient recipe to the list is still 11 creates in a row, 1.0–1.3 s. Moving 15 items to the pantry spends most of its 1.6 s on 15 creates. Expected gain: a `createMany()` (one INSERT) or creates in parallel should bring the recipe case to about one round trip, roughly 0.15 s. Risk: the list and the pantry sort by `createdAt`. Rows from one INSERT share it, and parallel creates get whatever order the server starts them in, so items added together could come out in a different order. `createMany()` also changes the contract. Files: `src/data/types.ts`, `cache.ts`, both backends, `collection.contract.ts`, `src/features/larder/actions.ts`.
4. **Stop the board waiting behind the recipes.** A heavy family's startup reads 811 KB of JSON, 556 KB of it recipes, which the board never shows. Starting the kitchen reads after the board has its rows would stop them competing on a slow link. That is an envelope change I could not prove: the Node harness has no bandwidth limit, and the browser harness is not signed in. Expected gain: on a 1.6 Mbps phone, the board's rows up to the recipes' transfer time sooner, about 0.5–0.8 s for a real 150-recipe library (compressed 5–8×). Risk: kitchen screens wait a little longer on first open. Files: `src/data/cache.ts`, `src/auth/openFamily.ts`. To measure it I would sign the headless browser in as test user A: say if I may. A larger version, recipe summaries in lists and the full recipe only on its own screen, would change the contract.
5. **Hold the "New column" box until the columns load.** Expected gain: CLS 0.107 → 0 in the half of cold loads that shift. It changes what the board shows while loading: nothing, rather than a lone "New column" box for a moment. Risk: low. Files: `src/features/board/Board.tsx`.

Not proposed: splitting the Supabase SDK into its packages (a dependency change for about 5–8 KB brotli, since `functions-js` and `iceberg-js` are the only unused parts), and the RLS helper, since server time is in the noise.

## Shows (2026-10-04, branch `activities/shows`)
The Shows page (`src/features/activities/shows/`), measured with the same scripts and throttling, before and after this pass. Before is `e027556`, the page as first built; after is `7a5114f`. Paged is `606d5bc`: the list in pages of 60 with Show more, approved after the pass (it was proposal 1 below).

**Method.** `shows.mjs` (new) times opening Shows from the board, typing "office" in its name search, cycling the first card's status all the way round, opening and closing a card, and tapping the Watched filter then All. `pageload.mjs --path /shows` loads the page directly, throttled like a phone. The demo data now has shows: 40 in the typical family, 300 in the heavy one (four in five with a poster). The harness server answers their poster links with a real OMDb poster at 100, 200 or 300 px, as Amazon's servers do. Adding a show and refreshing one call OMDb, which the harness cannot reach, so they are not timed. Their request count is fixed: two to add (search, details), one to refresh, none to open the page or reload it.

This machine was shared with other sessions during the pass, so some spreads are wide. A fix was kept only when its range cleared the one before it; 10 runs were used to decide close ones.

### Using the page (demo, CPU 4× slower)
| What | Heavy (300 shows): before | Heavy: after | Heavy: paged | Typical (40): before | Typical: after |
| --- | --- | --- | --- | --- | --- |
| Open Shows | 1210 (1135–1530) ms | **622 (590–657) ms** | **247 (222–292) ms** | 207 (197–223) ms | **152 (129–155) ms** |
| First visit, loading its chunk | 1608 ms | 969 ms | 475 ms | 478 ms | 410 ms |
| Elements on the page | 13,433 | **8,333** | **1,958** | 1,975 | **1,295** |
| Type a name: slowest keystroke | 328 (296–368) ms | **32 (32–48) ms** | 24 (24–40) ms | 64 (56–80) ms | **24 (16–24) ms** |
| Cycle a status: slowest click | **672** (640–720) ms | **40 (32–48) ms** | 40 (32–48) ms | 112 (104–200) ms | **24 (24–32) ms** |
| Open or close a card | 96 (96–112) ms | **24 (24–32) ms** | 24 (24–24) ms | 32 (32–40) ms | 24 (16–32) ms |
| Tap Watched, then All | **896** (864–912) ms | **512 (448–584) ms** | **164 (136–184) ms** | 152 (136–160) ms | **96 (80–104) ms** |
| Show more (the next 60) | – | – | 216 (192–248) ms | – | – |

A list of 60 or fewer shows whole, so paging leaves the typical family as it was: opening 172 (149–194) ms before it and 181 (141–258) ms after, back to back over 10 runs.

### Loading the page (heavy, 300 shows, throttled like a phone)
| Cache | Usable | LCP | Long tasks | Downloaded |
| --- | --- | --- | --- | --- |
| Cold, before | 2639 (2587–2763) ms | 4172 (4124–4288) ms | 1419 (1297–1446) ms | 557 KB, 9 posters 297 KB |
| Cold, after | **2215 (2167–2352) ms** | **3124 (3092–3264) ms** | **1053 (1027–1245) ms** | **422 KB, 9 posters 162 KB** |
| Warm, before | 1577 (1536–1645) ms | 1556 (1516–1620) ms | 1289 (1254–1351) ms | 10 KB |
| Warm, after | **1194 (1161–1269) ms** | **1188 (1148–1252) ms** | 1113 (1088–1218) ms | 10 KB |
| Cold, paged | **1730 (1703–1839) ms** | **1732 (1696–1836) ms** | **394 (321–461) ms** | 423 KB, 9 posters 162 KB |
| Warm, paged | **640 (631–680) ms** | **640 (620–680) ms** | **332 (302–351) ms** | 10 KB |

**Correction (posters).** The rows above used poster links in OMDb's old form, `._V1_SX300.jpg` (300 px). Testing with a real key showed OMDb now links `._V1_QL75_UX380_CR0,0,380,562_.jpg`, a 380 px crop of about 40 KB, which the first resizing rule (`7a5114f`) did not recognise: real posters were downloaded whole. `5100cbf` resizes any Amazon poster link. The harness now serves posters in OMDb's current form from Amazon's own host name (`launchChrome({ amazon })` maps it to the harness), so the app's rule runs as it does for real. Measured that way (paged, cold, 300 shows):

| Posters | Usable | LCP | Downloaded | Posters done by |
| --- | --- | --- | --- | --- |
| Whole (`356811d`, before `5100cbf`) | 1815 (1801–1904) ms | 1812 (1796–1904) ms | 622 KB, 9 posters 361 KB | 4154 (4150–4247) ms |
| Resized (`5100cbf`) | 1880 (1870–2006) ms | 1872 (1864–1960) ms | **400 KB, 9 posters 139 KB** | **3065 (3064–3096) ms** |

Usable and LCP do not move: with the list paged, the largest paint is text, before any poster. Posters finish 1.1 s sooner, and the fonts, which share the link, 3679 → 3064 ms. In the Browser pane with a real key, a 1× screen loaded `._V1_QL75_SX100.jpg` (about 5 KB) for each 84 px card.

### Bundle (demo build, brotli)
| | Before | After |
| --- | --- | --- |
| First load, against `main` | +0.9 KB (the English Shows strings and two nav icons) | unchanged |
| Shows chunk, fetched on first visit | 5.7 KB JS, 1.4 KB CSS | 5.9 KB JS, 1.4 KB CSS |

### What changed
One commit per fix, each measured against the commit before it (heavy family).

| Commit | Fix | Measured on its own |
| --- | --- | --- |
| `c79b0b3` | A card builds its details panel (plot, date, Refresh, Delete) only while open | Elements 13,433 → 8,333. Open 1210 → 965 ms, keystroke 328 → 232 ms, status 672 → 512 ms, filter 896 → 744 ms |
| `b1a4804` | Cards memoised on their fields (`sameShow()`), since a re-read hands back every row as a new object | Keystroke 232 → 88 ms, status 512 → 96 ms, filter 744 → 664 ms |
| `e6cbdc7` | `content-visibility: auto` on cards, each counted as its poster's height until laid out | 10 runs: open 1078 → 622 ms, filter 640 → 400 ms, keystroke 96 → 32 ms, status 72 → 36 ms. The page's height before and after scrolling the whole list: 50,728 px both |
| `7a5114f` | Posters at the width drawn: `srcset` with Amazon's 100 and 200 px versions of OMDb's link, then the link itself, then the placeholder. Only OMDb's old link form; `5100cbf` covers the current one (see the correction above) | Cold load: posters 297 → 162 KB, LCP 3648 → 3124 ms. A search result's 44 px thumbnail takes the 100 px file, about 6 KB against 37 KB (file sizes, not timed in the browser). Back to back over 10 runs, the filter tap read 432 (408–496) ms without it and 480 (432–704) with it: within the spread, but it may cost up to ~50 ms there |
| `0868a02` | The list builds 60 cards at a time (`shownCount()`), with Show more; a new search, filter or sort starts from one page; a show brought into view is built wherever it sorts | Open 622 → 247 ms, filter 512 → 164 ms, elements 8,333 → 1,958; cold load usable 2215 → 1730 ms. Typing got slower, 32 → 120 ms per key, since a keystroke now builds the cards that newly make the first page (next row) |
| `606d5bc` | The list follows the name search through `useDeferredValue`, so the field paints before the cards are built | 10 runs: slowest keystroke 120 (96–136) → 24 (24–40) ms; opening and filtering unchanged |

### Tried and not kept
- **One `t` per page instead of `useTranslation()` in each card.** The profile put 118 ms of a warm load in react-i18next's per-component wrapper, three per card. Passing the page's `t` down: open 1078 (968–1198) → 868 (756–1125) ms and filter 640 (616–688) → 588 (560–632) ms over 10 runs. Both medians improved in two batches, but the ranges overlap, so it was reverted. A quieter machine might settle it.

### What is left
- **Paging has a cost people can see:** the browser's find-in-page only finds cards already built, so a show past the first 60 needs the name search or Show more. A show just added, or one opened from Add show, is always built.
- **On Supabase, the first open waits for one read of the `shows` table.** `preloadStore()` leaves `shows` out, on purpose, so sign-in reads no more than before. Since 2026-10-05 the read starts when someone heads for the Activities link: see [Shows, warmed from its link](#shows-warmed-from-its-link-2026-10-05-branch-showsprovider-and-preload).

### Waiting on your OK
Done since: rendering a long list in pages (`0868a02`, `606d5bc`; measured above as "paged"), and item 1, warming from the link ([below](#shows-warmed-from-its-link-2026-10-05-branch-showsprovider-and-preload)).

1. **(Done.) Read `shows` before the page opens.** Start the read when the Activities tab is pressed or hovered (`cacheOf(store.shows).preload()`), not at sign-in. Expected gain: the first open on Supabase up to one round trip sooner, about 100–250 ms on a phone. Risk: low; a press that never reaches the page costs one read. To measure it I would sign the headless browser in as test user A, or run `db.perf.ts`, which writes to production: say if I may. Files: `src/app/Nav.tsx`, `src/features/activities/shows/`.

## Shows, warmed from its link (2026-10-05, branch `shows/provider-and-preload`)
A pointer over the Activities link, a press on it, or focus now starts the Shows page's chunk and its first read of `shows` (`src/app/warm.ts`, called from every nav link in `Nav.tsx`). Before is `4f2c563`; after is the commit that adds `warm.ts`.

**Method.** `warm.mjs` (new) loads the board afresh, waits a second, and opens Shows the way a person does: a tap on the phone's tab bar (finger down 90 ms before it lifts; the press comes about 110 ms before the click), or a desktop pointer resting on the sidebar link 250 ms before a click. It times the click to the first frame with cards, and notes whether Loading showed in between. "First visit" has a slow phone's network (150 ms, 1.6 Mbps) and no HTTP cache, as after a deploy; "cached" has the chunk in the HTTP cache and no network throttling. Demo build, heavy family (300 shows), CPU 4× slower, 7 runs after one discarded. The demo backend reads from localStorage, so these numbers show the chunk's part only; the read's part is timed against the live project below.

| Opening Shows by its link | Before | After | Loading shown, before → after |
| --- | --- | --- | --- |
| Tap, first visit | 558 (522–684) ms | **449 (432–581) ms** | 7 → 7 of 7 |
| Tap, cached | 306 (291–319) ms | 314 (292–327) ms | 7 → 7 of 7 |
| Hover, first visit | 546 (528–580) ms | **373 (303–419) ms** | 7 → 6 of 7 |
| Hover, cached | 345 (331–365) ms | **295 (277–318) ms** | 7 → **0** of 7 |

A hover hides the chunk's download, and when the chunk is cached, the Loading frame too. A tap's 110 ms covers part of the download; it is not enough for the chunk to finish evaluating at 4× CPU, so Loading still shows for a frame and the cached case is unchanged. Most of the remaining 300 ms is building the first 60 cards, which warming cannot start.

**The read, against the live project.** `showsread.ts` (new) signs in as test user A from Node and times the app's own `store.shows.list()`; it writes nothing. Family A holds no shows, so this is the round trip without a payload:

| Read of `shows` | Time |
| --- | --- |
| First after sign-in | 82–84 ms |
| 10 more, 300 ms apart | 86 (77–90) ms |
| 6 more, 5 s apart | 105 (85–154) ms |

A family with 300 shows adds their transfer: the demo's 300 are 198 KB of JSON, about 18 KB gzipped, so about 90 ms more on a 1.6 Mbps phone. On Supabase the whole read, about 85–245 ms, used to start only once the page had mounted; it now starts at the press or the hover, so a tap hides about 110 ms of it and a hover usually all of it. Not measured in a signed-in browser.

**Bundle.** First load +216 bytes brotli (`warm.ts` and the link handlers). The Shows chunk is unchanged, 7.5 KB gzip.

### What changed
| Change | Measured on its own |
| --- | --- |
| `warmPage()` on `pointerenter`, `pointerdown` and `focus` of every nav link; for `/shows` it starts the chunk (`loadShows()`) and the read (`preloadCollection(store.shows)`) | Hover, first visit 546 → 381 ms; tap, first visit 558 → 436 ms. Cached: unchanged (tap 306 → 321 ms, hover 345 → 344 ms), Loading still in 7 of 7 |
| `ShowsRoute` renders the page directly when its chunk has already arrived. `lazy()` suspends on its first render even then, which committed Loading for a frame | Hover, cached 344 → 295 ms, Loading 7 → 0 of 7; the other rows within their spread |

### Risks and limits
- A pointer crossing the sidebar on its way elsewhere costs one read of `shows` and the 7.5 KB chunk, once; the collection is then held open for the cache's 30 s linger. Nothing warms without a pointer, a press or focus on a link.
- The production gain is inferred from the read time above, not timed: timing a real open needs the headless browser signed in as test user A.
