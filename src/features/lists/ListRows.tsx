import { useState } from 'react';
import type { FormEvent } from 'react';
import { Ellipsis, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, IconButton, TextField, cx } from '../../components/ui';
import type { ListGroup, ListItem } from '../../domain/types';
import { SUPERMARKET } from '../../domain/kitchen/list';
import { formatListQtyT } from '../larder/labels';
import s from './ShoppingList.module.css';
import { forLine } from './format';

export interface Group {
  id: string;
  name: string;
  /** A ListGroup row, so it can be renamed and deleted. */
  row?: ListGroup;
}

export function ItemRow({
  item,
  justAdded,
  onToggle,
  onEdit,
}: {
  item: ListItem;
  justAdded: boolean;
  onToggle: (value: boolean) => void;
  onEdit: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const detail = [forLine(item), item.note].filter((part) => part !== null && part !== undefined && part !== '').join(' · ');
  return (
    <li className={cx(s.row, item.checked && s.rowChecked, justAdded && s.rowJustAdded)} data-just-added={justAdded || undefined}>
      <Checkbox size={26} checked={item.checked} onChange={onToggle} className={s.rowCheck}>
        <span className={s.rowText}>
          <span className={s.rowName} dir="auto">
            {item.name}
          </span>
          {detail !== '' && (
            <span className={s.rowFor} dir="auto">
              {detail}
            </span>
          )}
        </span>
      </Checkbox>
      <span className={cx(s.rowQty, 'tabular')} dir="auto">
        {formatListQtyT(t, item.parts)}
      </span>
      <IconButton label={t('lists.editItem', { name: item.name })} icon={Ellipsis} className={s.rowEdit} onClick={onEdit} />
    </li>
  );
}

/** Type and press Enter; commas add several at once. */
export function AddItem({ group, onAdd }: { group: Group; onAdd: (names: string[]) => void }): JSX.Element {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const names = text.split(',').map((name) => name.trim()).filter((name) => name !== '');
    if (names.length > 0) onAdd(names);
    setText('');
  };
  return (
    <form className={s.addItem} onSubmit={submit}>
      <TextField
        label={t('lists.addTo', { name: group.name })}
        icon={Plus}
        placeholder={group.id === SUPERMARKET ? t('lists.groceriesPlaceholder') : t('lists.addTo', { name: group.name })}
        dir="auto"
        value={text}
        onChange={(event) => setText(event.target.value)}
        wrapClassName={s.addField}
        enterKeyHint="done"
      />
      {text.trim() !== '' && (
        <Button type="submit" variant="secondary" size="lg">
          {t('common.add')}
        </Button>
      )}
    </form>
  );
}
