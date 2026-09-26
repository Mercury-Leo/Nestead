import { afterEach, describe, expect, it } from 'vitest';
import { captureInvite, clearInvite, inviteLink, pendingInvite } from './invite';

function open(url: string): void {
  history.replaceState(null, '', url);
}

describe('invite links', () => {
  afterEach(() => {
    clearInvite();
    open('/');
  });

  it('makes a link at this origin', () => {
    expect(inviteLink('ABCD2345')).toBe(`${window.location.origin}/join/ABCD2345`);
  });

  it('keeps the code from /join/<code> and returns to the home page', () => {
    open('/join/abcd2345');
    captureInvite();
    expect(pendingInvite()).toBe('ABCD2345');
    expect(window.location.pathname).toBe('/');
  });

  it('keeps the query and hash an email link brings back', () => {
    open('/join/ABCD2345/?x=1#access_token=t&type=signup');
    captureInvite();
    expect(pendingInvite()).toBe('ABCD2345');
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/?x=1#access_token=t&type=signup');
  });

  it('leaves every other address alone', () => {
    for (const url of ['/', '/lists', '/join', '/join/', '/join/AB', '/join/ABCD2345/extra', '/join/ABCD-2345']) {
      open(url);
      captureInvite();
      expect(pendingInvite()).toBeNull();
      expect(window.location.pathname).toBe(url);
    }
  });

  it('forgets the code once cleared', () => {
    open('/join/ABCD2345');
    captureInvite();
    clearInvite();
    expect(pendingInvite()).toBeNull();
  });
});
