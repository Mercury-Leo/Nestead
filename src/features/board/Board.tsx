import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session';
import { useIsNarrow } from '../../hooks/useIsNarrow';
import { readPreference, writePreference } from '../../data/local/localStore';
import { useCollection } from '../../data/useCollection';
import { comparePosition } from '../../domain/position';
import type { Task } from '../../domain/types';
import { autoClear, endPosition, placeTask, reviveRecurring } from './actions';
import { Column } from './Column';
import { dropPosition, type DropTarget } from './dragDrop';
import { TaskDragContext, useTaskDrag, type Box } from './useTaskDrag';
import { toIsoDate } from './recurrence';
import {
  NO_FILTER,
  UNASSIGNED,
  isFiltering,
  matchesFilter,
  parseFilter,
  withKnownAssignee,
  type TaskFilter,
} from './filter';

/**
 * The board. Reads everything through useSession() and useCollection(), so it
 * works against whichever backend the session opened.
 *
 * Wide screens get columns side by side. Phone screens stack them into
 * collapsible sections instead: a horizontally scrolling board shows one column
 * at a time and gives you no idea what the others hold, whereas stacked headers
 * always show every column and its count.
 */
export function Board({ highlightId }: { highlightId?: string } = {}): JSX.Element {
  const { t } = useTranslation();
  const { store, members, me } = useSession();
  const columns = useCollection(store.columns);
  const tasks = useCollection(store.tasks);
  const narrow = useIsNarrow();

  const [newColumn, setNewColumn] = useState('');
  // Remembered per family in this browser, so a reload keeps you where you were.
  const [savedFilter, setFilter] = useState<TaskFilter>(() =>
    parseFilter(readPreference(store.familyId, 'boardFilter')),
  );
  useEffect(() => {
    writePreference(store.familyId, 'boardFilter', savedFilter);
  }, [store.familyId, savedFilter]);
  // Until members load, trust the saved assignee rather than flashing Everyone.
  const filter =
    members.length === 0
      ? savedFilter
      : withKnownAssignee(savedFilter, members.map((member) => member.id));
  const filtering = isFiltering(filter);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  // Repeating tasks whose return date has come round are unticked, and done
  // one-offs over a week old are cleared, when the app is opened: there is no
  // server to do either while nobody is looking. The ref stops a second pass
  // running while the first one's writes are still landing: both, even when
  // one fails, and a failure is only reported, since the next open tries again.
  const tidying = useRef(false);
  useEffect(() => {
    if (tidying.current || tasks.length === 0) return;
    tidying.current = true;
    void Promise.allSettled([reviveRecurring(store, tasks), autoClear(store, tasks)]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') console.warn('Could not tidy the board:', result.reason);
      }
      tidying.current = false;
    });
  }, [store, tasks]);

  const ordered = [...columns].sort(comparePosition);

  const tasksInColumn = (columnId: string): Task[] =>
    tasks.filter((task) => task.columnId === columnId).sort(comparePosition);

  const visibleInColumn = (columnId: string): Task[] =>
    tasksInColumn(columnId).filter((task) => matchesFilter(task, filter));

  const toggle = (columnId: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  };

  const dropTask = async (task: Task, target: DropTarget): Promise<void> => {
    const column = ordered.find((row) => row.id === target.columnId);
    if (column === undefined) return;
    const position = dropPosition(tasksInColumn(column.id), task, target.beforeId);
    if (position === null) return;
    await placeTask(store, task, column, position);
  };

  const boardRef = useRef<HTMLDivElement>(null);
  const { drag, startDrag } = useTaskDrag(boardRef, (task, target) => void dropTask(task, target));
  // The same object for the whole drag, so a pointer move re-renders no card
  // (TaskCard is memoised; the card being dragged learns it from a prop).
  const dragContext = useMemo(() => ({ startDrag }), [startDrag]);
  // Cards work out "overdue" from this, so a new day still reaches them.
  const today = toIsoDate(new Date());
  // Picked up and held over its own place, the card would not move: no line.
  const dropMoves =
    drag?.target != null &&
    dropPosition(tasksInColumn(drag.target.columnId), drag.task, drag.target.beforeId) !== null;

  const addColumn = async (): Promise<void> => {
    const name = newColumn.trim();
    if (name === '') return;
    setNewColumn('');
    await store.columns.create({
      name,
      position: endPosition(ordered),
    });
  };

  return (
    <TaskDragContext.Provider value={dragContext}>
      <div className="board-filter" role="search">
        <input
          type="search"
          dir="auto"
          value={filter.query}
          placeholder={t('board.filter.search')}
          aria-label={t('board.filter.search')}
          onChange={(event) => setFilter({ ...filter, query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setFilter({ ...filter, query: '' });
          }}
        />
        <button
          type="button"
          className="filter-mine"
          aria-pressed={filter.assignee === me.id}
          onClick={() =>
            setFilter({ ...filter, assignee: filter.assignee === me.id ? '' : me.id })
          }
        >
          {t('board.filter.mine')}
        </button>
        <select
          value={filter.assignee}
          aria-label={t('board.filter.assignee')}
          onChange={(event) => setFilter({ ...filter, assignee: event.target.value })}
        >
          <option value="">{t('board.filter.everyone')}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
          <option value={UNASSIGNED}>{t('board.filter.unassigned')}</option>
        </select>
        {filtering && (
          <button type="button" className="link quiet" onClick={() => setFilter(NO_FILTER)}>
            {t('board.filter.clear')}
          </button>
        )}
      </div>

      <div ref={boardRef} className={`board ${narrow ? 'board-stacked' : ''}`}>
        {ordered.map((column) => (
          // display: contents, so the columns still lay out as children of the board.
          <div key={column.id} className="drop-column" data-drop-column={column.id}>
            <Column
              column={column}
              columns={ordered}
              tasks={tasksInColumn(column.id)}
              visibleTasks={visibleInColumn(column.id)}
              today={today}
              draggingId={drag?.task.id}
              filtering={filtering}
              collapsible={narrow}
              // A search should show its hits, so folded columns open while filtering.
              collapsed={!filtering && collapsed.has(column.id)}
              onToggleCollapsed={() => toggle(column.id)}
              highlightId={highlightId}
            />
          </div>
        ))}

        <form
          className="column column-new"
          onSubmit={(event) => {
            event.preventDefault();
            void addColumn();
          }}
        >
          <input
            dir="auto"
            value={newColumn}
            placeholder={t('board.newColumn.placeholder')}
            aria-label={t('board.newColumn.label')}
            onChange={(event) => setNewColumn(event.target.value)}
          />
          <button type="submit" disabled={newColumn.trim() === ''}>
            {t('board.newColumn.add')}
          </button>
        </form>
      </div>

      {drag !== null &&
        // On <body>, so nothing on the page can clip or offset it.
        createPortal(
          <div className="drag-layer" aria-hidden="true">
            {drag.column !== null && <div className="drag-column" style={place(drag.column)} />}
            {dropMoves && drag.line !== null && <div className="drag-line" style={place(drag.line)} />}
            <div className="card drag-ghost" style={place(drag.ghost)}>
              <div className="card-head">
                <span className="card-toggle">
                  <span className="card-icon">{drag.task.icon ?? '•'}</span>
                  <span className="card-title" dir="auto">
                    {drag.task.title}
                  </span>
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </TaskDragContext.Provider>
  );
}

function place(box: Box): CSSProperties {
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}
