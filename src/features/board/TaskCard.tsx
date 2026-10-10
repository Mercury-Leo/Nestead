import { memo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session';
import type { Task } from '../../domain/types';
import { formatDate } from '../../i18n';
import { completeTask, reopenTask } from './actions';
import { TASK_ICONS } from './icons';
import { DueDateInput } from './DueDateInput';
import { REPEAT_OPTIONS, fromIsoDate, isOverdue, repeatOf, repeats, returnDate, schedulePatch } from './recurrence';
import { useTaskDragContext } from './useTaskDrag';

/**
 * Moving a task, within its column or to another, is done by dragging it;
 * finishing it, by the tick on its emoji.
 *
 * Memoised: the board re-renders on every pointer move of a drag, and a card
 * only has to when its task, the day or whether it is the one being dragged
 * changes. Everything it shows comes from those props and its contexts.
 */
export const TaskCard = memo(function TaskCard({
  task,
  today,
  dragging,
  highlight = false,
}: {
  task: Task;
  today: string;
  dragging: boolean;
  highlight?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const { store, members, me } = useSession();
  const { startDrag } = useTaskDragContext();
  const [open, setOpen] = useState(false);
  // Edited locally and saved on blur, so typing does not write every keystroke.
  const [description, setDescription] = useState(task.description ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // A tick or untick on its way. The tick writes the history entry first and
  // the card changes only once it lands, so on a slow backend a second press
  // would tick again and leave an entry nothing points at. The ref is the
  // guard, since two presses can land before a render; the state shows it.
  const ticking = useRef(false);
  const [busy, setBusy] = useState(false);

  const toggleDone = async (): Promise<void> => {
    if (ticking.current) return;
    ticking.current = true;
    setBusy(true);
    try {
      await (task.done ? reopenTask(store, task) : completeTask(store, task, me.id));
    } catch {
      // A failed write is undone by the cache, as everywhere else; the tick comes back to try again.
    } finally {
      ticking.current = false;
      setBusy(false);
    }
  };

  const saveDescription = (): void => {
    const next = description.trim() === '' ? undefined : description;
    if (next === task.description) return;
    void store.tasks.update(task.id, { description: next });
  };

  const assignee = members.find((member) => member.id === task.assigneeId);
  const overdue = isOverdue(task, fromIsoDate(today));
  const repeating = repeats(task);
  const repeat = repeatOf(task);

  const setDueDate = (dueDate: string | undefined): void => {
    // A new due date is a new day for the schedule to count from.
    void store.tasks.update(task.id, { dueDate, recurFrom: repeating ? dueDate : undefined });
  };

  return (
    <li
      className={`card ${task.done ? 'card-done' : ''} ${dragging ? 'card-dragging' : ''} ${highlight ? 'card-highlight' : ''}`}
      // Only open cards are drop targets, so a drop never lands among the Done fold.
      data-task-id={task.done ? undefined : task.id}
    >
      <div className="card-head">
        {/* The tick: the emoji with a small circle in its corner. Outside the
            toggle, since a control can't sit in a button, and it never starts
            a drag. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={task.done}
          aria-busy={busy ? true : undefined}
          aria-label={t('board.card.done', { title: task.title })}
          className={`card-tick ${task.done ? 'card-tick-on' : ''}`}
          onClick={() => void toggleDone()}
        >
          {task.icon !== undefined && (
            <span className="card-icon" aria-hidden="true">
              {task.icon}
            </span>
          )}
          <span className={task.icon !== undefined ? 'card-tick-badge' : 'card-tick-plain'} aria-hidden="true">
            {task.done && <Check size={10} strokeWidth={3.5} />}
          </span>
        </button>

        <button
          type="button"
          className="card-toggle"
          aria-expanded={open}
          onPointerDown={(event) => {
            if (!task.done) startDrag(event, task);
          }}
          onClick={() => {
            if (!open) setDescription(task.description ?? '');
            setConfirmingDelete(false);
            setOpen(!open);
          }}
        >
          <span className="card-title" dir="auto">
            {task.title}
            {repeating && (
              <span className="card-repeat" title={repeat !== undefined ? t(`board.repeat.${repeat.key}`) : t('board.card.repeats')}>
                ⟳
              </span>
            )}
            {overdue && <span className="card-overdue">{t('board.card.overdue')}</span>}
            {!overdue && !task.done && task.dueDate !== undefined && (
              <span className="card-date">{formatDate(task.dueDate, { day: 'numeric', month: 'short' })}</span>
            )}
            {task.done && returnDate(task) !== undefined && (
              <span className="card-date">
                {t('board.card.comesBack', { date: formatDate(returnDate(task) as string, { weekday: 'short', day: 'numeric', month: 'short' }) })}
              </span>
            )}
          </span>
        </button>

        {/* A native select laid over the avatar: clicking the circle opens the
            member list, and keyboards, screen readers and phones get their own
            picker for free. Outside the toggle, since a control can't sit in a
            button. */}
        <span
          className={`card-who ${assignee === undefined ? 'card-who-empty' : ''}`}
          style={assignee !== undefined ? { background: assignee.color } : undefined}
          title={assignee?.name ?? t('board.card.nobody')}
        >
          <span aria-hidden="true">{assignee?.name.slice(0, 1)}</span>
          <select
            aria-label={t('board.card.assigned')}
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
        </span>
      </div>

      {open && (
        <div className="card-options">
          <textarea
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
            {t('board.card.dueDate')}
            <DueDateInput value={task.dueDate} onChange={setDueDate} />
          </label>

          <label>
            {t('board.card.repeats')}
            <select
              value={repeat?.key ?? 'never'}
              onChange={(event) => {
                const option = REPEAT_OPTIONS.find((row) => row.key === event.target.value);
                void store.tasks.update(task.id, schedulePatch(option, task.dueDate));
              }}
            >
              {REPEAT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {t(`board.repeat.${option.key}`)}
                </option>
              ))}
            </select>
          </label>
          {repeating && task.dueDate === undefined && <p className="card-hint">{t('board.card.repeatNoDate')}</p>}

          {task.done && returnDate(task) !== undefined && (
            <p className="card-due">{t('board.card.comesBack', { date: formatDate(returnDate(task) as string) })}</p>
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
              <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
                {t('common.delete')}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
});
