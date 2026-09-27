import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session';
import { useDirection } from '../../hooks/useDirection';
import { formatNumber } from '../../i18n';
import type { BoardColumn, Task } from '../../domain/types';
import { moveColumn } from './actions';
import { TaskCard } from './TaskCard';
import { TaskComposer } from './TaskComposer';

interface ColumnProps {
  column: BoardColumn;
  /** Every column, already sorted, for the arrows. */
  columns: BoardColumn[];
  /** This column's tasks, already sorted. */
  tasks: Task[];
  /** The subset of tasks that pass the board's search and assignee filter. */
  visibleTasks: Task[];
  filtering: boolean;
  /** Narrow screens stack columns and let them fold away. */
  collapsible: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Column({
  column,
  columns,
  tasks,
  visibleTasks,
  filtering,
  collapsible,
  collapsed,
  onToggleCollapsed,
}: ColumnProps): JSX.Element {
  const { t } = useTranslation();
  const { store } = useSession();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);

  const index = columns.findIndex((row) => row.id === column.id);
  const folded = collapsible && collapsed;
  // Side by side, earlier columns are to the left, or to the right in RTL.
  const rtl = useDirection() === 'rtl';
  const toLeft = { label: t('board.column.moveLeft', { name: column.name }), arrow: '◀' };
  const toRight = { label: t('board.column.moveRight', { name: column.name }), arrow: '▶' };
  const earlier = rtl ? toRight : toLeft;
  const later = rtl ? toLeft : toRight;

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
    <section className={`column ${folded ? 'column-folded' : ''}`}>
      <header className="column-head">
        {renaming ? (
          <input
            className="column-rename"
            dir="auto"
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
          <button
            type="button"
            className="column-name"
            aria-expanded={collapsible ? !collapsed : undefined}
            onClick={collapsible ? onToggleCollapsed : () => setRenaming(true)}
          >
            {collapsible && <span className="column-chevron">{collapsed ? later.arrow : '▼'}</span>}
            <bdi>{column.name}</bdi>
            <span className="column-count">
              {filtering
                ? t('board.column.filteredCount', { visible: visibleTasks.length, total: tasks.length })
                : formatNumber(tasks.length)}
            </span>
          </button>
        )}

        <div className="column-tools">
          {collapsible && (
            <button
              type="button"
              aria-label={t('board.column.rename', { name: column.name })}
              onClick={() => setRenaming(true)}
            >
              ✎
            </button>
          )}
          <button
            type="button"
            aria-label={collapsible ? t('board.column.moveUp', { name: column.name }) : earlier.label}
            disabled={index <= 0}
            onClick={() => void moveColumn(store, column, columns, 'up')}
          >
            {collapsible ? '↑' : earlier.arrow}
          </button>
          <button
            type="button"
            aria-label={collapsible ? t('board.column.moveDown', { name: column.name }) : later.label}
            disabled={index >= columns.length - 1}
            onClick={() => void moveColumn(store, column, columns, 'down')}
          >
            {collapsible ? '↓' : later.arrow}
          </button>
          <button
            type="button"
            className="danger"
            aria-label={t('board.column.delete', { name: column.name })}
            title={tasks.length > 0 ? t('board.column.emptyFirst') : t('board.column.deleteTitle')}
            disabled={tasks.length > 0}
            onClick={() => void store.columns.remove(column.id)}
          >
            ✕
          </button>
        </div>
      </header>

      {!folded && (
        <>
          <ul className="cards">
            {visibleTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </ul>

          <TaskComposer column={column} tasks={tasks} />
        </>
      )}
    </section>
  );
}
