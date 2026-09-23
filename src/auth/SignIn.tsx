import { useState } from 'react';
import { getRememberMe, getSupabaseClient, setRememberMe, takeLinkError } from '../data/supabaseClient';

/**
 * Email and password rather than a magic link: a link depends on email actually
 * being delivered, and Supabase's built-in mailer is rate limited and meant for
 * testing. Sessions refresh themselves, so this screen is rare after the first
 * time on a device.
 *
 * Both people sign in as themselves. There is no shared family password: a
 * shared secret cannot be revoked for one person, gives no attribution, and
 * would make members.id = auth.users.id meaningless.
 *
 * Forgotten passwords are the one place email is unavoidable. The link comes
 * back to this app, and SupabaseSession shows SetNewPassword instead of the app.
 */

type Mode = 'signIn' | 'signUp' | 'forgot';

const SUBTITLES: Record<Mode, string> = {
  signIn: 'Sign in',
  signUp: 'Create your account',
  forgot: 'Reset your password',
};

const SUBMIT_LABELS: Record<Mode, string> = {
  signIn: 'Sign in',
  signUp: 'Create account',
  forgot: 'Send reset link',
};

export function SignIn(): JSX.Element {
  const client = getSupabaseClient();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(getRememberMe);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(takeLinkError);
  const [notice, setNotice] = useState<string | null>(null);

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
      const { error: failed } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + window.location.pathname,
      });
      setBusy(false);
      if (failed !== null) {
        setError(failed.message);
        return;
      }
      // Worded the same whether or not the account exists, so this screen
      // cannot be used to find out who has one.
      setNotice('If that email has an account, a reset link is on its way. It expires in an hour.');
      return;
    }

    setRememberMe(remember);

    const credentials = { email: email.trim(), password };
    const { data, error: failed } =
      mode === 'signUp'
        ? await client.auth.signUp(credentials)
        : await client.auth.signInWithPassword(credentials);

    setBusy(false);

    if (failed !== null) {
      setError(failed.message);
      return;
    }

    // Sign-up returns a user with no session when the project requires email
    // confirmation. Nothing more happens until that link is clicked.
    if (mode === 'signUp' && data.session === null) {
      switchTo('signIn');
      setNotice('Account created. Check your email to confirm it, then sign in.');
    }
  };

  const needsPassword = mode !== 'forgot';

  return (
    <div className="gate">
      <h1>Nestead</h1>
      <p className="gate-sub">{SUBTITLES[mode]}</p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          Email
          <input
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        {needsPassword && (
          <label>
            Password
            <input
              type="password"
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
            Remember me
          </label>
        )}

        {error !== null && <p className="error">{error}</p>}
        {notice !== null && <p className="notice">{notice}</p>}

        <button type="submit" disabled={busy || email.trim() === '' || (needsPassword && password === '')}>
          {busy ? 'Working…' : SUBMIT_LABELS[mode]}
        </button>
      </form>

      {mode === 'signIn' && (
        <button type="button" className="link" onClick={() => switchTo('forgot')}>
          Forgot password?
        </button>
      )}

      <button
        type="button"
        className="link"
        onClick={() => switchTo(mode === 'signIn' ? 'signUp' : 'signIn')}
      >
        {mode === 'signIn' ? 'I need an account' : 'Back to sign in'}
      </button>
    </div>
  );
}
