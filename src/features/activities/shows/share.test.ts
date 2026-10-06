import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareOrCopy } from './share';

const ELF = { title: 'Elf', text: 'Elf (2003)', url: 'https://www.imdb.com/title/tt0319343/' };

/** Gives `navigator` a share sheet and a clipboard for one test; jsdom has neither. */
function device({ share, writeText }: { share?: (data: ShareData) => Promise<void>; writeText?: (text: string) => Promise<void> }): void {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: writeText === undefined ? undefined : { writeText }, configurable: true });
}

afterEach(() => {
  device({});
});

describe('shareOrCopy', () => {
  it("shares through the device's share sheet, and copies nothing", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    device({ share, writeText });
    expect(await shareOrCopy(ELF, false)).toBe('shared');
    expect(share).toHaveBeenCalledWith(ELF);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies nothing when the share sheet is closed', async () => {
    const writeText = vi.fn(async () => undefined);
    device({ share: async () => Promise.reject(new DOMException('closed', 'AbortError')), writeText });
    expect(await shareOrCopy(ELF, false)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the text and link when the share sheet fails, or there is none', async () => {
    const writeText = vi.fn(async () => undefined);
    device({ share: async () => Promise.reject(new DOMException('no', 'NotAllowedError')), writeText });
    expect(await shareOrCopy(ELF, false)).toBe('copied');
    expect(writeText).toHaveBeenLastCalledWith('Elf (2003)\nhttps://www.imdb.com/title/tt0319343/');

    device({ writeText });
    expect(await shareOrCopy(ELF, false)).toBe('copied');
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('copies when asked to, even where there is a share sheet (desktop)', async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    device({ share, writeText });
    expect(await shareOrCopy(ELF, true)).toBe('copied');
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('Elf (2003)\nhttps://www.imdb.com/title/tt0319343/');
  });

  it('says so when the clipboard refuses, or there is none', async () => {
    device({ writeText: async () => Promise.reject(new DOMException('blocked', 'NotAllowedError')) });
    expect(await shareOrCopy(ELF, true)).toBe('failed');
    device({});
    expect(await shareOrCopy(ELF, true)).toBe('failed');
  });
});
