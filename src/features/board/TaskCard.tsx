import { useState } from 'react';
import { useSession } from '../../auth/session';
import type { BoardColumn, Task } from '../../domain/types';
import { moveTaskToColumn, reorderTask } from './actions';
import { TASK_ICONS } from './icons';

interface TaskCardProps {
  task: Task;
  columns: BoardColumn[];
  /** Tasks in this task's own column, for up/down moves. */
  siblings: Task[];
  /** Tasks in any column, so a move can append to the destination. */
  tasksInColumn: (columnId: string) => Task[];
}

export function TaskCard({ task, columns, siblings, tasksInColumn }: TaskCardProps): JSX.Element {
  const { store, members } = useSession();
  const [open, setOpen] = useState(false);

  const assignee = members.find((member) => member.id === task.assigneeId);
  const index = siblings.findIndex((row) => row.id === task.id);

  const moveTo = async (columnId: string): Promise<void> => {
    const column = columns.find((row) => row.id === columnId);
    if (column === undefined) return;
    await moveTaskToColumn(store, task, column, tasksInColumn(columnId));
  };

  return (
    <li className={`card ${task.done ? 'card-done' : ''}`}>
      <button
        type="button"
        className="card-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="card-icon" aria-hidden="true">
          {task.icon ?? '•'}
        </span>
        <span className="card-title">{task.title}</span>
        {assignee !== undefined && (
          <span
            className="card-who"
            style={{ background: assignee.color }}
            title={assignee.name}
          >
            {assignee.name.slice(0, 1)}
          </span>
        )}
      </button>

      {open && (
        <div className="card-options">
          <label>
            Column
            <select value={task.columnId} onChange={(event) => void moveTo(event.target.value)}>
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Assigned
            <select
              value={task.assigneeId ?? ''}
              onChange={(event) =>
                void store.tasks.update(task.id, {
                  assigneeId: event.target.value === '' ? undefined : event.target.value,
                })
              }
            >
              <option value="">Nobody</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>

          <div className="icon-picker" role="group" aria-label="Icon">
            {TASK_ICONS.map((icon) => (
              <button
                type="button"
                key={icon}
                className={icon === task.icon ? 'icon-on' : ''}
                aria-pressed={icon === task.icon}
                onClick={() => void store.tasks.update(task.id, { icon })}
              >
                {icon}
              </button>
            ))}
          </div>

          <div className="card-actions">
            <button
              type="button"
              disabled={index <= 0}
              onClick={() => void reorderTask(store, task, siblings, 'up')}
            >
              ↑ Up
            </button>
            <button
              type="button"
              disabled={index >= siblings.length - 1}
              onClick={() => void reorderTask(store, task, siblings, 'down')}
            >
              ↓ Down
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => void store.tasks.remove(task.id)}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
