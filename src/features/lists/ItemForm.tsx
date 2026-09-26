import { useState } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session';
import { Button, RadioList, TextField } from '../../components/ui';
import type { ListItem, NewRow } from '../../domain/types';
import { catalogItem } from '../../domain/kitchen/catalog';
import { SUPERMARKET, groupOf } from '../../domain/kitchen/list';
import { formatListQtyT } from '../larder/labels';
import { canonicalId, exactCatalogId } from '../../domain/kitchen/normalize';
import s from './ShoppingList.module.css';
import { forLine } from './format';
import type { Group } from './ListRows';

/** Rename, add a note, move to another section, or take off the list. */
export function ItemForm({ item, groups, onDone }: { item: ListItem; groups: Group[]; onDone: () => void }): JSX.Element {
  const { t } = useTranslation();
  const { store } = useSession();
  const [name, setName] = useState(item.name);
  const [note, setNote] = useState(item.note ?? '');
  const [groupId, setGroupId] = useState(groupOf(item));
  const [busy, setBusy] = useState(false);
  const recipes = forLine(item);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    const patch: Partial<NewRow<ListItem>> = { note: note.trim() === '' ? undefined : note.trim(), groupId };
    if (trimmed !== item.name) {
      // A new name is a new thing: look it up again for its aisle.
      const id = groupId === SUPERMARKET ? canonicalId(trimmed) : exactCatalogId(trimmed);
      patch.name = trimmed;
      patch.canonicalId = id;
      patch.section = catalogItem(id)?.section ?? 'Other';
    }
    setBusy(true);
    try {
      await store.listItems.update(item.id, patch);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    try {
      await store.listItems.remove(item.id);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={s.sheetForm} onSubmit={(event) => void save(event)}>
      <TextField label={t('lists.form.name')} showLabel dir="auto" value={name} onChange={(event) => setName(event.target.value)} required />
      <TextField
        label={t('lists.form.note')}
        showLabel
        placeholder={t('lists.form.notePlaceholder')}
        dir="auto"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {recipes !== null && (
        <p className={s.muted}>{t('lists.form.recipes', { qty: formatListQtyT(t, item.parts), recipes })}</p>
      )}
      <div>
        <p className={s.legend} aria-hidden>
          {t('lists.form.section')}
        </p>
        <RadioList label={t('lists.form.section')} value={groupId} onChange={setGroupId} options={groups.map((group) => ({ value: group.id, label: <span dir="auto">{group.name}</span> }))} />
      </div>
      <div className={s.sheetActions}>
        <Button variant="ghost" icon={Trash2} disabled={busy} onClick={() => void remove()}>
          {t('common.remove')}
        </Button>
        <Button type="submit" variant="primary" size="lg" disabled={busy || name.trim() === ''}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
