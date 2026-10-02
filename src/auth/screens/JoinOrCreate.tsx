import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { Account } from '../../data/types';
import { clearInvite } from '../invite';
import { useInviteFamily } from '../useInviteFamily';

/**
 * Shown to somebody signed in who is not in a family yet.
 *
 * After an invite link, it opens on Join with the code filled in and the
 * family named, so only a name is left to type.
 */
export function JoinOrCreate({
  account,
  inviteCode,
  onJoined,
  onSignOut,
}: {
  account: Account;
  inviteCode: string | null;
  onJoined: () => void;
  onSignOut: () => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();

  const [joining, setJoining] = useState(inviteCode !== null);
  const [displayName, setDisplayName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [code, setCode] = useState(inviteCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invite = useInviteFamily(account, inviteCode);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);

    try {
      if (joining) await account.joinFamily(code.trim().toUpperCase(), displayName.trim());
      else await account.createFamily(familyName.trim(), displayName.trim());
    } catch (failed) {
      setError((failed as Error).message);
      return;
    } finally {
      setBusy(false);
    }
    onJoined();
  };

  const ready =
    displayName.trim() !== '' && (joining ? code.trim() !== '' : familyName.trim() !== '');

  return (
    <div className="gate">
      <h1>Nestead</h1>
      <p className="gate-sub">{joining ? t('auth.join.subtitleJoin') : t('auth.join.subtitleCreate')}</p>
      {joining && inviteCode !== null && code === inviteCode && invite.kind !== 'loading' && (
        <p className="notice">
          {invite.kind === 'found' ? (
            <Trans i18nKey="auth.join.invitedTo" values={{ family: invite.name }} />
          ) : invite.kind === 'unknown' ? (
            t('auth.join.inviteExpired')
          ) : (
            t('auth.join.invited')
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
          {t('auth.join.yourName')}
          <input
            dir="auto"
            value={displayName}
            placeholder={t('auth.join.namePlaceholder')}
            // The code is already in, so the name is all that is left.
            autoFocus={inviteCode !== null}
            required
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>

        {joining ? (
          <label>
            {t('auth.join.joinCode')}
            <input
              dir="ltr"
              value={code}
              // i18n: the shape of a join code, not words.
              placeholder="ABCD2345"
              className="code-input"
              required
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </label>
        ) : (
          <label>
            {t('auth.join.familyName')}
            <input
              dir="auto"
              value={familyName}
              placeholder={t('auth.join.familyPlaceholder')}
              required
              onChange={(event) => setFamilyName(event.target.value)}
            />
          </label>
        )}

        {error !== null && <p className="error">{error}</p>}

        <button type="submit" disabled={busy || !ready}>
          {busy ? t('common.working') : joining ? t('auth.join.join') : t('auth.join.create')}
        </button>
      </form>

      <button
        type="button"
        className="link"
        onClick={() => {
          // Starting a family instead means the invite is not wanted.
          if (joining) clearInvite();
          setJoining(!joining);
          setError(null);
        }}
      >
        {joining ? t('auth.join.switchToCreate') : t('auth.join.switchToJoin')}
      </button>

      <button type="button" className="link quiet" onClick={() => void onSignOut()}>
        {t('common.signOut')}
      </button>
    </div>
  );
}
