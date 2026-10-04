// Where the main thread goes while a screen renders: a CPU profile of one
// warm load, CPU 4x slower, summed by function (self time). With --drag, the
// profile covers dragging the first task past three cards instead.
//
//   node scripts/perf/profile.mjs <demoDist> --data <demodata.json> [--size heavy] [--path /] [--ready .card] [--top 25] [--drag]
//
// Profile a build made with `build.minify: false` (or source maps) to read
// function names; a minified one still shows which file the time is in.

import { installDemoData, launchChrome, startServer, throttle } from './browser.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const dist = args[0];
const DATA = option('data', undefined);
const SIZE = option('size', 'heavy');
const PATH = option('path', '/');
const READY = option('ready', '.card');
const TOP = Number(option('top', '25'));
const DRAG = args.includes('--drag');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const server = await startServer(dist);
const browser = await launchChrome({ amazon: server.port });
const { cdp } = browser;
try {
  if (DATA !== undefined) await installDemoData(cdp, server.origin, DATA, SIZE);
  await cdp.navigate(`${server.origin}${PATH}`); // warm the HTTP cache and the lazy chunks
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await throttle(cdp, { network: false, cpu: true });
  const ready = async () => {
    for (let i = 0; i < 300 && !(await cdp.evaluate(`document.querySelector(${JSON.stringify(READY)}) !== null`)); i += 1) await sleep(50);
  };
  if (DRAG) {
    await ready();
    await sleep(1000);
    const { from, to } = await cdp.evaluate(`(() => {
      const cards = document.querySelectorAll('.card');
      cards[0].scrollIntoView({ block: 'start' });
      const a = cards[0].querySelector('.card-toggle').getBoundingClientRect();
      const b = cards[3].getBoundingClientRect();
      return { from: { x: a.left + a.width / 2, y: a.top + a.height / 2 }, to: { y: b.top + b.height * 0.75 } };
    })()`);
    const mouse = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
    await cdp.send('Profiler.start');
    await mouse('mousePressed', from.x, from.y);
    for (let step = 1; step <= 20; step += 1) {
      await mouse('mouseMoved', from.x, from.y + ((to.y - from.y) * step) / 20, { buttons: 1 });
      await sleep(16);
    }
    await mouse('mouseReleased', from.x, to.y);
    await sleep(800);
  } else {
    await cdp.navigate(`${server.origin}/__blank`);
    await cdp.send('Profiler.start');
    await cdp.navigate(`${server.origin}${PATH}`);
    await ready();
    await sleep(1500);
  }
  const { profile } = await cdp.send('Profiler.stop');

  // Self time per node: samples x the interval between them.
  const self = new Map();
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const deltas = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i += 1) {
    const node = byId.get(profile.samples[i]);
    const ms = (deltas[i + 1] ?? 0) / 1000;
    const frame = node.callFrame;
    const file = frame.url.split('/').pop() || '(native)';
    const key = `${frame.functionName || '(anonymous)'}  ${file}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + ms);
  }
  const total = [...self.values()].reduce((sum, ms) => sum + ms, 0);
  const busy = [...self.entries()].filter(([key]) => !/^\(idle\)|^\(program\)/.test(key));
  console.log(`profile: ${total.toFixed(0)} ms sampled, ${busy.reduce((s, [, ms]) => s + ms, 0).toFixed(0)} ms busy`);
  for (const [key, ms] of busy.sort((a, b) => b[1] - a[1]).slice(0, TOP)) console.log(`${ms.toFixed(1).padStart(8)} ms  ${key}`);
} finally {
  await browser.close();
  server.close();
}
