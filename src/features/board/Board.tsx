import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/session';
import { useIsNarrow } from '../../components/useIsNarrow';
import { useCollection } from '../../data/useCollection';
import { comparePosition } from '../../domain/position';
import type { Task } from '../../domain/types';
import { endPosition } from './actions';
import { Column } from './Column';

/**
 * The board. Reads everything through useSession() and useCollection(), so it
 * works against whichever backend createStore() built.
 *
 * Wide screens get columns side by side. Phone screens stack them into
 * collapsible sections instead: a horizontally scrolling board shows one column
 * at a time and gives you no idea what the others hold, whereas stacked headers
 * always show every column and its count.
 */
export function Board(): JSX.Element {
  const { store } = useSession();
  const columns = useCollection(store.columns);
  const tasks = useCollection(store.tasks);
  const narrow = useIsNarrow();

  const [newColumn, setNewColumn] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  // Done columns start folded: usually the longest and the least interesting.
  // Runs once, when the columns first arrive.
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || columns.length === 0) return;
    defaulted.current = true;
    setCollapsed(new Set(columns.filter((column) => column.isDone).map((column) => column.id)));
  }, [columns]);

  const ordered = [...columns].sort(comparePosition);

  const tasksInColumn = (columnId: string): Task[] =>
    tasks.filter((task) => task.columnId === columnId).sort(comparePosition);

  const toggle = (columnId: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  };

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
    <div className={`board ${narrow ? 'board-stacked' : ''}`}>
      {ordered.map((column) => (
        <Column
          key={column.id}
          column={column}
          columns={ordered}
          tasks={tasksInColumn(column.id)}
          tasksInColumn={tasksInColumn}
          collapsible={narrow}
          collapsed={collapsed.has(column.id)}
          onToggleCollapsed={() => toggle(column.id)}
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
