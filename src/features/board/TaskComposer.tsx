import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { useSession } from '../../auth/session';
import type { BoardColumn, Task } from '../../domain/types';
import { endPosition } from './actions';
import { DEFAULT_TASK_ICON } from './icons';
import { REPEAT_OPTIONS, repeats, schedulePatch } from './recurrence';
import { DueDateInput } from './DueDateInput';

interface TaskComposerProps {
  column: BoardColumn;
  /** The column's tasks, already sorted, so a new one goes at the end. */
  tasks: Task[];
}

/**
 * Adds a task to a column. A title is all it asks for; the arrow opens the
 * rest (description, due date, repeat, who it is for) for when it matters.
 */
export function TaskComposer({ column, tasks }: TaskComposerProps): JSX.Element {
  const { t } = useTranslation();
  const { store, me, members } = useSession();
  const [title, setTitle] = useState('');
  const [more, setMore] = useState(false);
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<string>();
  const [repeatKey, setRepeatKey] = useState<string>('never');
  const [assigneeId, setAssigneeId] = useState('');

  const repeat = REPEAT_OPTIONS.find((option) => option.key === repeatKey);
  const repeating = repeat !== undefined && repeats({ recurEveryDays: repeat.days, recurEveryMonths: repeat.months });

  const addTask = async (): Promise<void> => {
    const trimmed = title.trim();
    if (trimmed === '') return;
    const task = {
      title: trimmed,
      icon: DEFAULT_TASK_ICON,
      description: description.trim() === '' ? undefined : description,
      columnId: column.id,
      position: endPosition(tasks),
      assigneeId: assigneeId === '' ? undefined : assigneeId,
      dueDate,
      ...schedulePatch(repeat, dueDate),
      done: column.isDone,
      createdBy: me.id,
    };
    // Back to just the title, ready for the next one.
    setTitle('');
    setDescription('');
    setDueDate(undefined);
    setRepeatKey('never');
    setAssigneeId('');
    setMore(false);
    await store.tasks.create(task);
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        void addTask();
      }}
    >
      <div className="composer-row">
        <input
          dir="auto"
          value={title}
          placeholder={t('board.column.addTask')}
          aria-label={t('board.column.addTaskTo', { name: column.name })}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button
          type="button"
          className="composer-more-toggle"
          aria-expanded={more}
          aria-label={t(more ? 'board.composer.fewer' : 'board.composer.more')}
          title={t(more ? 'board.composer.fewer' : 'board.composer.more')}
          onClick={() => setMore(!more)}
        >
          <ChevronDown size={16} strokeWidth={2.2} aria-hidden className={more ? 'is-open' : ''} />
        </button>
        <button type="submit" disabled={title.trim() === ''} aria-label={t('board.composer.add')}>
          +
        </button>
      </div>

      {more && (
        <div className="composer-more card-options">
          <textarea
            className="card-description"
            aria-label={t('board.card.description')}
            placeholder={t('board.card.descriptionPlaceholder')}
            rows={3}
            dir="auto"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          <label>
            {t('board.card.dueDate')}
            <DueDateInput value={dueDate} onChange={setDueDate} />
          </label>

          <label>
            {t('board.card.repeats')}
            <select value={repeatKey} onChange={(event) => setRepeatKey(event.target.value)}>
              {REPEAT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {t(`board.repeat.${option.key}`)}
                </option>
              ))}
            </select>
          </label>
          {repeating && dueDate === undefined && <p className="card-hint">{t('board.card.repeatNoDate')}</p>}

          <label>
            {t('board.card.assigned')}
            <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              <option value="">{t('board.card.nobody')}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </form>
  );
}
