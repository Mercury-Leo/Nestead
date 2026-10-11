import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Popover } from './Popover';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: (() => void) | null = null;
let closes = 0;
// Undoes the sizes layout() stubs.
let undo: (() => void) | null = null;

afterEach(() => {
  unmount?.();
  unmount = null;
  closes = 0;
  undo?.();
  undo = null;
  vi.restoreAllMocks();
});

/** A button that toggles a popover of two buttons, the second marked to take focus when `autofocus`. */
function Page({ autofocus, align }: { autofocus: boolean; align?: 'start' | 'end' }): JSX.Element {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen(!open)}>
        Open
      </button>
      <button type="button">Elsewhere</button>
      {open && (
        <Popover
          anchor={anchor}
          label="Choices"
          align={align}
          onClose={() => {
            closes += 1;
            setOpen(false);
          }}
        >
          <button type="button">First</button>
          <button type="button" data-autofocus={autofocus ? true : undefined}>
            Second
          </button>
        </Popover>
      )}
    </>
  );
}

function render(autofocus = false, align?: 'start' | 'end'): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Page autofocus={autofocus} align={align} />));
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

const named = (name: string): HTMLButtonElement =>
  [...document.querySelectorAll('button')].find((button) => button.textContent === name) as HTMLButtonElement;
const panel = (): HTMLElement | null => document.querySelector('[role="dialog"]');
const press = (target: Element): void => act(() => void target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
const key = (init: KeyboardEventInit): void =>
  act(() => void document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })));
const open = (): void => act(() => named('Open').click());

describe('Popover', () => {
  it('floats in <body>, named, and focuses its first control', () => {
    const host = render();
    open();

    expect(panel()?.getAttribute('aria-label')).toBe('Choices');
    expect(host.contains(panel())).toBe(false);
    expect(document.activeElement).toBe(named('First'));
  });

  it('focuses the control marked data-autofocus instead', () => {
    render(true);
    open();

    expect(document.activeElement).toBe(named('Second'));
  });

  it('closes on a press outside, but not on one inside or on its anchor', () => {
    render();
    open();

    press(named('Second'));
    press(named('Open'));
    expect(closes).toBe(0);

    press(named('Elsewhere'));
    expect(closes).toBe(1);
    expect(panel()).toBeNull();
  });

  it('closes when focus goes elsewhere', () => {
    render();
    open();

    act(() => named('Elsewhere').focus());

    expect(panel()).toBeNull();
  });

  it('closes on Esc and puts focus back on its anchor', () => {
    render();
    open();

    key({ key: 'Escape' });

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(named('Open'));
  });

  it('goes back to its anchor on Tab past either end, not out of the page', () => {
    render();
    open();
    act(() => named('Second').focus());

    key({ key: 'Tab' });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(named('Open'));

    open();
    key({ key: 'Tab', shiftKey: true });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(named('Open'));
  });

  it('lets Tab move inside it', () => {
    render();
    open();

    key({ key: 'Tab' });

    // Not the last control, so the browser's own Tab is left alone.
    expect(panel()).not.toBeNull();
  });
});

/**
 * jsdom lays nothing out, so the window (400 by 800), the anchor's box and the
 * panel's size are stubbed, until the test ends.
 */
function layout(anchor: { top: number; left: number }, panel = { width: 200, height: 150 }): void {
  const box = { top: anchor.top, bottom: anchor.top + 30, left: anchor.left, right: anchor.left + 60, width: 60, height: 30 };
  vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...box, x: box.left, y: box.top, toJSON: () => box });
  const view = document.documentElement;
  const sizes: [object, string, number][] = [
    [view, 'clientWidth', 400],
    [view, 'clientHeight', 800],
    [HTMLDivElement.prototype, 'offsetWidth', panel.width],
    [HTMLDivElement.prototype, 'scrollHeight', panel.height],
  ];
  for (const [target, name, value] of sizes) Object.defineProperty(target, name, { configurable: true, get: () => value });
  undo = () => {
    for (const [target, name] of sizes) delete (target as Record<string, unknown>)[name];
  };
}

describe('Popover placement', () => {
  it('opens below its anchor, lined up with its start edge, as tall as the room', () => {
    layout({ top: 100, left: 50 });
    render();
    open();

    const style = panel()?.style;
    // 130 + the 6px gap; 800 - 136 - the 8px margin.
    expect([style?.top, style?.bottom, style?.left, style?.maxHeight]).toEqual(['136px', 'auto', '50px', '656px']);
    expect(style?.visibility).toBe('visible');
  });

  it('opens above when it does not fit below and there is more room above', () => {
    layout({ top: 700, left: 50 });
    render();
    open();

    const style = panel()?.style;
    // 800 - 700 + 6 from the bottom; 700 - 6 - 8 of room.
    expect([style?.top, style?.bottom, style?.maxHeight]).toEqual(['auto', '106px', '686px']);
  });

  it('stays below when it fits, however much room there is above', () => {
    layout({ top: 600, left: 50 }, { width: 200, height: 100 });
    render();
    open();

    expect(panel()?.style.top).toBe('636px');
  });

  it('lines up with the end edge for align="end", and keeps inside the window', () => {
    layout({ top: 100, left: 240 });
    render(false, 'end');
    open();
    // The anchor's right edge, 300, less the panel's 200.
    expect(panel()?.style.left).toBe('100px');
    unmount?.();

    layout({ top: 100, left: 300 });
    render();
    open();
    // From 300 it would end at 500: held to 400 - 200 - 8.
    expect(panel()?.style.left).toBe('192px');
  });
});
