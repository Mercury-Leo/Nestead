import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { Account, SignUpResult } from '../../data/types';
import { inviteLink } from '../invite';
import { useInviteFamily } from '../useInviteFamily';

/**
 * Email and password rather than a magic link: a link depends on email actually
 * being delivered, and a hosted auth service's built-in mailer is usually rate
 * limited and meant for testing. Sessions refresh themselves, so this screen is rare after the first
 * time on a device.
 *
 * Both people sign in as themselves. There is no shared family password: a
 * shared secret cannot be revoked for one person, gives no attribution, and
 * would make a member's id being their account's id meaningless.
 *
 * Forgotten passwords are the one place email is unavoidable. The link comes
 * back to this app, and AccountSession shows SetNewPassword instead of the app.
 *
 * Opened from an invite link, it starts on Create account: the person invited
 * is most likely new, and it names the family they are about to join. Signing
 * in instead works just as well.
 */

type Mode = 'signIn' | 'signUp' | 'forgot';

export function SignIn({ account, inviteCode }: { account: Account; inviteCode: string | null }): JSX.Element {
  const { t } = useTranslation();

  const [mode, setMode] = useState<Mode>(inviteCode !== null ? 'signUp' : 'signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => account.rememberMe());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => account.takeLinkError());
  const [notice, setNotice] = useState<string | null>(null);
  const invite = useInviteFamily(account, inviteCode);

  const switchTo = (next: Mode): void => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === 'forgot') {
      try {
        await account.sendPasswordReset(email.trim(), window.location.origin + window.location.pathname);
      } catch (failed) {
        setError((failed as Error).message);
        return;
      } finally {
        setBusy(false);
      }
      // Worded the same whether or not the account exists, so this screen
      // cannot be used to find out who has one.
      setNotice(t('auth.signIn.resetSent'));
      return;
    }

    let result: SignUpResult = 'signedIn';
    try {
      if (mode === 'signUp') {
        // The confirmation email comes back to the invite, so it is not lost
        // if the link is opened in another browser.
        result = await account.signUp(email.trim(), password, remember, inviteCode !== null ? inviteLink(inviteCode) : undefined);
      } else {
        await account.signIn(email.trim(), password, remember);
      }
    } catch (failed) {
      setError((failed as Error).message);
      return;
    } finally {
      setBusy(false);
    }

    // When the backend requires email confirmation, nothing more happens until
    // that link is clicked.
    if (result === 'confirmEmail') {
      switchTo('signIn');
      setNotice(t('auth.signIn.confirmEmail'));
    }
  };

  const needsPassword = mode !== 'forgot';

  return (
    <div className="gate">
      <h1>Nestead</h1>
      <p className="gate-sub">{t(`auth.signIn.subtitle.${mode}`)}</p>
      {inviteCode !== null && mode !== 'forgot' && invite.kind !== 'loading' && (
        <p className="notice">
          {invite.kind === 'found' ? (
            <Trans i18nKey="auth.signIn.invitedTo" values={{ family: invite.name }} />
          ) : invite.kind === 'unknown' ? (
            t('auth.signIn.inviteExpired')
          ) : (
            t('auth.signIn.invited')
          )}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          {t('auth.signIn.email')}
          <input
            type="email"
            dir="ltr"
            value={email}
            autoComplete="email"
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        {needsPassword && (
          <label>
            {t('auth.signIn.password')}
            <input
              type="password"
              dir="ltr"
              value={password}
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}

        {needsPassword && (
          <label className="remember">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            {t('auth.signIn.remember')}
          </label>
        )}

        {error !== null && <p className="error">{error}</p>}
        {notice !== null && <p className="notice">{notice}</p>}

        <button type="submit" disabled={busy || email.trim() === '' || (needsPassword && password === '')}>
          {busy ? t('common.working') : t(`auth.signIn.submit.${mode}`)}
        </button>
      </form>

      {mode === 'signIn' && (
        <button type="button" className="link" onClick={() => switchTo('forgot')}>
          {t('auth.signIn.forgotLink')}
        </button>
      )}

      <button
        type="button"
        className="link"
        onClick={() => switchTo(mode === 'signIn' ? 'signUp' : 'signIn')}
      >
        {mode === 'signIn' ? t('auth.signIn.needAccount') : t('auth.signIn.backToSignIn')}
      </button>
    </div>
  );
}
