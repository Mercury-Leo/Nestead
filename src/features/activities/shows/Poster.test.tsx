import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Poster, posterSrcSet } from './Poster';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OMDB = 'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX300.jpg';
let unmount: (() => void) | null = null;

function render(url: string | undefined): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Poster url={url} kind="movie" sizes="84px" />));
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

describe('posterSrcSet', () => {
  it("offers OMDb's poster at 100, 200 and its own 300 px", () => {
    expect(posterSrcSet(OMDB)).toBe(
      [
        'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX100.jpg 100w',
        'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX200.jpg 200w',
        `${OMDB} 300w`,
      ].join(', '),
    );
  });

  it('leaves any other link alone', () => {
    expect(posterSrcSet('https://m.media-amazon.com/images/M/x._V1_UX182_CR0,0,182,268_AL_.jpg')).toBeUndefined();
    expect(posterSrcSet('https://example.com/poster.jpg')).toBeUndefined();
  });
});

describe('Poster', () => {
  it("asks for a width that fits, then OMDb's own link, then shows the placeholder", () => {
    const host = render(OMDB);
    const img = (): HTMLImageElement | null => host.querySelector('img');
    expect(img()?.getAttribute('srcset')).toBe(posterSrcSet(OMDB));
    expect(img()?.getAttribute('sizes')).toBe('84px');
    expect(img()?.getAttribute('src')).toBe(OMDB);

    act(() => img()?.dispatchEvent(new Event('error')));
    expect(img()?.getAttribute('src')).toBe(OMDB);
    expect(img()?.hasAttribute('srcset')).toBe(false);

    act(() => img()?.dispatchEvent(new Event('error')));
    expect(img()).toBeNull();
    expect(host.querySelector('svg')).not.toBeNull();
  });

  it('shows the placeholder for no poster, or one that is not https', () => {
    expect(render(undefined).querySelector('img')).toBeNull();
    unmount?.();
    expect(render('http://m.media-amazon.com/images/M/x._V1_SX300.jpg').querySelector('img')).toBeNull();
  });
});
