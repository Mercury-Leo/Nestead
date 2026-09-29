// Shared by pageload.mjs and interact.mjs: a local copy of the production
// host, headless Chrome, and just enough of the DevTools protocol to drive it.
//
// The server does what Cloudflare Pages does for this app: HTTP/2 over TLS,
// brotli, the Cache-Control rules in the build's _headers, index.html for
// unknown paths, ETags and 304s. Chrome comes from CHROME_PATH (default: the
// Windows install); openssl on the PATH makes a throwaway certificate.

import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createSecureServer } from 'node:http2';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ico': 'image/x-icon', '.txt': 'text/plain',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt']);

/** The build's _headers, as far as this app uses it: path patterns (optionally ending in *) and header lines. */
function headerRules(dist) {
  const file = join(dist, '_headers');
  if (!existsSync(file)) return [];
  const rules = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: {} });
    else if (rules.length > 0) {
      const at = line.indexOf(':');
      rules[rules.length - 1].headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
    }
  }
  return rules;
}

function certificate() {
  const dir = join(tmpdir(), 'nestead-perf-cert');
  mkdirSync(dir, { recursive: true });
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '30', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

export async function startServer(distDir) {
  const dist = resolve(distDir);
  const rules = headerRules(dist);
  const matches = (pattern, path) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern);
  const files = new Map();
  const load = (path) => {
    let entry = files.get(path);
    if (entry === undefined) {
      const body = readFileSync(path);
      const ext = extname(path);
      entry = {
        body,
        br: COMPRESSIBLE.has(ext) ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }) : null,
        etag: `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`,
        type: TYPES[ext] ?? 'application/octet-stream',
      };
      files.set(path, entry);
    }
    return entry;
  };

  const server = createSecureServer({ ...certificate(), allowHTTP1: true }, (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'https://localhost').pathname);
    if (path === '/__blank') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end('<!doctype html><title>blank</title>');
      return;
    }
    let file = join(dist, path);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    const entry = load(file);
    const servedPath = file === join(dist, 'index.html') ? '/' : path;
    const headers = { 'content-type': entry.type, 'cache-control': 'public, max-age=0, must-revalidate', etag: entry.etag, vary: 'accept-encoding' };
    for (const rule of rules) if (matches(rule.pattern, servedPath)) Object.assign(headers, rule.headers);
    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    const br = entry.br !== null && /\bbr\b/.test(req.headers['accept-encoding'] ?? '');
    if (br) headers['content-encoding'] = 'br';
    res.writeHead(200, headers);
    res.end(br ? entry.br : entry.body);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  // An IP, not "localhost": Chrome would try ::1 first, which nothing listens on.
  return { origin: `https://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

export class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.next = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const { ok, fail } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) fail(new Error(`${message.error.message} (${message.error.code})`));
        else ok(message.result);
      } else for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
  }
  open() {
    return new Promise((done, fail) => {
      this.ws.addEventListener('open', done, { once: true });
      this.ws.addEventListener('error', fail, { once: true });
    });
  }
  send(method, params = {}) {
    const id = (this.next += 1);
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => this.pending.set(id, { ok, fail }));
  }
  once(method) {
    return new Promise((done) => {
      const listener = (params) => {
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((l) => l !== listener));
        done(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
    });
  }
  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }
  async navigate(url) {
    const loaded = this.once('Page.loadEventFired');
    await this.send('Page.navigate', { url });
    await loaded;
  }
}

/** Headless Chrome with a fresh profile, 412 px wide like a phone, and a CDP session on its tab. */
export async function launchChrome() {
  const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const profile = mkdtempSync(join(tmpdir(), 'nestead-perf-chrome-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--ignore-certificate-errors',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-default-apps', '--mute-audio', 'about:blank',
  ], { stdio: 'ignore' });
  // However the script ends, Chrome goes with it.
  process.on('exit', () => chrome.kill());

  let port = '';
  for (let i = 0; i < 200 && port === ''; i += 1) {
    try {
      port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] ?? '';
    } catch {
      // Not written yet, or Chrome still has it open.
    }
    if (port === '') await new Promise((done) => setTimeout(done, 50));
  }
  if (port === '') throw new Error('Chrome did not open a DevTools port');

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const cdp = new Cdp(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });

  return {
    cdp,
    async close() {
      try {
        await cdp.send('Browser.close');
      } catch {
        // Already gone.
      }
      chrome.kill();
      await new Promise((done) => setTimeout(done, 500));
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // Chrome may still hold a file for a moment.
      }
    },
  };
}

/** 150 ms round trips, 1.6 Mbps down, 750 kbps up (the network), and a 4x slower CPU. */
export async function throttle(cdp, { network, cpu }) {
  await cdp.send('Network.emulateNetworkConditions', network
    ? { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }
    : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu ? 4 : 1 });
}

/** The demo backend's rows for one family size, from demodata.ts's output. */
export async function installDemoData(cdp, origin, file, size) {
  const data = JSON.parse(readFileSync(file, 'utf8'))[size];
  if (data === undefined) throw new Error(`no "${size}" data in ${file}`);
  await cdp.navigate(`${origin}/__blank`);
  await cdp.evaluate(`(() => { localStorage.clear(); sessionStorage.clear(); const data = ${JSON.stringify(data)}; for (const [key, rows] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(rows)); })()`);
}

export function spread(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, min: sorted[0], max: sorted[sorted.length - 1] };
}
