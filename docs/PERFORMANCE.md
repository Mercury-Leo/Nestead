# Performance
Where Nestead spends its time, measured on 2026-09-29 on branch `perf/pass`. The scripts and how to run them are in [scripts/perf/](../scripts/perf/README.md). Every number is the median of 5 runs after one warm-up, with the min–max spread in brackets.

## Method
- **Page load** (`pageload.mjs`): headless Chrome loads a production build served the way Cloudflare Pages serves it (HTTP/2, brotli, the `_headers` cache rules, 304s). The network is throttled to 150 ms per request, 1.6 Mbps down and 750 kbps up, and the CPU runs 4× slower, on a 412 px wide screen. Cold loads clear the HTTP cache first; warm loads keep it. "Usable" is the first frame painted after the first task card (demo) or the sign-in field (Supabase build) is in the page.
- **Using the app** (`interact.mjs`): the demo build with the heavy family, CPU 4× slower. Clicks and keys go through DevTools input events, so the Event Timing API reports them the way it feeds INP (input to next paint). The drag moves the first card past three others in 20 steps.
- **Database** (`db.perf.ts`): Node, signed in as test user A, against the production project. It seeds its own rows into test family A and deletes them after. Everything goes through the app's own code: `withCache(createSupabaseStore())`, the kitchen actions, the board's `placeTask()`, and `resolve()`'s startup steps. Every request is counted and attributed to the client that made it. "Done" is when the action's promise resolves. "Settled" is when the last request it set off (including re-reads after realtime echoes) has finished.
- **Bundle** (`bundle.mjs`): module sizes per chunk, plus each file compressed with brotli (quality 11).
- **Families**: typical is 40 tasks, 25 recipes, 30 pantry rows and 40 list items. Heavy is 300 tasks, 150 recipes (30 with photos), 120 pantry rows and 200 list items. Both have 3 columns, 2 list groups and 1 diet profile. The 12-ingredient recipe used for the list is extra.

What these numbers cannot show:
- **A signed-in page load in the browser.** The browser harness does not sign in to the hosted auth service. The Supabase build is measured up to its sign-in screen, which uses the same bundle. The signed-in startup's network part is measured in Node, through the same `resolve()` steps.
- **Connection setup to Supabase.** Chrome's throttling adds its latency per request, not per round trip. From here a new TLS connection to the project took 12 ms and a request round trip about 95 ms. A phone pays more for both.
- **Real wire sizes.** Supabase sends gzip. The tables give the JSON size after decompression. The fixture library repeats the nine demo recipes, so it compresses far better (32×) than a real one would (5–8× is usual for JSON text).
- **The demo and production entries differ.** The demo entry has no Supabase SDK: 376 KB against 604 KB raw.

## Baseline

### Page load (throttled like a phone)
| Build | Cache | Usable | FCP | LCP | CLS | Long tasks | Requests | Bytes | Fonts, done by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase, sign-in screen | cold | 1270 ms (1240–1280) | 1264 (1228–1272) | 1276 (1244–1284) | 0.010 | 0 | 9 | 224 KB | 41 KB, 1664 ms |
| Supabase, sign-in screen | warm | 272 ms (263–278) | 276 (264–284) | 280 (268–284) | 0 | 0 | 8 | 10 KB | cached |
| Demo, typical family | cold | 1213 ms (1198–1270) | 1100 (1068–1248) | 1100 (1068–1248) | **0.107** | 84 (72–171) | 10 | 232 KB | 98 KB, 1770 ms |
| Demo, typical family | warm | 430 ms (426–446) | 300 (296–316) | 412 (404–428) | 0 | 71 (69–84) | 9 | 10 KB | cached |
| Demo, heavy family | cold | **1763 ms** (1643–1856) | 1072 (1060–1584) | 1072 (1060–1584) | 0 | **608** (538–648) | 10 | 232 KB | 98 KB, 1899 ms |
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
7. **Fonts arrive after the first paint.** 98 KB finishes at about 1.8 s on a cold load, so the board repaints with its real fonts and shifts: CLS 0.107 on the typical board.
8. **One 604 KB entry chunk** (157 KB brotli). About 228 KB raw of it is the Supabase SDK. Any deploy re-downloads all of it.
9. **30 photos cost 30 signed-URL requests** (382 ms, 185–767).
10. **Ticking a list item** at heavy size takes 160 ms at its slowest. That's fine for now.

Ruled out:
- Typing in Search (48 ms per key) and opening a recipe (82 ms).
- Memory: node and listener counts are flat over 60 screens, and the heap grows about 0.2 MB per 20 screens.
- Query time, and with it the RLS helper. Reading a whole table (88–104 ms) takes as long as a bare round trip (92–97 ms), so time on the server is in the noise at family size. Only recipes stand out, because of their size.

## Found on the way
**Another device never sees a deletion.** `subscribe()` listens for `postgres_changes` filtered on `family_id`. With the default replica identity, a DELETE event carries only the primary key, so the filter never matches it and Realtime never delivers it. A task, list item or recipe deleted on one phone stays on the others until something else in that table changes. `db.perf.ts` shows it 3 times out of 3 at each size. The fix needs a decision (see below).
