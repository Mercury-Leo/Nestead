/**
 * Invite links: /join/ABCD2345 carries a family's join code, so somebody new
 * can sign up and land on the join screen with the code already filled in.
 *
 * The link is only the code in another form. Rotating the code on the Family
 * page stops old links working too, and join_family() still checks the code;
 * nothing here grants access.
 *
 * The code is kept on the device until it is used, because signing up can
 * leave the app: the confirmation email opens it again, maybe in a new tab.
 */

const KEY = 'nestead:device:invite';
const PATH = /^\/join\/([A-Za-z0-9]{4,16})\/?$/;

/** The link to send, for the app at this origin. */
export function inviteLink(code: string): string {
  return `${window.location.origin}/join/${encodeURIComponent(code)}`;
}

/**
 * If the page was opened from an invite link, keeps its code and puts the
 * address back to the home page. Run once, before the router reads the
 * address. The query and hash stay: a confirmation email brings the session
 * back in them.
 */
export function captureInvite(): void {
  const match = PATH.exec(window.location.pathname);
  if (match === null) return;
  try {
    localStorage.setItem(KEY, (match[1] as string).toUpperCase());
  } catch {
    // Without storage the code is simply not prefilled; it can still be typed.
  }
  history.replaceState(history.state, '', `/${window.location.search}${window.location.hash}`);
}

/** The code from an invite link this device opened and has not used yet. */
export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Forgets the pending invite: it was used, or the person chose otherwise. */
export function clearInvite(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}
