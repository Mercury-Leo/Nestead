import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { useSession } from '../../auth/session';
import { PageHeader } from '../../components/PageHeader';
import { Button, ButtonLink, SignOutIcon } from '../../components/ui';
import { Board } from './Board';

/**
 * The board as a page in the shell. Who you are, signing out and the way to
 * the family page live here, as they did in the old header: the board is still
 * home.
 */
export function BoardPage(): JSX.Element {
  const { t } = useTranslation();
  const { me, members, setMe, signOut, family } = useSession();

  // Nobody to share with yet, so the code is worth putting in front of you.
  const inviteCode = family !== undefined && members.length < 2 ? family.joinCode : null;

  return (
    <div className="app">
      <PageHeader
        title={t('board.title')}
        subtitle={family !== undefined ? <Trans i18nKey="board.subtitleFamily" values={{ family: family.name }} /> : t('board.subtitle')}
        actions={
          <div className="who">
            {setMe === undefined ? (
              <span className="me-name" dir="auto" style={{ borderColor: me.color }}>
                {me.name}
              </span>
            ) : (
              <label className="me">
                {t('board.iAm')}
                <select value={me.id} onChange={(event) => setMe(event.target.value)}>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ButtonLink variant="ghost" icon={Users} to="/family">
              {t('board.family')}
            </ButtonLink>
            <Button variant="ghost" icon={SignOutIcon} onClick={() => void signOut()}>
              {t('common.signOut')}
            </Button>
          </div>
        }
      />

      {inviteCode !== null && (
        <p className="invite">
          <Trans
            i18nKey="board.invite"
            values={{ code: inviteCode }}
            components={{ code: <code className="code" />, link: <Link to="/family" /> }}
          />
        </p>
      )}

      <Board />
    </div>
  );
}
