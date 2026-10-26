// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READ_TIMEOUT_MS, TOKEN_TIMEOUT_MS, withTimeLimits } from './timeLimits';

const PROJECT = 'https://abcd.supabase.co';

/** A connection that hangs: no answer ever, but an abort ends the request as fetch would. */
const hanging = vi.fn(
  (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }),
);

/** Whether `promise` has settled, and how, without waiting for it. */
async function outcome(promise: Promise<unknown>): Promise<'pending' | 'resolved' | 'rejected'> {
  let state: 'pending' | 'resolved' | 'rejected' = 'pending';
  promise.then(
    () => (state = 'resolved'),
    () => (state = 'rejected'),
  );
  await vi.advanceTimersByTimeAsync(0);
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
  hanging.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeLimits', () => {
  it('fails a token request, the refresh a launch waits on, after TOKEN_TIMEOUT_MS', async () => {
    const request = withTimeLimits(hanging)(`${PROJECT}/auth/v1/token?grant_type=refresh_token`, { method: 'POST' });
    request.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(TOKEN_TIMEOUT_MS - 1);
    expect(await outcome(request)).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('fails a read after READ_TIMEOUT_MS', async () => {
    const request = withTimeLimits(hanging)(`${PROJECT}/rest/v1/members?select=*`, { method: 'GET' });
    request.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
    expect(await outcome(request)).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('never cuts off a write, an RPC or a photo upload', async () => {
    const limited = withTimeLimits(hanging);
    const writes = [
      limited(`${PROJECT}/rest/v1/tasks`, { method: 'POST' }),
      limited(`${PROJECT}/rest/v1/tasks?id=eq.1`, { method: 'PATCH' }),
      limited(`${PROJECT}/rest/v1/rpc/join_family`, { method: 'POST' }),
      limited(`${PROJECT}/storage/v1/object/photos/f/p.jpg`, { method: 'POST' }),
    ];

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    for (const write of writes) expect(await outcome(write)).toBe('pending');
  });

  it('passes an answer in time straight through', async () => {
    const answer = new Response('[]', { status: 200 });
    const request = withTimeLimits(async () => answer)(`${PROJECT}/rest/v1/members`, { method: 'GET' });

    expect(await request).toBe(answer);
  });

  it("keeps the caller's own abort working", async () => {
    const caller = new AbortController();
    const request = withTimeLimits(hanging)(`${PROJECT}/rest/v1/members`, { method: 'GET', signal: caller.signal });
    request.catch(() => undefined);

    caller.abort(new Error('Left the page'));

    await expect(request).rejects.toThrow('Left the page');
  });
});
