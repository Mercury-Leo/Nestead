import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useSession } from '../../auth/session';
import { Button, TextField } from '../../components/ui';
import type { ListGroup, ListItem } from '../../domain/types';
import {
  groupOf,
} from '../../domain/kitchen/list';
import { removeListGroup } from '../larder/actions';
import s from './ShoppingList.module.css';
import { plural } from './format';

/** A new section, or renaming or deleting one the family made. */
export function GroupForm({ group, items, onDone }: { group: ListGroup | null; items: readonly ListItem[]; onDone: () => void }): JSX.Element {
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
        label="Section name"
        showLabel
        placeholder="e.g. Chemist, Hardware shop"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      {group !== null && confirmDelete ? (
        <div className={s.danger}>
          <span>
            Delete “{group.name}” for everyone?
            {inIt > 0 && ` Its ${plural(inIt, 'item')} move${inIt === 1 ? 's' : ''} to General.`}
          </span>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
          <Button variant="primary" icon={Trash2} disabled={busy} onClick={() => void run(() => removeListGroup(store, items, group.id))}>
            Delete section
          </Button>
        </div>
      ) : (
        <div className={s.sheetActions}>
          {group !== null && (
            <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
              Delete section
            </Button>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={busy || name.trim() === ''}>
            {group === null ? 'Add section' : 'Save'}
          </Button>
        </div>
      )}
    </form>
  );
}
