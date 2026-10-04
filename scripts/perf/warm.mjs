// Opening Shows by its link, the first time in a page load: what warming the
// page as someone heads for the link (src/app/warm.ts) saves. Demo build, CPU
// 4x slower. Run it on a build with warming and one without, and compare.
//
//   node scripts/perf/warm.mjs <demoDist> --data <demodata.json> [--size heavy] [--runs 7] [--out <result.json>]
//
// Each run loads the board afresh, waits a second, then opens Shows the way
// a person does:
//   tap:   the phone's tab bar, the finger down 90 ms before it lifts (the click);
//   hover: the desktop sidebar, the pointer over the link 250 ms before a click.
// Each twice: "first" with a slow phone's network and no HTTP cache (the first
// visit after a deploy), "cached" with the page's code already in the HTTP
// cache and no network throttling. Timed from the click to the first frame
// painted with cards, and whether Loading showed in between.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { installDemoData, interactions, launchChrome, spread, startServer, throttle } from './browser.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const dist = args[0];
const DATA = option('data', undefined);
if (dist === undefined || DATA === undefined) throw new Error('usage: node scripts/perf/warm.mjs <demoDist> --data <demodata.json> [options]');
const SIZE = option('size', 'heavy');
const RUNS = Number(option('runs', '7'));
const OUT = option('out', undefined);

/** The press, the click and the first frame with cards, from the page's own clock. */
const INSTRUMENT = `(() => {
  const open = (window.__open = { down: null, click: null, painted: null, loading: false, seen: false });
  addEventListener('pointerdown', () => { if (open.down === null) open.down = performance.now(); }, true);
  addEventListener('click', () => { if (open.click === null) open.click = performance.now(); }, true);
  const check = () => {
    if (open.click === null || open.seen) return;
    if (document.querySelector('main p.centred') !== null) open.loading = true;
    if (document.querySelector('main article') === null) return;
    open.seen = true;
    requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => { open.painted = performance.now(); }; c.port2.postMessage(0); });
  };
  new MutationObserver(check).observe(document, { childList: true, subtree: true });
})();`;

const PHONE = { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true };
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false };
/** The visible link to Shows: the tab bar's on a phone, the sidebar's on a desktop. */
const LINK = `[...document.querySelectorAll('a[href="/shows"]')].find((a) => a.offsetParent !== null)`;
const BOARD = `document.querySelector('.card') !== null`;

const server = await startServer(dist);
const browser = await launchChrome({ amazon: server.port });
const { cdp } = browser;
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
const { sleep, box, mouse } = interactions(cdp);

async function until(expression, what) {
  const began = Date.now();
  while (!(await cdp.evaluate(expression))) {
    if (Date.now() - began > 60_000) throw new Error(`${what} never happened`);
    await sleep(25);
  }
}

/** One open of Shows from a freshly loaded board. */
async function openOnce(gesture) {
  await cdp.navigate(`${server.origin}/`);
  await until(BOARD, 'the board');
  await sleep(1_000);
  const target = await box(LINK);
  if (gesture === 'tap') {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: target.x, y: target.y }] });
    await sleep(90);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await mouse('mouseMoved', target.x, target.y, { button: 'none', clickCount: 0 });
    await sleep(250);
    await mouse('mousePressed', target.x, target.y);
    await mouse('mouseReleased', target.x, target.y);
  }
  try {
    await until('window.__open.painted !== null', 'Shows with cards');
  } catch (error) {
    const state = await cdp.evaluate(`JSON.stringify({ path: location.pathname, open: window.__open, main: document.querySelector('main')?.textContent.slice(0, 80) })`);
    throw new Error(`${gesture}: ${error.message}: ${state}`);
  }
  const open = await cdp.evaluate('window.__open');
  return { ms: open.painted - open.click, lead: open.click - open.down, loading: open.loading };
}

const result = { dist: resolve(dist), size: SIZE, runs: RUNS };
try {
  await installDemoData(cdp, server.origin, DATA, SIZE);
  for (const gesture of ['tap', 'hover']) {
    await cdp.send('Emulation.setDeviceMetricsOverride', gesture === 'tap' ? PHONE : DESKTOP);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: gesture === 'tap', maxTouchPoints: 5 });
    for (const cache of ['first', 'cached']) {
      await throttle(cdp, { network: cache === 'first', cpu: true });
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: cache === 'first' });
      const runs = [];
      // The first run fills the HTTP cache for "cached", and is left out of both.
      for (let run = 0; run <= RUNS; run += 1) {
        const once = await openOnce(gesture);
        if (run > 0) runs.push(once);
      }
      result[`${gesture}-${cache}`] = {
        ms: spread(runs.map((r) => r.ms)),
        lead: spread(runs.map((r) => r.lead)),
        loadingShown: runs.filter((r) => r.loading).length,
      };
    }
  }
  const f = (s) => `${s.median.toFixed(0)} ms (${s.min.toFixed(0)}–${s.max.toFixed(0)})`;
  for (const [name, r] of Object.entries(result)) {
    if (typeof r !== 'object') continue;
    console.log(`${name}: click to cards ${f(r.ms)}; press to click ${f(r.lead)}; Loading shown in ${r.loadingShown} of ${RUNS}`);
  }
} finally {
  if (OUT !== undefined) {
    mkdirSync(dirname(resolve(OUT)), { recursive: true });
    writeFileSync(OUT, JSON.stringify(result, null, 2));
  }
  await browser.close();
  server.close();
}
