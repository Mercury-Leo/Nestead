import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { History as HistoryIcon, RotateCcw } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { LoadFailed } from '../../../components/LoadFailed';
import { PageHeader } from '../../../components/PageHeader';
import { Button, EmptyState } from '../../../components/ui';
import { retryCollections, useCollectionState } from '../../../data/useCollection';
import { comparePosition } from '../../../domain/position';
import type { TaskCompletion } from '../../../domain/types';
import { formatDate } from '../../../i18n';
import { restoreTask } from '../actions';
import { groupByDay } from './groupByDay';
import s from './HistoryPage.module.css';

/**
 * Every tick, newest first, by day, with who did it. Restore puts a task back
 * on the board as a to-do and keeps the entry ("do it again"); a mistaken tick
 * is undone by unticking on the board instead. The board never reads this
 * collection, so it does not slow down as history grows.
 */
export function HistoryPage(): JSX.Element {
  const { t } = useTranslation();
  const { store, me, members } = useSession();
  const navigate = useNavigate();
  const history = useCollectionState(store.taskCompletions);
  const { rows: tasks, loaded: tasksLoaded, failed: tasksFailed } = useCollectionState(store.tasks);
  const { rows: columns, loaded: columnsLoaded, failed: columnsFailed } = useCollectionState(store.columns);
  const [who, setWho] = useState('');

  // Restore decides from the board's tasks and columns: with either unread it
  // would put a task back that is already there, so they must have arrived too.
  if ((history.failed && !history.loaded) || (tasksFailed && !tasksLoaded) || (columnsFailed && !columnsLoaded)) {
    return <LoadFailed onRetry={() => retryCollections(store.taskCompletions, store.tasks, store.columns)} />;
  }
  const loaded = history.loaded && tasksLoaded && columnsLoaded;

  const shown = history.rows.filter((entry) => who === '' || entry.memberId === who);
  const groups = groupByDay(shown, new Date());
  const nameOf = (memberId: string | undefined): string =>
    members.find((member) => member.id === memberId)?.name ?? t('board.history.someone');
  const onBoard = (entry: TaskCompletion): boolean => tasks.some((task) => task.id === entry.taskId && !task.done);

  const restore = async (entry: TaskCompletion): Promise<void> => {
    const result = await restoreTask(store, entry, {
      tasks,
      columns: [...columns].sort(comparePosition),
      entries: history.rows,
      memberId: me.id,
    });
    if (result === null) return;
    navigate('/', { state: { restored: { taskId: result.taskId, title: entry.title, column: result.column.name } } });
  };

  return (
    <div className={s.page}>
      <PageHeader
        title={t('board.history.title')}
        actions={
          <select className={s.who} value={who} aria-label={t('board.history.doneBy')} onChange={(event) => setWho(event.target.value)}>
            <option value="">{t('board.history.everyone')}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        }
      />

      {!loaded ? (
        <p className="centred">{t('common.loading')}</p>
      ) : groups.length === 0 ? (
        <EmptyState icon={HistoryIcon} title={t('board.history.emptyTitle')}>
          {t('board.history.emptyBody')}
        </EmptyState>
      ) : (
        groups.map((group) => (
          <section key={group.day} className={s.day} aria-labelledby={`history-${group.day}`}>
            <h2 id={`history-${group.day}`} className={s.dayTitle}>
              {group.relative !== undefined
                ? t(`board.history.${group.relative}`)
                : formatDate(group.day, { weekday: 'short', day: 'numeric', month: 'short' })}
            </h2>
            <ul className={s.rows}>
              {group.entries.map((entry) => (
                <li key={entry.id} className={s.row}>
                  <span className={s.icon} aria-hidden="true">
                    {entry.icon ?? '•'}
                  </span>
                  <span className={s.title} dir="auto">
                    {entry.title}
                  </span>
                  <span className={s.by} dir="auto">
                    {nameOf(entry.memberId)}
                  </span>
                  {onBoard(entry) ? (
                    <span className={s.onBoard}>{t('board.history.onBoard')}</span>
                  ) : (
                    <Button
                      variant="ghost"
                      icon={RotateCcw}
                      aria-label={t('board.history.restoreTitle', { title: entry.title })}
                      onClick={() => void restore(entry)}
                    >
                      {t('board.history.restore')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
