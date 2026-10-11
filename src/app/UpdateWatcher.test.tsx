import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateWatcher } from './UpdateWatcher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let visibility: DocumentVisibilityState = 'visible';
let navigate: NavigateFunction = () => undefined;
let unmount: (() => void) | null = null;
const reload = vi.fn();

function Steer(): null {
  navigate = useNavigate();
  return null;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(current?: string): Promise<void> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/recipe/r1/cook?step=1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UpdateWatcher current={current} latest={async () => 'v2'} reload={reload} />
        <Steer />
      </MemoryRouter>,
    );
  });
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
}

/** The tab hidden and shown again, which checks the server. */
async function comeBack(): Promise<void> {
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  visibility = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  await flush();
}

beforeEach(() => {
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  sessionStorage.clear();
  reload.mockReset();
  // Text in a field, so coming back finds the new build but leaves the page alone.
  const field = document.createElement('input');
  field.value = 'Two eggs';
  document.body.append(field);
});

afterEach(() => {
  unmount?.();
  unmount = null;
  document.body.replaceChildren();
});

describe('UpdateWatcher', () => {
  it('reloads on a move to another page once a newer build is waiting, not on a change of step', async () => {
    await render('v1');
    await comeBack();
    expect(reload).not.toHaveBeenCalled();

    await act(async () => navigate('/recipe/r1/cook?step=2', { replace: true }));
    await flush();
    expect(reload).not.toHaveBeenCalled();

    await act(async () => navigate('/recipe/r1'));
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing in a bundle with no build id', async () => {
    await render(undefined);
    await comeBack();

    await act(async () => navigate('/'));
    await flush();

    expect(reload).not.toHaveBeenCalled();
  });
});
