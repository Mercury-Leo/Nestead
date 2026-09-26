import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session';
import { Button, TextField } from '../../components/ui';
import type { ListGroup, ListItem } from '../../domain/types';
import {
  GENERAL,
  groupOf,
} from '../../domain/kitchen/list';
import { removeListGroup } from '../larder/actions';
import { groupName } from '../larder/labels';
import s from './ShoppingList.module.css';

/** A new section, or renaming or deleting one the family made. */
export function GroupForm({ group, items, onDone }: { group: ListGroup | null; items: readonly ListItem[]; onDone: () => void }): JSX.Element {
  const { t } = useTranslation();
  const { store } = useSession();
  const [name, setName] = useState(group?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const inIt = group === null ? 0 : items.filter((item) => groupOf(item) === group.id).length;

  // The sheet focuses its first control (Close) as it opens, after autoFocus
  // would have run, so the name field takes focus a frame later.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const run = async (write: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await write();
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    void run(() => (group === null ? store.listGroups.create({ name: trimmed }) : store.listGroups.update(group.id, { name: trimmed })));
  };

  return (
    <form className={s.sheetForm} onSubmit={save}>
      <TextField
        ref={input}
        label={t('lists.group.name')}
        showLabel
        placeholder={t('lists.group.placeholder')}
        dir="auto"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      {group !== null && confirmDelete ? (
        <div className={s.danger}>
          <span>
            {inIt > 0 ? (
              <Trans
                i18nKey="lists.group.deleteQuestionMoves"
                count={inIt}
                values={{ name: group.name, general: groupName(t, { id: GENERAL, name: '' }) }}
              />
            ) : (
              <Trans i18nKey="lists.group.deleteQuestion" values={{ name: group.name }} />
            )}
          </span>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            {t('common.keepIt')}
          </Button>
          <Button variant="primary" icon={Trash2} disabled={busy} onClick={() => void run(() => removeListGroup(store, items, group.id))}>
            {t('lists.group.delete')}
          </Button>
        </div>
      ) : (
        <div className={s.sheetActions}>
          {group !== null && (
            <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
              {t('lists.group.delete')}
            </Button>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={busy || name.trim() === ''}>
            {group === null ? t('lists.group.add') : t('common.save')}
          </Button>
        </div>
      )}
    </form>
  );
}
