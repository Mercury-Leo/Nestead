import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { StepText } from './StepText';

/*
 * A step is text from a recipe's source, a page or a model (spec section 5.5):
 * StepText swaps its times for chips and makes nothing else, links least of all.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: (() => void) | null = null;

function render(text: string): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<StepText text={text} stepNumber={1} renderChip={(duration) => <span data-chip>{duration.seconds}</span>} />));
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('StepText', () => {
  it('renders a URL in a step as plain text, with no link', () => {
    const step = 'See https://evil.example/steal?x=1 for the sauce, then simmer for 10 minutes.';
    const host = render(step);
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toContain('https://evil.example/steal?x=1');
    // The time still becomes a chip.
    expect(host.querySelectorAll('[data-chip]')).toHaveLength(1);
  });

  it('renders markup in a step as the text it is', () => {
    const step = '<a href="https://evil.example">Click here</a> and stir.';
    const host = render(step);
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toBe(step);
  });
});
