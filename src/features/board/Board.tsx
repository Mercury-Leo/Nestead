import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session';
import { useIsNarrow } from '../../hooks/useIsNarrow';
import { readPreference, writePreference } from '../../data/local/localStore';
import { useCollection } from '../../data/useCollection';
import { comparePosition } from '../../domain/position';
import type { Task } from '../../domain/types';
import { endPosition, reviveRecurring } from './actions';
import { Column } from './Column';
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
 * works against whichever backend createStore() built.
 *
 * Wide screens get columns side by side. Phone screens stack them into
 * collapsible sections instead: a horizontally scrolling board shows one column
 * at a time and gives you no idea what the others hold, whereas stacked headers
 * always show every column and its count.
 */
export function Board(): JSX.Element {
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

  // Done columns start folded: usually the longest and the least interesting.
  // Runs once, when the columns first arrive.
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || columns.length === 0) return;
    defaulted.current = true;
    setCollapsed(new Set(columns.filter((column) => column.isDone).map((column) => column.id)));
  }, [columns]);

  // Repeating tasks whose date has come round are brought back when the app is
  // opened, since there is no server to do it while nobody is looking. The ref
  // stops a second pass running while the first one's writes are still landing.
  const reviving = useRef(false);
  useEffect(() => {
    if (reviving.current || tasks.length === 0 || columns.length === 0) return;
    reviving.current = true;
    void reviveRecurring(store, tasks, [...columns].sort(comparePosition)).finally(() => {
      reviving.current = false;
    });
  }, [store, tasks, columns]);

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
    <>
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

      <div className={`board ${narrow ? 'board-stacked' : ''}`}>
        {ordered.map((column) => (
          <Column
            key={column.id}
            column={column}
            columns={ordered}
            tasks={tasksInColumn(column.id)}
            visibleTasks={visibleInColumn(column.id)}
            filtering={filtering}
            tasksInColumn={tasksInColumn}
            collapsible={narrow}
            // A search should show its hits, so folded columns open while filtering.
            collapsed={!filtering && collapsed.has(column.id)}
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
    </>
  );
}
