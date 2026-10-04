// Page load in headless Chrome, as a phone on a middling connection sees it.
//
//   node scripts/perf/pageload.mjs <distDir> <label> [--runs 5] [--ready <css>]
//        [--path /shows] [--data <demodata.json> --size typical|heavy]
//        [--after <previousDist>] [--out <result.json>]
//
// The build is served like production (see browser.mjs) and loaded with the
// network at 150 ms round trips and 1.6 Mbps and the CPU 4x slower: cold
// loads (HTTP cache cleared before each) and warm ones (cache kept).
// With --after, the warm loads are instead the first open after a deploy:
// each run clears the cache, opens <previousDist>, then opens <distDir>.
// "Usable" is the first frame painted after --ready matches (default: a task
// card on the board).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { installDemoData, launchChrome, spread, startServer, throttle } from './browser.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const [dist, label] = args;
if (dist === undefined || label === undefined) throw new Error('usage: node scripts/perf/pageload.mjs <distDir> <label> [options]');
const RUNS = Number(option('runs', '5'));
const READY = option('ready', '.card');
const DATA = option('data', undefined);
const SIZE = option('size', 'typical');
const OUT = option('out', undefined);
const AFTER = option('after', undefined);
/** The page opened, as a link from outside the app would: "/" is the board. */
const PATH = option('path', '/');

// Before any of the page's own scripts: paint, LCP, layout shift, long tasks,
// and the frame after the "usable" selector first matches (a message posted
// from requestAnimationFrame runs once that frame has been painted).
const INSTRUMENT = `(() => {
  const perf = (window.__perf = { fcp: null, lcp: null, ready: null, inDom: null, cls: 0, longTaskTotal: 0, longTaskAfterFcp: 0 });
  new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') perf.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((list) => { for (const e of list.getEntries()) perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => { for (const e of list.getEntries()) { perf.longTaskTotal += e.duration; if (perf.fcp !== null && e.startTime > perf.fcp) perf.longTaskAfterFcp += Math.max(0, e.duration - 50); } }).observe({ type: 'longtask', buffered: true });
  const check = () => {
    if (perf.inDom !== null || !document.querySelector(${JSON.stringify(READY)})) return;
    perf.inDom = performance.now();
    requestAnimationFrame(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { perf.ready = performance.now(); };
      channel.port2.postMessage(0);
    });
  };
  new MutationObserver(check).observe(document, { childList: true, subtree: true });
})();`;

const server = await startServer(dist);
const browser = await launchChrome({ amazon: server.port });
const { cdp } = browser;
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });

async function measureLoad(cold, afterDeploy = false) {
  await throttle(cdp, { network: false, cpu: false });
  await cdp.navigate(`${server.origin}/__blank`);
  if (cold || afterDeploy) await cdp.send('Network.clearBrowserCache');
  if (afterDeploy) {
    // The device has the previous build cached, then the new one goes live.
    server.use(AFTER);
    await cdp.navigate(`${server.origin}${PATH}`);
    for (let i = 0; i < 300 && (await cdp.evaluate('window.__perf.ready')) === null; i += 1) await new Promise((done) => setTimeout(done, 50));
    await new Promise((done) => setTimeout(done, 1000));
    await cdp.navigate(`${server.origin}/__blank`);
    server.use(dist);
  }
  await throttle(cdp, { network: true, cpu: true });
  await cdp.navigate(`${server.origin}${PATH}`);
  // Usable, then 1.5 s with no new resources, so late fonts and chunks count.
  const began = Date.now();
  let seen = -1;
  let quietSince = Date.now();
  for (;;) {
    const { ready, count } = await cdp.evaluate('({ ready: window.__perf.ready, count: performance.getEntriesByType("resource").length })');
    if (count !== seen) {
      seen = count;
      quietSince = Date.now();
    }
    if (ready !== null && Date.now() - quietSince > 1500) break;
    if (Date.now() - began > 60_000) throw new Error(`"${READY}" never appeared`);
    await new Promise((done) => setTimeout(done, 100));
  }
  const sample = await cdp.evaluate(`(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const kind = (e) => /\\.js(\\?|$)/.test(e.name) ? 'js' : /\\.css(\\?|$)/.test(e.name) ? 'css' : /\\.(woff2?|ttf)(\\?|$)/.test(e.name) ? 'font' : /\\.(jpe?g|png|webp|avif)(\\?|$)/.test(e.name) ? 'img' : e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest' ? 'api' : 'other';
    const out = { ...window.__perf, html: nav.transferSize, domContentLoaded: nav.domContentLoadedEventEnd, loadEvent: nav.loadEventEnd,
      requests: resources.length + 1, fromCache: 0, revalidated: 0, bytes: nav.transferSize, js: 0, css: 0, font: 0, img: 0, images: 0, api: 0, other: 0, fonts: [], fontsDoneBy: 0, imagesDoneBy: 0 };
    for (const e of resources) {
      const k = kind(e);
      out[k] += e.transferSize;
      out.bytes += e.transferSize;
      if (e.transferSize === 0 && e.decodedBodySize > 0) out.fromCache += 1;
      else if (e.transferSize > 0 && e.encodedBodySize === 0) out.revalidated += 1;
      if (k === 'font') { out.fonts.push(e.name.split('/').pop()); out.fontsDoneBy = Math.max(out.fontsDoneBy, e.responseEnd); }
      if (k === 'img') { out.images += 1; out.imagesDoneBy = Math.max(out.imagesDoneBy, e.responseEnd); }
    }
    return out;
  })()`);
  await throttle(cdp, { network: false, cpu: false });
  return sample;
}

