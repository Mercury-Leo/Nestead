import { useState } from 'react';
import { getSupabaseClient } from '../data/supabaseClient';

/**
 * Email and password rather than a magic link: a link depends on email actually
 * being delivered, and Supabase's built-in mailer is rate limited and meant for
 * testing. Sessions refresh themselves, so this screen is rare after the first
 * time on a device.
 *
 * Both people sign in as themselves. There is no shared family password: a
 * shared secret cannot be revoked for one person, gives no attribution, and
 * would make members.id = auth.users.id meaningless.
 */
export function SignIn(): JSX.Element {
  const client = getSupabaseClient();

  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);

    const credentials = { email: email.trim(), password };
    const { data, error: failed } = creating
      ? await client.auth.signUp(credentials)
      : await client.auth.signInWithPassword(credentials);

    setBusy(false);

    if (failed !== null) {
      setError(failed.message);
      return;
    }

    // Sign-up returns a user with no session when the project requires email
    // confirmation. Nothing more happens until that link is clicked.
    if (creating && data.session === null) {
      setNotice('Account created. Check your email to confirm it, then sign in.');
      setCreating(false);
    }
  };

  return (
    <div className="gate">
      <h1>Nestead</h1>
      <p className="gate-sub">{creating ? 'Create your account' : 'Sign in'}</p>

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

        <label>
          Password
          <input
            type="password"
            value={password}
            autoComplete={creating ? 'new-password' : 'current-password'}
            required
            minLength={6}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error !== null && <p className="error">{error}</p>}
        {notice !== null && <p className="notice">{notice}</p>}

        <button type="submit" disabled={busy || email.trim() === '' || password === ''}>
          {busy ? 'Working…' : creating ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <button
        type="button"
        className="link"
        onClick={() => {
          setCreating(!creating);
          setError(null);
          setNotice(null);
        }}
      >
        {creating ? 'I already have an account' : 'I need an account'}
      </button>
    </div>
  );
}
