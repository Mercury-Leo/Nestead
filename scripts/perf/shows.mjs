// How the Shows page responds: opening it, typing a name search, cycling a
// show's status, opening a card, tapping a status filter, and Show more under
// a long list. Demo build, CPU
// 4x slower, no network throttling (the list never calls OMDb; posters come
// from the harness server, see browser.mjs).
//
//   node scripts/perf/shows.mjs <demoDist> --data <demodata.json> [--size heavy] [--runs 5] [--out <result.json>]
//
// Timings work as in interact.mjs: input goes through Input.dispatch*Event and
// each interaction runs from the input to the next paint (what INP counts).

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
if (dist === undefined || DATA === undefined) throw new Error('usage: node scripts/perf/shows.mjs <demoDist> --data <demodata.json> [options]');
const SIZE = option('size', 'heavy');
const RUNS = Number(option('runs', '5'));
const OUT = option('out', undefined);

const server = await startServer(dist);
const browser = await launchChrome();
const { cdp } = browser;
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INTERACTION_INSTRUMENT });
const { sleep, now, go, box, mouse, slowestInteraction } = interactions(cdp);

const CARDS = `document.querySelectorAll('main article').length > 0`;
const BOARD = `document.querySelector('.card') !== null`;

async function click(expression) {
  const target = await box(expression);
  await mouse('mousePressed', target.x, target.y);
  await mouse('mouseReleased', target.x, target.y);
}

/** The slowest interaction among a few clicks, each left to paint before the next. */
async function clicks(expressions) {
  const since = await now();
  for (const expression of expressions) {
    await click(expression);
    await sleep(300);
  }
  return slowestInteraction(since);
}

const chip = (label) => `[...document.querySelectorAll('main [role=search] button')].find((b) => b.textContent.startsWith(${JSON.stringify(label)}))`;
const firstCard = `document.querySelector('main article')`;

const result = { dist: resolve(dist), size: SIZE, runs: RUNS };
try {
  await installDemoData(cdp, server.origin, DATA, SIZE);
  await throttle(cdp, { network: false, cpu: true });
  await cdp.navigate(`${server.origin}/`);
  await go('/', BOARD);

  // Opening the page: the first time loads its chunk.
  result.firstVisit = await go('/shows', CARDS);
  await go('/', BOARD);
  const opens = [];
  for (let run = 0; run <= RUNS; run += 1) {
    const open = await go('/shows', CARDS);
    await go('/', BOARD);
    if (run > 0) opens.push(open);
  }
  result.open = { ms: spread(opens.map((s) => s.ms)), longTasks: spread(opens.map((s) => s.longTasks)) };

  await go('/shows', CARDS);
  result.page = await cdp.evaluate(`({ cards: document.querySelectorAll('main article').length, nodes: document.getElementsByTagName('*').length, mainNodes: document.querySelector('main').getElementsByTagName('*').length })`);

  // Typing a name, one keystroke at a time; then the field is cleared.
  const field = `document.querySelector('main input[type=search]')`;
  const keys = [];
  for (let run = 0; run <= RUNS; run += 1) {
    await click(field);
    await sleep(300);
    const since = await now();
    for (const char of 'office') {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: char, text: char, unmodifiedText: char });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: char });
      await sleep(120);
    }
    const slowest = await slowestInteraction(since);
    if (run > 0) keys.push(slowest);
    await cdp.evaluate(`(() => { const i = ${field}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(400);
  }
  result.typing = spread(keys);

  // Cycling the first card's status all the way round: To watch, Watching, Watched, To watch.
  const statusButton = `${firstCard}.querySelector('button[aria-label*="Change to"]')`;
  const cycles = [];
  for (let run = 0; run <= RUNS; run += 1) {
    const slowest = await clicks([statusButton, statusButton, statusButton]);
    if (run > 0) cycles.push(slowest);
  }
  result.status = spread(cycles);

  // Opening a card's details and closing them.
  const toggle = `${firstCard}.querySelector('button[aria-expanded]')`;
  const toggles = [];
  for (let run = 0; run <= RUNS; run += 1) {
    const slowest = await clicks([toggle, toggle]);
    if (run > 0) toggles.push(slowest);
  }
  result.toggle = spread(toggles);

  // A status filter and back to everything.
  const filters = [];
  for (let run = 0; run <= RUNS; run += 1) {
    const slowest = await clicks([chip('Watched'), chip('All')]);
    if (run > 0) filters.push(slowest);
  }
  result.filter = spread(filters);

  // Show more under a long list (it builds the next page); a filter and back resets it.
  const more = `document.querySelector('main [aria-live="polite"]')?.parentElement.querySelector('button')`;
  if (await cdp.evaluate(`${more} != null`)) {
    const mores = [];
    for (let run = 0; run <= RUNS; run += 1) {
      const slowest = await clicks([more]);
      if (run > 0) mores.push(slowest);
      await click(chip('Watched'));
      await sleep(300);
      await click(chip('All'));
      await sleep(300);
    }
    result.showMore = spread(mores);
  }

  const f = (s) => `${s.median.toFixed(0)} ms (${s.min.toFixed(0)}–${s.max.toFixed(0)})`;
  console.log(`first visit (loads its chunk): ${result.firstVisit.ms.toFixed(0)} ms, long tasks ${result.firstVisit.longTasks.toFixed(0)} ms`);
  console.log(`open shows: ${f(result.open.ms)}, long tasks ${f(result.open.longTasks)}`);
  console.log(`page: ${result.page.cards} cards, ${result.page.nodes} elements (${result.page.mainNodes} in main)`);
  console.log(`type "office": slowest keystroke ${f(result.typing)}`);
  console.log(`cycle a status: slowest click ${f(result.status)}`);
  console.log(`open and close a card: slowest click ${f(result.toggle)}`);
  console.log(`filter Watched, then All: slowest tap ${f(result.filter)}`);
  if (result.showMore !== undefined) console.log(`show more: ${f(result.showMore)}`);
} finally {
  if (OUT !== undefined) {
    mkdirSync(dirname(resolve(OUT)), { recursive: true });
    writeFileSync(OUT, JSON.stringify(result, null, 2));
  }
  await browser.close();
  server.close();
}
