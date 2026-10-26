import { afterEach, describe, expect, it } from 'vitest';
import { keepLatestBuild } from './offline';

function withWorker(controller: Pick<ServiceWorker, 'postMessage'> | null): void {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller } });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('keepLatestBuild', () => {
  it('resolves at once in a browser without service workers, or a page no worker opened', async () => {
    await expect(keepLatestBuild()).resolves.toBeUndefined();
    withWorker(null);
    await expect(keepLatestBuild()).resolves.toBeUndefined();
  });

  it("asks the page's worker to keep the server's build, and resolves on its reply", async () => {
    let port: MessagePort | undefined;
    withWorker({
      postMessage: (_message: unknown, transfer: Transferable[]) => {
        port = transfer[0] as MessagePort;
      },
    } as Pick<ServiceWorker, 'postMessage'>);

    let done = false;
    const kept = keepLatestBuild().then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(port).toBeDefined();
    expect(done).toBe(false);

    port?.postMessage(null);
    await kept;
    expect(done).toBe(true);
    port?.close();
  });
});
