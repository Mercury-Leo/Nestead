import { LogOut } from 'lucide-react';
import { useSession } from '../../auth/session';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui';
import { Board } from './Board';

/**
 * The board as a page in the shell. Who you are, signing out and the invite
 * code live here, as they did in the old header: the board is still home.
 */
export function BoardPage(): JSX.Element {
  const { me, members, setMe, signOut, family } = useSession();

  // Nobody to share with yet, so the code is worth putting in front of you.
  const inviteCode = family !== undefined && members.length < 2 ? family.joinCode : null;

  return (
    <div className="app">
      <PageHeader
        title="Board"
        subtitle={family !== undefined ? `Everything ${family.name} has on the go.` : 'Everything the family has on the go.'}
        actions={
          <div className="who">
            {setMe === undefined ? (
              <span className="me-name" style={{ borderColor: me.color }}>
                {me.name}
              </span>
            ) : (
              <label className="me">
                I am
                <select value={me.id} onChange={(event) => setMe(event.target.value)}>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button variant="ghost" icon={LogOut} onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        }
      />

      {inviteCode !== null && (
        <p className="invite">
          You are the only one here. Share this code so someone can join:{' '}
          <code className="code">{inviteCode}</code>
        </p>
      )}

      <Board />
    </div>
  );
}
