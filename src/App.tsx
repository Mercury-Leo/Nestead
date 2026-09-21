import { useSession } from './auth/session';
import { Board } from './features/board/Board';

/** The board is the main page. Everything else grows from here. */
export function App(): JSX.Element {
  const { me, members, setMe, signOut, family } = useSession();

  // Nobody to share with yet, so the code is worth putting in front of you.
  const inviteCode = family !== undefined && members.length < 2 ? family.joinCode : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Nestead</h1>

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

          <button type="button" className="link quiet" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {inviteCode !== null && (
        <p className="invite">
          You are the only one here. Share this code so someone can join:{' '}
          <code className="code">{inviteCode}</code>
        </p>
      )}

      <main>
        <Board />
      </main>
    </div>
  );
}
