import { useState } from 'react';
import { getSupabaseClient } from '../../data/supabase/supabaseClient';

/**
 * Shown after following a password reset email. The link has already signed
 * the person in, so all that is left is choosing the new password.
 */
export function SetNewPassword({
  onDone,
  onSignOut,
}: {
  onDone: () => void;
  onSignOut: () => Promise<void>;
}): JSX.Element {
  const client = getSupabaseClient();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);

    const { error: failed } = await client.auth.updateUser({ password });

    setBusy(false);

    if (failed !== null) {
      setError(failed.message);
      return;
    }
    onDone();
  };

  return (
    <div className="gate">
      <h1>Nestead</h1>
      <p className="gate-sub">Choose a new password</p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          New password
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            required
            minLength={6}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label>
          Confirm new password
          <input
            type="password"
            value={confirm}
            autoComplete="new-password"
            required
            minLength={6}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>

        {error !== null && <p className="error">{error}</p>}

        <button type="submit" disabled={busy || password === '' || confirm === ''}>
          {busy ? 'Working…' : 'Save password'}
        </button>
      </form>

      <button type="button" className="link quiet" onClick={() => void onSignOut()}>
        Cancel and sign out
      </button>
    </div>
  );
}
