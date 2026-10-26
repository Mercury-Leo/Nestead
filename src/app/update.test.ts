import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECK_EVERY_MS, CHECK_GAP_MS, WRITE_WAIT_MS, hasTypedText, watchForUpdates } from './update';
import type { UpdateWatch, UpdateWatchOptions } from './update';

let visibility: DocumentVisibilityState = 'visible';
let watch: UpdateWatch | null = null;
const reload = vi.fn();

function start(options: Partial<UpdateWatchOptions> = {}): UpdateWatch {
  watch = watchForUpdates({ current: 'v1', latest: async () => 'v2', reload, ...options });
  return watch;
}

/** Lets the check's promises and any timers due run. */
const settle = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

async function hideAndShow(): Promise<void> {
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  await settle(5_000);
  visibility = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  await settle();
}

function field(type: string, value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  document.body.append(input);
  return input;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-12T09:00:00Z') });
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  sessionStorage.clear();
  reload.mockReset();
});

afterEach(() => {
  watch?.stop();
  watch = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('watchForUpdates', () => {
  it('reloads when the tab is shown again and the server has another build', async () => {
    start();

    await hideAndShow();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves the tab alone while the server has the build it runs', async () => {
    const latest = vi.fn(async () => 'v1');
    start({ latest });

    await hideAndShow();

    expect(latest).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps text typed in a field, and reloads on the next page change instead', async () => {
    field('text', 'Half a recipe');
    const update = start();

    await hideAndShow();
    expect(reload).not.toHaveBeenCalled();

    update.navigated();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload once the person has pressed or typed since the tab was shown', async () => {
    let answer: (version: string) => void = () => undefined;
    const update = start({ latest: () => new Promise((resolve) => (answer = resolve)) });

    await hideAndShow();
    window.dispatchEvent(new Event('pointerdown'));
    answer('v2');
    await settle();
    expect(reload).not.toHaveBeenCalled();

    update.navigated();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('asks the server at most once a minute', async () => {
    const latest = vi.fn(async () => 'v1');
    start({ latest });

    await hideAndShow();
    await hideAndShow();
    expect(latest).toHaveBeenCalledTimes(1);

    await settle(CHECK_GAP_MS);
    await hideAndShow();
    expect(latest).toHaveBeenCalledTimes(2);
  });

  it('checks every 15 minutes while in view, and then reloads only on a page change', async () => {
    const latest = vi.fn(async () => 'v2');
    const update = start({ latest });
    // In use: a reload now could cut something off.
    window.dispatchEvent(new Event('keydown'));

    await settle(CHECK_EVERY_MS);
    expect(latest).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    update.navigated();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('skips the timed check while the tab is hidden', async () => {
    const latest = vi.fn(async () => 'v2');
    start({ latest });
    visibility = 'hidden';

    await settle(CHECK_EVERY_MS);

    expect(latest).not.toHaveBeenCalled();
  });

  it('checks on a page change, and reloads the page just opened if it finds a build', async () => {
    const latest = vi.fn(async () => 'v2');
    const update = start({ latest });
    // The press that changed the page.
    window.dispatchEvent(new Event('pointerdown'));

    update.navigated();
    await settle();

    expect(latest).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves the page just opened alone if the person starts on it during the check, and reloads on the next change', async () => {
    let answer: (version: string) => void = () => undefined;
    const update = start({ latest: () => new Promise((resolve) => (answer = resolve)) });

    update.navigated();
    window.dispatchEvent(new Event('keydown'));
    answer('v2');
    await settle();
    expect(reload).not.toHaveBeenCalled();

    update.navigated();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads when the connection comes back, if nothing was touched since the tab was shown', async () => {
    let online = false;
    start({ latest: async () => (online ? 'v2' : undefined) });
    await hideAndShow();
    expect(reload).not.toHaveBeenCalled();

    online = true;
    await settle(CHECK_GAP_MS);
    window.dispatchEvent(new Event('online'));
    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads at most once for a build, so a server still sending the old page cannot loop it', async () => {
    start();
    await hideAndShow();
    expect(reload).toHaveBeenCalledTimes(1);

    // The reload brought back v1 again: the new tab starts over, on v1.
    watch?.stop();
    const update = start();
    await settle(CHECK_GAP_MS);
    await hideAndShow();
    update.navigated();
    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads for a build after that one', async () => {
    start();
    await hideAndShow();
    watch?.stop();

    start({ latest: async () => 'v3' });
    await hideAndShow();

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('still finds a newer build on a page change after one it could not get', async () => {
    let version = 'v2';
    start({ latest: async () => version });
    await hideAndShow();
    watch?.stop();
    // Reloaded for v2, but the server sent v1 again.
    const update = start({ latest: async () => version });
    await settle(CHECK_GAP_MS);
    await hideAndShow();
    expect(reload).toHaveBeenCalledTimes(1);

    version = 'v3';
    await settle(CHECK_GAP_MS);
    update.navigated();
    await settle();

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('ignores a check that fails', async () => {
    const update = start({ latest: () => Promise.reject(new Error('offline')) });

    await hideAndShow();
    update.navigated();
    await settle();

    expect(reload).not.toHaveBeenCalled();
  });

  it('waits for writes on their way before reloading', async () => {
    let done: () => void = () => undefined;
    const settled = vi.fn(() => new Promise<void>((resolve) => (done = resolve)));
    start({ settled });

    await hideAndShow();
    expect(settled).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    done();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads anyway once a write has hung for WRITE_WAIT_MS', async () => {
    start({ settled: () => new Promise<void>(() => undefined) });

    await hideAndShow();
    await settle(WRITE_WAIT_MS - 1);
    expect(reload).not.toHaveBeenCalled();

    await settle(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits for the service worker to keep the new build before reloading, and for writes too", async () => {
    let downloaded: () => void = () => undefined;
    let written: () => void = () => undefined;
    const download = vi.fn(() => new Promise<void>((resolve) => (downloaded = resolve)));
    start({ download, settled: () => new Promise<void>((resolve) => (written = resolve)) });

    await hideAndShow();
    expect(download).toHaveBeenCalled();

    downloaded();
    await settle();
    expect(reload).not.toHaveBeenCalled();

    written();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads anyway once the download has hung for WRITE_WAIT_MS, or at once when it fails', async () => {
    start({ download: () => new Promise<void>(() => undefined) });
    await hideAndShow();
    await settle(WRITE_WAIT_MS - 1);
    expect(reload).not.toHaveBeenCalled();
    await settle(1);
    expect(reload).toHaveBeenCalledTimes(1);

    watch?.stop();
    sessionStorage.clear();
    reload.mockReset();
    start({ download: () => Promise.reject(new Error('No worker')) });
    await hideAndShow();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stops listening when stopped', async () => {
    const latest = vi.fn(async () => 'v2');
    start({ latest }).stop();

    await hideAndShow();
    await settle(CHECK_EVERY_MS);

    expect(latest).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('hasTypedText', () => {
  it('counts text in a text field or a text area', () => {
    expect(hasTypedText()).toBe(false);
    field('search', '   ');
    expect(hasTypedText()).toBe(false);
    const area = document.createElement('textarea');
    area.value = 'Notes';
    document.body.append(area);
    expect(hasTypedText()).toBe(true);
  });

  it('leaves out controls that always hold a value', () => {
    field('checkbox', 'on');
    field('number', '4');
    field('date', '2026-10-12');
    field('hidden', 'x');
    expect(hasTypedText()).toBe(false);
    field('text', 'Garden');
    expect(hasTypedText()).toBe(true);
  });
});
