// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHELL_KEY, SHELL_WAIT_MS, buildFile, isAppPage, isBuildFile, openPage, refreshShell, startFiles } from './shellCache';
import type { ShellDeps } from './shellCache';

const ORIGIN = 'https://nestead.example';

/** The page a build starts with, as Vite writes it. */
function page(build: string): string {
  return [
    '<!doctype html><html><head>',
    `<script type="module" crossorigin src="/assets/index-${build}.js"></script>`,
    '<link rel="modulepreload" crossorigin href="/assets/react-same.js">',
    `<link rel="stylesheet" crossorigin href="/assets/index-${build}.css">`,
    '</head><body><div id="root"></div></body></html>',
  ].join('\n');
}

const html = (body: string, status = 200): Response => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
const file = (path: string): Response => new Response(`/* ${path} */`, { headers: { 'content-type': 'text/javascript' } });

/** Never settles: a connection that hangs rather than fails. */
const hang = (): Promise<Response> => new Promise<Response>(() => undefined);

/** Cache Storage with the one cache, keyed by path as the worker's relative URLs resolve. */
class FakeCache {
  readonly entries = new Map<string, Response>();

  private path(input: RequestInfo | URL): string {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(url, ORIGIN).pathname;
  }

  async match(input: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(this.path(input))?.clone();
  }

  async put(input: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(this.path(input), response);
  }

  async delete(input: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(this.path(input));
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((path) => new Request(ORIGIN + path));
  }

  /** What is kept, by path. */
  kept(): string[] {
    return [...this.entries.keys()].sort();
  }

  async keptPage(): Promise<string | undefined> {
    return (await this.match(SHELL_KEY))?.text();
  }
}

let cache: FakeCache;
/** What the server sends for each path; a path missing here fails like a dropped connection. */
let server: Map<string, () => Promise<Response>>;
let fetched: string[];
let deps: ShellDeps;

function serve(path: string, respond: () => Promise<Response>): void {
  server.set(path, respond);
}

/** Serves a build's page and every file it starts with. */
function serveBuild(build: string): void {
  serve('/', async () => html(page(build)));
  for (const path of startFiles(page(build))) serve(path, async () => file(path));
}

/** Keeps a build as an earlier launch would have. */
async function keepBuild(build: string): Promise<void> {
  serveBuild(build);
  await refreshShell(deps);
  fetched = [];
}

/** The server's answer to a launch, as the worker asks for it. */
const launch = (): Promise<Response> => deps.fetch(SHELL_KEY);

/** Lets promises and any timers due run. */
const settle = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

/** Whether `promise` has settled yet, without waiting for it. */
async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  await settle();
  return settled;
}

beforeEach(() => {
  vi.useFakeTimers();
  cache = new FakeCache();
  server = new Map();
  fetched = [];
  deps = {
    caches: { open: async () => cache } as unknown as CacheStorage,
    fetch: (input) => {
      const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, ORIGIN).pathname;
      fetched.push(path);
      const respond = server.get(path);
      return respond === undefined ? Promise.reject(new TypeError('Failed to fetch')) : respond();
    },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isAppPage', () => {
  const navigation = (path: string, origin = ORIGIN, mode: RequestMode = 'navigate'): Request =>
    ({ url: origin + path, mode, method: 'GET' }) as Request;

  it("answers a launch or reload of any of the app's pages", () => {
    for (const path of ['/', '/history', '/recipe/3f2a/cook?step=2', '/join/AB12CD']) {
      expect(isAppPage(navigation(path), ORIGIN)).toBe(true);
    }
  });

  it('leaves files, API routes, other sites and requests that are not a navigation alone', () => {
    expect(isAppPage(navigation('/version.json'), ORIGIN)).toBe(false);
    expect(isAppPage(navigation('/icons/icon.svg'), ORIGIN)).toBe(false);
    expect(isAppPage(navigation('/api/ai/read'), ORIGIN)).toBe(false);
    expect(isAppPage(navigation('/', 'https://elsewhere.example'), ORIGIN)).toBe(false);
    expect(isAppPage(navigation('/', ORIGIN, 'cors'), ORIGIN)).toBe(false);
  });
});

describe('isBuildFile', () => {
  it('answers GETs of /assets/ on this origin only', () => {
    expect(isBuildFile(new Request(`${ORIGIN}/assets/index-a.js`), ORIGIN)).toBe(true);
    expect(isBuildFile(new Request(`${ORIGIN}/version.json`), ORIGIN)).toBe(false);
    expect(isBuildFile(new Request('https://elsewhere.example/assets/index-a.js'), ORIGIN)).toBe(false);
    expect(isBuildFile(new Request(`${ORIGIN}/assets/index-a.js`, { method: 'POST' }), ORIGIN)).toBe(false);
  });
});

describe('startFiles', () => {
  it("finds the script, preloaded chunks and stylesheet in Vite's page, once each", () => {
    const built = `${page('v1')}\n<script type="module" src="/assets/index-v1.js"></script><link rel="icon" href="/icons/icon.svg">`;
    expect(startFiles(built)).toEqual(['/assets/index-v1.js', '/assets/react-same.js', '/assets/index-v1.css']);
  });
});

