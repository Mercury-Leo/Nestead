// How the app responds once it is open: dragging a task, ticking off list
// items, typing a search, opening busy screens, and whether memory is handed
// back after a long session. Demo build, CPU 4x slower, no network needed.
//
//   node scripts/perf/interact.mjs <demoDist> --data <demodata.json> [--size heavy] [--runs 5] [--out <result.json>]
//
// Input goes through Input.dispatch*Event, so the browser treats it as real
// and the Event Timing API reports it: an interaction's duration runs from
// the input to the next paint, the figure INP is built from.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { INTERACTION_INSTRUMENT, installDemoData, interactions, launchChrome, spread, startServer, throttle } from './browser.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const dist = args[0];
const DATA = option('data', undefined);
if (dist === undefined || DATA === undefined) throw new Error('usage: node scripts/perf/interact.mjs <demoDist> --data <demodata.json> [options]');
const SIZE = option('size', 'heavy');
const RUNS = Number(option('runs', '5'));
const OUT = option('out', undefined);

const server = await startServer(dist);
const browser = await launchChrome();
const { cdp } = browser;
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INTERACTION_INSTRUMENT });
const { sleep, now, go, box, mouse, slowestInteraction } = interactions(cdp);

const result = { dist: resolve(dist), size: SIZE, runs: RUNS };
try {
  await installDemoData(cdp, server.origin, DATA, SIZE);
  await throttle(cdp, { network: false, cpu: true });
  await cdp.navigate(`${server.origin}/`);
  await go('/', `document.querySelector('.card') !== null`);

  // Opening screens: the library (every recipe card, diet checks) and a recipe.
  const firstVisit = { library: await go('/library', `document.querySelectorAll('a[href^="/recipe/"]').length > 0`) };
  await go('/', `document.querySelector('.card') !== null`);
  const open = { library: [], recipe: [], lists: [] };
  for (let run = 0; run <= RUNS; run += 1) {
    const library = await go('/library', `document.querySelectorAll('a[href^="/recipe/"]').length > 0`);
    const href = await cdp.evaluate(`document.querySelector('a[href^="/recipe/"]').getAttribute('href')`);
    // The library's cards are gone and the recipe's heading is up (its only recipe link is to cook mode).
    const recipe = await go(href, `document.querySelectorAll('a[href^="/recipe/"]:not([href$="/cook"])').length === 0 && document.querySelector('h1') !== null`);
    const lists = await go('/lists', `document.querySelectorAll('label input[type="checkbox"]').length > 5`);
    await go('/', `document.querySelector('.card') !== null`);
    if (run > 0) {
      open.library.push(library);
      open.recipe.push(recipe);
      open.lists.push(lists);
    }
  }
  result.firstVisit = firstVisit;
  result.open = Object.fromEntries(Object.entries(open).map(([name, samples]) => [name, { ms: spread(samples.map((s) => s.ms)), longTasks: spread(samples.map((s) => s.longTasks)) }]));

  // Ticking items off the shopping list, one click each, back and forth.
  await go('/lists', `document.querySelectorAll('label input[type="checkbox"]').length > 5`);
  const ticks = [];
  for (let run = 0; run <= RUNS; run += 1) {
    const target = await box(`document.querySelectorAll('label input[type="checkbox"]')[2].closest('label')`);
    const since = await now();
    await mouse('mousePressed', target.x, target.y);
    await mouse('mouseReleased', target.x, target.y);
    const slowest = await slowestInteraction(since);
    if (run > 0) ticks.push(slowest);
  }
  result.tick = spread(ticks);

  // Typing a search, one keystroke at a time.
  await go('/search', `[...document.querySelectorAll('input')].some((i) => (i.type === 'text' || i.type === 'search') && i.offsetParent !== null)`);
  const keys = [];
  for (let run = 0; run <= RUNS; run += 1) {
    const field = await box(`[...document.querySelectorAll('input')].find((i) => (i.type === 'text' || i.type === 'search') && i.offsetParent !== null)`);
    await mouse('mousePressed', field.x, field.y);
    await mouse('mouseReleased', field.x, field.y);
    await sleep(300);
    const since = await now();
    for (const char of 'chicken') {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: char, text: char, unmodifiedText: char });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: char });
      await sleep(120);
    }
    const slowest = await slowestInteraction(since);
    if (run > 0) keys.push(slowest);
    await cdp.evaluate(`(() => { const i = [...document.querySelectorAll('input')].find((i) => (i.type === 'text' || i.type === 'search') && i.offsetParent !== null); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(300);
  }
  result.typing = spread(keys);

  // Dragging a task down its column, past three cards.
  await go('/', `document.querySelector('.card') !== null`);
  const drags = [];
  for (let run = 0; run <= RUNS; run += 1) {
    // Both positions read after one scroll, so neither is stale.
    const { from, to } = await cdp.evaluate(`(() => {
      const cards = document.querySelectorAll('.card');
      cards[0].scrollIntoView({ block: 'start' });
      const a = cards[0].querySelector('.card-toggle').getBoundingClientRect();
      const b = cards[3].getBoundingClientRect();
      return { from: { x: a.left + a.width / 2, y: a.top + a.height / 2 }, to: { y: b.top + b.height * 0.75 } };
    })()`);
    const since = await now();
    await cdp.evaluate('window.__recordFrames()');
    await mouse('mousePressed', from.x, from.y);
    const steps = 20;
    for (let step = 1; step <= steps; step += 1) {
      await mouse('mouseMoved', from.x, from.y + ((to.y - from.y) * step) / steps, { buttons: 1 });
      await sleep(16);
    }
    await mouse('mouseReleased', from.x, to.y);
    const frames = await cdp.evaluate('window.__stopFrames()');
    const gaps = frames.slice(1).map((time, index) => time - frames[index]).sort((a, b) => a - b);
    const drop = await slowestInteraction(since);
    const long = await cdp.evaluate(`window.__longTasks.filter((t) => t.start >= ${since}).reduce((s, t) => s + t.duration, 0)`);
    if (run > 0) drags.push({ p95Frame: gaps[Math.floor(gaps.length * 0.95)] ?? 0, worstFrame: gaps[gaps.length - 1] ?? 0, drop, longTasks: long });
    await sleep(500);
  }
  result.drag = Object.fromEntries(['p95Frame', 'worstFrame', 'drop', 'longTasks'].map((key) => [key, spread(drags.map((d) => d[key]))]));

  // Memory over a long session: three laps of twenty screens, garbage collected between.
  await throttle(cdp, { network: false, cpu: false });
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  await cdp.navigate(`${server.origin}/`);
  await go('/', `document.querySelector('.card') !== null`);
  const LAP = ['/lists', '/library', '/search', '/pantry', '/profile', '/family', '/', '/library', 'recipe', '/lists', '/search', '/pantry', '/', '/family', '/profile', '/library', '/lists', '/search', 'recipe', '/'];
  const metrics = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    await sleep(300);
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics: list } = await cdp.send('Performance.getMetrics');
    const get = (name) => list.find((metric) => metric.name === name)?.value ?? 0;
    return { heapMB: get('JSHeapUsedSize') / 1024 / 1024, nodes: get('Nodes'), listeners: get('JSEventListeners'), documents: get('Documents') };
  };
  const laps = [await metrics()];
  for (let lap = 0; lap < 3; lap += 1) {
    for (const stop of LAP) {
      if (stop === 'recipe') {
        const href = await cdp.evaluate(`(document.querySelector('a[href^="/recipe/"]') ?? { getAttribute: () => '/library' }).getAttribute('href')`);
        await go(href, 'true');
      } else {
        await go(stop, 'true');
      }
      await sleep(250);
    }
    laps.push(await metrics());
  }
  result.memory = laps;

  const f = (s, unit = 'ms') => `${s.median.toFixed(0)} ${unit} (${s.min.toFixed(0)}–${s.max.toFixed(0)})`;
  console.log(`first library visit (loads its chunk): ${firstVisit.library.ms.toFixed(0)} ms, long tasks ${firstVisit.library.longTasks.toFixed(0)} ms`);
  for (const [name, s] of Object.entries(result.open)) console.log(`open ${name.padEnd(8)} ${f(s.ms)}, long tasks ${f(s.longTasks)}`);
  console.log(`tick a list item: slowest interaction ${f(result.tick)}`);
  console.log(`type "chicken" in search: slowest keystroke ${f(result.typing)}`);
  console.log(`drag a task: p95 frame ${f(result.drag.p95Frame)}, worst frame ${f(result.drag.worstFrame)}, drop ${f(result.drag.drop)}, long tasks ${f(result.drag.longTasks)}`);
  console.log(`memory by lap: ${laps.map((m) => `${m.heapMB.toFixed(1)} MB / ${m.nodes} nodes / ${m.listeners} listeners`).join(' → ')}`);
} finally {
  if (OUT !== undefined) {
    mkdirSync(dirname(resolve(OUT)), { recursive: true });
    writeFileSync(OUT, JSON.stringify(result, null, 2));
  }
  await browser.close();
  server.close();
}