const NUMERIC = ['ready', 'inDom', 'fcp', 'lcp', 'cls', 'domContentLoaded', 'loadEvent', 'longTaskTotal', 'longTaskAfterFcp', 'requests', 'fromCache', 'revalidated', 'bytes', 'html', 'js', 'css', 'font', 'img', 'images', 'api', 'fontsDoneBy', 'imagesDoneBy'];
const summarise = (samples) => ({
  ...Object.fromEntries(NUMERIC.map((key) => [key, spread(samples.map((sample) => sample[key] ?? 0))])),
  fonts: samples[samples.length - 1]?.fonts ?? [],
});

const result = { label, dist: resolve(dist), ready: READY, data: DATA === undefined ? null : SIZE, runs: RUNS };
try {
  if (DATA !== undefined) await installDemoData(cdp, server.origin, DATA, SIZE);
  const cold = [];
  for (let run = 0; run <= RUNS; run += 1) {
    const sample = await measureLoad(true);
    if (run > 0) cold.push(sample);
  }
  if (AFTER === undefined) await measureLoad(false); // prime the cache
  const warm = [];
  for (let run = 0; run <= RUNS; run += 1) {
    const sample = await measureLoad(false, AFTER !== undefined);
    if (run > 0) warm.push(sample);
  }
  result.cold = summarise(cold);
  result.warm = summarise(warm);
  result.samples = { cold, warm };

  const f = (s, unit = 'ms', scale = 1) => `${(s.median / scale).toFixed(0)} ${unit} (${(s.min / scale).toFixed(0)}–${(s.max / scale).toFixed(0)})`;
  for (const kind of ['cold', 'warm']) {
    const s = result[kind];
    const name = kind === 'warm' && AFTER !== undefined ? 'after a deploy' : kind;
    console.log(`${label} ${name}: usable ${f(s.ready)}, FCP ${f(s.fcp)}, LCP ${f(s.lcp)}, CLS ${s.cls.median.toFixed(3)}, long tasks ${f(s.longTaskTotal)}, ` +
      `${s.requests.median} requests (${s.fromCache.median} cached, ${s.revalidated.median} 304), ${f(s.bytes, 'KB', 1024)} ` +
      `[js ${f(s.js, 'KB', 1024)}, css ${f(s.css, 'KB', 1024)}, fonts ${f(s.font, 'KB', 1024)} done by ${f(s.fontsDoneBy)}` +
      (s.images.median > 0 ? `, ${s.images.median} images ${f(s.img, 'KB', 1024)} done by ${f(s.imagesDoneBy)}]` : ']'));
  }
  console.log(`${label} fonts fetched: ${result.cold.fonts.join(', ')}`);
} finally {
  if (OUT !== undefined) {
    mkdirSync(dirname(resolve(OUT)), { recursive: true });
    writeFileSync(OUT, JSON.stringify(result, null, 2));
  }
  await browser.close();
  server.close();
}
