/** What sharing a show sends: its title, a line naming it ("Elf (2003)"), and its IMDb page. */
export interface ShowShare {
  title: string;
  text: string;
  url: string;
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Shares through the device's share sheet (WhatsApp, Messages and the rest)
 * where there is one, unless `copy` asks for the clipboard instead (desktop,
 * where Windows and macOS also offer a share sheet but copying is what people
 * want). Closing the sheet is not a failure and copies nothing; a sheet that
 * fails otherwise, or none at all, copies the line and the link.
 */
export async function shareOrCopy(share: ShowShare, copy: boolean): Promise<ShareOutcome> {
  if (!copy && typeof navigator.share === 'function') {
    try {
      await navigator.share(share);
      return 'shared';
    } catch (failed) {
      if (failed instanceof DOMException && failed.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(`${share.text}\n${share.url}`);
    return 'copied';
  } catch {
    // Blocked, or no clipboard (an insecure page).
    return 'failed';
  }
}
