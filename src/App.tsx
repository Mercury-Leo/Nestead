import { useSession } from './auth/session';
import { Board } from './features/board/Board';

/** The board is the main page. Everything else grows from here. */
export function App(): JSX.Element {
  const { me, members, setMe } = useSession();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Nestead</h1>
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
      </header>

      <main>
        <Board />
      </main>
    </div>
  );
}
