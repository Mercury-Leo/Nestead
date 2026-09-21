import { useState } from 'react';
import { useSession } from '../../auth/session';
import { useCollection } from '../../data/useCollection';
import { comparePosition } from '../../domain/position';
import type { Task } from '../../domain/types';
import { endPosition } from './actions';
import { Column } from './Column';

/**
 * The board. Reads everything through useSession() and useCollection(), so it
 * works against whichever backend createStore() built.
 */
export function Board(): JSX.Element {
  const { store } = useSession();
  const columns = useCollection(store.columns);
  const tasks = useCollection(store.tasks);
  const [newColumn, setNewColumn] = useState('');

  const ordered = [...columns].sort(comparePosition);

  const tasksInColumn = (columnId: string): Task[] =>
    tasks.filter((task) => task.columnId === columnId).sort(comparePosition);

  const addColumn = async (): Promise<void> => {
    const name = newColumn.trim();
    if (name === '') return;
    setNewColumn('');
    await store.columns.create({
      name,
      position: endPosition(ordered),
      isDone: false,
    });
  };

  return (
    <div className="board">
      {ordered.map((column) => (
        <Column
          key={column.id}
          column={column}
          columns={ordered}
          tasks={tasksInColumn(column.id)}
          tasksInColumn={tasksInColumn}
        />
      ))}

      <form
        className="column column-new"
        onSubmit={(event) => {
          event.preventDefault();
          void addColumn();
        }}
      >
        <input
          value={newColumn}
          placeholder="New column"
          aria-label="New column name"
          onChange={(event) => setNewColumn(event.target.value)}
        />
        <button type="submit" disabled={newColumn.trim() === ''}>
          Add column
        </button>
      </form>
    </div>
  );
}
