import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { Button, Sheet } from '../../../components/ui';
import type { PantryItem } from '../../../domain/types';
import { keyForText } from '../../../domain/kitchen/fit';
import { canonicalId } from '../../../domain/kitchen/normalize';
import { addToPantry } from '../actions';
import { pantryRow } from '../../../domain/kitchen/pantry';
import { pantryKeys } from './PantryAdd';
import { sectionLabel } from '../labels';
import s from './Pantry.module.css';

/** A sheet for pasting a whole list into the pantry at once. */
export function BulkAdd({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: PantryItem[] }): JSX.Element {
  const { t } = useTranslation();
  const { store } = useSession();
  const [text, setText] = useState('');
  const keys = pantryKeys(existing.filter((item) => item.kind === 'have'));
  const names = [
    ...new Set(
      text
        .split(/[\n,]/)
        .map((part) => part.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter((part) => part !== ''),
    ),
  ];
  const parsed = names.map((name) => {
    const id = canonicalId(name);
    return { name, id, already: keys.has(keyForText(name, id)) };
  });
  const toAdd = parsed.filter((row) => !row.already);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('pantry.bulk.title')}
      footer={
        <Button
          variant="primary"
          size="bar"
          block
          disabled={toAdd.length === 0}
          onClick={() => {
            void addToPantry(store, toAdd.map((row) => row.name), 'have', existing).then(() => {
              setText('');
              onClose();
            });
          }}
        >
          {t('pantry.bulk.add', { count: toAdd.length })}
        </Button>
      }
    >
      <label className={s.bulkLabel} htmlFor="bulk-text">
        {t('pantry.bulk.label')}
      </label>
      <textarea
        id="bulk-text"
        className={s.bulkText}
        rows={6}
        dir="auto"
        value={text}
        placeholder={t('pantry.bulk.placeholder')}
        onChange={(event) => setText(event.target.value)}
      />
      {parsed.length > 0 && (
        <ul className={s.bulkPreview} aria-label={t('pantry.bulk.preview')}>
          {parsed.map((row) => (
            <li key={row.name}>
              <span dir="auto">{row.name}</span>
              <span className={s.bulkStatus}>
                {row.already
                  ? t('pantry.bulk.already')
                  : row.id !== undefined
                    ? sectionLabel(t, pantryRow(row.name, 'have').section)
                    : t('pantry.bulk.newItem', { section: sectionLabel(t, 'Other') })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
