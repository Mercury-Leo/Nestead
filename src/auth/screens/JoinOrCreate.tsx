import { useState } from 'react';
import { getSupabaseClient } from '../../data/supabase/supabaseClient';

/**
 * Shown to somebody signed in who is not in a family yet.
 *
 * Both paths are database functions rather than client queries, because RLS
 * makes them impossible from here: you cannot insert a family whose policy
 * requires you to be in it, and you cannot look one up by a code the policy is
 * hiding from you.
 */
export function JoinOrCreate({
  onJoined,
  onSignOut,
}: {
  onJoined: () => void;
  onSignOut: () => Promise<void>;
}): JSX.Element {
  const client = getSupabaseClient();

  const [joining, setJoining] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);

    const { error: failed } = joining
      ? await client.rpc('join_family', {
          code: code.trim().toUpperCase(),
          display_name: displayName.trim(),
        })
      : await client.rpc('create_family', {
          family_name: familyName.trim(),
          display_name: displayName.trim(),
        });

    setBusy(false);

    if (failed !== null) {
      setError(failed.message);
      return;
    }
    onJoined();
  };

  const ready =
    displayName.trim() !== '' && (joining ? code.trim() !== '' : familyName.trim() !== '');

  return (
    <div className="gate">
      <h1>Nestead</h1>
      <p className="gate-sub">{joining ? 'Join a family' : 'Set up your family'}</p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          Your name
          <input
            value={displayName}
            placeholder="Alex"
            required
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>

        {joining ? (
          <label>
            Join code
            <input
              value={code}
              placeholder="ABCD2345"
              className="code-input"
              required
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </label>
        ) : (
          <label>
            Family name
            <input
              value={familyName}
              placeholder="Our place"
              required
              onChange={(event) => setFamilyName(event.target.value)}
            />
          </label>
        )}

        {error !== null && <p className="error">{error}</p>}

        <button type="submit" disabled={busy || !ready}>
          {busy ? 'Working…' : joining ? 'Join' : 'Create'}
        </button>
      </form>

      <button
        type="button"
        className="link"
        onClick={() => {
          setJoining(!joining);
          setError(null);
        }}
      >
        {joining ? 'Start a new family instead' : 'I have a join code'}
      </button>

      <button type="button" className="link quiet" onClick={() => void onSignOut()}>
        Sign out
      </button>
    </div>
  );
}
