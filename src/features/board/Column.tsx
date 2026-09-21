import { useState } from 'react';
import { useSession } from '../../auth/session';
import type { BoardColumn, Task } from '../../domain/types';
import { endPosition, moveColumn } from './actions';
import { DEFAULT_TASK_ICON } from './icons';
import { TaskCard } from './TaskCard';

interface ColumnProps {
  column: BoardColumn;
  /** Every column, already sorted, for the move menu and the arrows. */
  columns: BoardColumn[];
  /** This column's tasks, already sorted. */
  tasks: Task[];
  tasksInColumn: (columnId: string) => Task[];
}

export function Column({ column, columns, tasks, tasksInColumn }: ColumnProps): JSX.Element {
  const { store, me } = useSession();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const [title, setTitle] = useState('');

  const index = columns.findIndex((row) => row.id === column.id);

  const addTask = async (): Promise<void> => {
    const trimmed = title.trim();
    if (trimmed === '') return;
    setTitle('');
    await store.tasks.create({
      title: trimmed,
      icon: DEFAULT_TASK_ICON,
      columnId: column.id,
      position: endPosition(tasks),
      done: column.isDone,
      createdBy: me.id,
    });
  };

  const rename = async (): Promise<void> => {
    const trimmed = name.trim();
    setRenaming(false);
    if (trimmed === '' || trimmed === column.name) {
      setName(column.name);
      return;
    }
    await store.columns.update(column.id, { name: trimmed });
  };

  return (
    <section className="column">
      <header className="column-head">
        {renaming ? (
          <input
            className="column-rename"
            value={name}
            autoFocus
            onFocus={(event) => event.target.select()}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void rename();
              if (event.key === 'Escape') {
                setName(column.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <button type="button" className="column-name" onClick={() => setRenaming(true)}>
            {column.name}
            <span className="column-count">{tasks.length}</span>
          </button>
        )}

        <div className="column-tools">
          <button
            type="button"
            aria-label={`Move ${column.name} left`}
            disabled={index <= 0}
            onClick={() => void moveColumn(store, column, columns, 'up')}
          >
            ◀
          </button>
          <button
            type="button"
            aria-label={`Move ${column.name} right`}
            disabled={index >= columns.length - 1}
            onClick={() => void moveColumn(store, column, columns, 'down')}
          >
            ▶
          </button>
          <button
            type="button"
            className="danger"
            aria-label={`Delete ${column.name}`}
            title={tasks.length > 0 ? 'Empty this column first' : 'Delete this column'}
            disabled={tasks.length > 0}
            onClick={() => void store.columns.remove(column.id)}
          >
            ✕
          </button>
        </div>
      </header>

      <ul className="cards">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            columns={columns}
            siblings={tasks}
            tasksInColumn={tasksInColumn}
          />
        ))}
      </ul>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void addTask();
        }}
      >
        <input
          value={title}
          placeholder="Add a task"
          aria-label={`Add a task to ${column.name}`}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" disabled={title.trim() === ''}>
          +
        </button>
      </form>
    </section>
  );
}
