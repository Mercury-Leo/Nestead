import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { localeReady } from '../../i18n';
import { Sheet } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: (() => void) | null = null;

beforeAll(async () => {
  await localeReady;
  // jsdom has no modal dialogs; the Sheet opens and closes its <dialog> with these.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

/**
 * A button that opens a sheet. `mounted` renders the sheet only while it is
 * open, as Add show and the Tags sheet are; otherwise it stays on the page and
 * follows `open`, as the filter sheets do.
 */
function Page({ mounted }: { mounted: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Elsewhere</button>
      {(!mounted || open) && (
        <Sheet open={open} onClose={() => setOpen(false)} title="Sheet">
          <button type="button" onClick={() => setOpen(false)}>
            Done
          </button>
        </Sheet>
      )}
    </>
  );
}

function render(mounted: boolean): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Page mounted={mounted} />));
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

const button = (root: ParentNode, text: string): HTMLButtonElement =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;

/** Opens the sheet from its button, with focus where a keyboard would leave it, then moves focus into the sheet. */
function open(host: HTMLElement): HTMLButtonElement {
  const opener = button(host, 'Open');
  opener.focus();
  act(() => opener.click());
  const done = button(document.querySelector('dialog[open]') as HTMLDialogElement, 'Done');
  done.focus();
  return opener;
}

describe('Sheet', () => {
  it('gives focus back to what opened it when it leaves the page', () => {
    const host = render(true);
    const opener = open(host);
    act(() => button(document.querySelector('dialog[open]') as HTMLDialogElement, 'Done').click());
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('gives focus back when it closes and stays on the page', () => {
    const host = render(false);
    const opener = open(host);
    act(() => button(document.querySelector('dialog[open]') as HTMLDialogElement, 'Done').click());
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('leaves focus alone when something outside the sheet has taken it', () => {
    const host = render(true);
    open(host);
    const elsewhere = button(host, 'Elsewhere');
    elsewhere.focus();
    act(() => button(document.querySelector('dialog[open]') as HTMLDialogElement, 'Done').click());
    expect(document.activeElement).toBe(elsewhere);
  });

  it('moves no focus when nothing had it as the sheet opened', () => {
    const host = render(true);
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => button(host, 'Open').click());
    act(() => button(document.querySelector('dialog[open]') as HTMLDialogElement, 'Done').click());
    expect(document.activeElement).toBe(document.body);
  });
});