describe('openPage', () => {
  it('waits on the server, however long, when nothing is kept yet, then keeps what it sent', async () => {
    let answer: (response: Response) => void = () => undefined;
    serve('/', () => new Promise((resolve) => (answer = resolve)));
    const opening = openPage(launch(), deps);

    await settle(SHELL_WAIT_MS * 10);
    expect(await isSettled(opening.response)).toBe(false);

    serveBuild('v1');
    answer(html(page('v1')));
    expect(await (await opening.response).text()).toBe(page('v1'));
    await opening.finished;
    expect(cache.kept()).toEqual(['/', '/assets/index-v1.css', '/assets/index-v1.js', '/assets/react-same.js']);
  });

  it("opens a new build once its page and files arrive, keeping it in place of the old one's", async () => {
    await keepBuild('v1');
    serveBuild('v2');

    const opening = openPage(launch(), deps);

    expect(await (await opening.response).text()).toBe(page('v2'));
    expect(await cache.keptPage()).toBe(page('v2'));
    expect(cache.kept()).toEqual(['/', '/assets/index-v2.css', '/assets/index-v2.js', '/assets/react-same.js']);
    // react-same.js was kept already, so only the new build's own files came down.
    expect(fetched.sort()).toEqual(['/', '/assets/index-v2.css', '/assets/index-v2.js']);
  });

  it('opens the kept copy once the server has hung for SHELL_WAIT_MS', async () => {
    await keepBuild('v1');
    serve('/', hang);

    const opening = openPage(launch(), deps);

    await settle(SHELL_WAIT_MS - 1);
    expect(await isSettled(opening.response)).toBe(false);
    await settle(1);
    expect(await (await opening.response).text()).toBe(page('v1'));
  });

  it('opens the kept copy when the page arrives but one of its files hangs, and keeps the copy', async () => {
    await keepBuild('v1');
    serveBuild('v2');
    serve('/assets/index-v2.js', hang);

    const opening = openPage(launch(), deps);
    await settle(SHELL_WAIT_MS);

    expect(await (await opening.response).text()).toBe(page('v1'));
    expect(await cache.keptPage()).toBe(page('v1'));
    expect(cache.kept()).toContain('/assets/index-v1.js');
  });

  it('keeps a download that outlasts SHELL_WAIT_MS for the next launch', async () => {
    await keepBuild('v1');
    serveBuild('v2');
    let arrive: (response: Response) => void = () => undefined;
    serve('/assets/index-v2.js', () => new Promise((resolve) => (arrive = resolve)));

    const opening = openPage(launch(), deps);
    await settle(SHELL_WAIT_MS);
    expect(await (await opening.response).text()).toBe(page('v1'));
    expect(await isSettled(opening.finished)).toBe(false);

    arrive(file('/assets/index-v2.js'));
    await opening.finished;
    expect(await cache.keptPage()).toBe(page('v2'));
    expect(cache.kept()).not.toContain('/assets/index-v1.js');
  });

  it('opens the kept copy at once when the server fails or sends an error', async () => {
    await keepBuild('v1');

    server.delete('/');
    expect(await (await openPage(launch(), deps).response).text()).toBe(page('v1'));

    serve('/', async () => html('<h1>Bad gateway</h1>', 502));
    expect(await (await openPage(launch(), deps).response).text()).toBe(page('v1'));
    expect(await cache.keptPage()).toBe(page('v1'));
  });

  it('keeps nothing that is not the app, and with nothing kept opens what the server sent', async () => {
    serve('/', async () => html('<p>Sign in to the Wi-Fi</p>'));

    const opening = openPage(launch(), deps);

    expect(await (await opening.response).text()).toBe('<p>Sign in to the Wi-Fi</p>');
    await opening.finished;
    expect(cache.kept()).toEqual([]);
  });
});

describe('when storage fails', () => {
  it('opens the app and its files from the server, as if there were no worker', async () => {
    serveBuild('v1');
    deps.caches = { open: () => Promise.reject(new DOMException('Unexpected internal error.', 'UnknownError')) } as unknown as CacheStorage;

    const opening = openPage(launch(), deps);

    expect(await (await opening.response).text()).toBe(page('v1'));
    await opening.finished;
    expect(await (await buildFile(new Request(`${ORIGIN}/assets/index-v1.js`), deps)).text()).toBe('/* /assets/index-v1.js */');
  });
});

describe('buildFile', () => {
  it('answers from the kept copy, and from the network for anything else', async () => {
    await keepBuild('v1');
    serve('/assets/Shows-abc.js', async () => file('/assets/Shows-abc.js'));

    expect(await (await buildFile(new Request(`${ORIGIN}/assets/index-v1.js`), deps)).text()).toBe('/* /assets/index-v1.js */');
    expect(fetched).toEqual([]);

    expect(await (await buildFile(new Request(`${ORIGIN}/assets/Shows-abc.js`), deps)).text()).toBe('/* /assets/Shows-abc.js */');
    expect(fetched).toEqual(['/assets/Shows-abc.js']);
    expect(cache.kept()).not.toContain('/assets/Shows-abc.js');
  });
});
