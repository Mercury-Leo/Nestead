import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Poster, posterSrcSet } from './Poster';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OMDB = 'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_QL75_UX380_CR0,0,380,562_.jpg';
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
  const sized = (id: string): string =>
    [100, 200, 300].map((width) => `https://m.media-amazon.com/images/M/${id}._V1_QL75_SX${width}.jpg ${width}w`).join(', ');

  it("offers OMDb's poster at 100, 200 and 300 px, from the link OMDb gives today", () => {
    // As OMDb answered on 2026-10-04: a 380 px crop at quality 75.
    expect(posterSrcSet(OMDB)).toBe(sized('MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@'));
    expect(posterSrcSet('https://m.media-amazon.com/images/M/MV5BOWE4NTc3YmYtNmU2Mi00ZjhkLWE1MTItZmM1M2U1ODU3YjFlXkEyXkFqcGc@._V1_QL75_UY562_CR2,0,380,562_.jpg')).toBe(
      sized('MV5BOWE4NTc3YmYtNmU2Mi00ZjhkLWE1MTItZmM1M2U1ODU3YjFlXkEyXkFqcGc@'),
    );
  });

  it('reads the older SX300 links the same way', () => {
    expect(posterSrcSet('https://m.media-amazon.com/images/M/MV5Bx@@._V1_SX300.jpg')).toBe(sized('MV5Bx@@'));
  });

  it('leaves any other link alone', () => {
    expect(posterSrcSet('https://example.com/poster._V1_SX300.jpg')).toBeUndefined();
    expect(posterSrcSet('https://m.media-amazon.com/images/M/x.jpg')).toBeUndefined();
    expect(posterSrcSet('https://m.media-amazon.com/images/M/x._V1_SX300.jpg?x=1')).toBeUndefined();
    expect(posterSrcSet('https://m.media-amazon.com/images/I/x._V1_SX300.jpg')).toBeUndefined();
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
