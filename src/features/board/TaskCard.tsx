import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session';
import type { BoardColumn, Task } from '../../domain/types';
import { formatDate } from '../../i18n';
import { moveTaskToColumn, reorderTask } from './actions';
import { TASK_ICONS } from './icons';
import { REPEAT_OPTIONS, isOverdue } from './recurrence';

interface TaskCardProps {
  task: Task;
  columns: BoardColumn[];
  /** Tasks in this task's own column, for up/down moves. */
  siblings: Task[];
  /** Tasks in any column, so a move can append to the destination. */
  tasksInColumn: (columnId: string) => Task[];
  /** This person just added the task, so it starts open. */
  justCreated?: boolean;
}

export function TaskCard({
  task,
  columns,
  siblings,
  tasksInColumn,
  justCreated = false,
}: TaskCardProps): JSX.Element {
  const { t } = useTranslation();
  const { store, members } = useSession();
  const [open, setOpen] = useState(justCreated);

  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  // Focus once, on creation. Reopening the card later should not steal focus.
  const focusPending = useRef(false);

  // The card can mount before create() resolves, so react to the flag arriving
  // rather than reading it only once.
  useEffect(() => {
    if (!justCreated) return;
    focusPending.current = true;
    setOpen(true);
  }, [justCreated]);

  // Separate from the effect above: the textarea exists only once open renders.
  useEffect(() => {
    if (!open || !focusPending.current) return;
    focusPending.current = false;
    descriptionRef.current?.focus();
  }, [open]);
  // Edited locally and saved on blur, so typing does not write every keystroke.
  const [description, setDescription] = useState(task.description ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const saveDescription = (): void => {
    const next = description.trim() === '' ? undefined : description;
    if (next === task.description) return;
    void store.tasks.update(task.id, { description: next });
  };

  const assignee = members.find((member) => member.id === task.assigneeId);
  const index = siblings.findIndex((row) => row.id === task.id);
  const overdue = isOverdue(task, new Date());
  const repeat = REPEAT_OPTIONS.find((option) => option.days === task.recurEveryDays);

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
        onClick={() => {
          if (!open) setDescription(task.description ?? '');
          setConfirmingDelete(false);
          setOpen(!open);
        }}
      >
        <span className="card-icon" aria-hidden="true">
          {task.icon ?? '•'}
        </span>
        <span className="card-title" dir="auto">
          {task.title}
          {task.recurEveryDays !== undefined && (
            <span className="card-repeat" title={repeat !== undefined ? t(`board.repeat.${repeat.key}`) : t('board.card.repeats')}>
              ⟳
            </span>
          )}
          {overdue && <span className="card-overdue">{t('board.card.overdue')}</span>}
        </span>
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
          <textarea
            ref={descriptionRef}
            className="card-description"
            aria-label={t('board.card.description')}
            placeholder={t('board.card.descriptionPlaceholder')}
            rows={3}
            dir="auto"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={saveDescription}
          />

          <label>
            {t('board.card.column')}
            <select value={task.columnId} onChange={(event) => void moveTo(event.target.value)}>
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('board.card.assigned')}
            <select
              value={task.assigneeId ?? ''}
              onChange={(event) =>
                void store.tasks.update(task.id, {
                  assigneeId: event.target.value === '' ? undefined : event.target.value,
                })
              }
            >
              <option value="">{t('board.card.nobody')}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('board.card.repeats')}
            <select
              value={task.recurEveryDays ?? ''}
              onChange={(event) => {
                const days = event.target.value === '' ? undefined : Number(event.target.value);
                void store.tasks.update(task.id, { recurEveryDays: days });
              }}
            >
              {REPEAT_OPTIONS.map((option) => (
                <option key={option.key} value={option.days ?? ''}>
                  {t(`board.repeat.${option.key}`)}
                </option>
              ))}
            </select>
          </label>

          {task.dueDate !== undefined && (
            <p className={`card-due ${overdue ? 'is-overdue' : ''}`}>
              {t(task.done ? 'board.card.comesBack' : 'board.card.due', { date: formatDate(task.dueDate) })}
            </p>
          )}

          <div className="icon-picker" role="group" aria-label={t('board.card.icon')}>
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

          {confirmingDelete ? (
            <div className="card-actions card-confirm" role="group" aria-label={t('board.card.confirmDelete')}>
              <span>{t('board.card.deleteQuestion')}</span>
              <button type="button" autoFocus onClick={() => setConfirmingDelete(false)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="danger danger-solid"
                onClick={() => void store.tasks.remove(task.id)}
              >
                {t('common.delete')}
              </button>
            </div>
          ) : (
            <div className="card-actions">
              <button
                type="button"
                disabled={index <= 0}
                onClick={() => void reorderTask(store, task, siblings, 'up')}
              >
                {t('board.card.up')}
              </button>
              <button
                type="button"
                disabled={index >= siblings.length - 1}
                onClick={() => void reorderTask(store, task, siblings, 'down')}
              >
                {t('board.card.down')}
              </button>
              <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
                {t('common.delete')}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
