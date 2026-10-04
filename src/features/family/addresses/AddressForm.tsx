import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { Button, TextField } from '../../../components/ui';
import type { Address } from '../../../domain/types';
import { EMPTY_FIELDS, fieldsOf, saveAddress } from './actions';
import type { AddressFields } from './actions';
import s from './Addresses.module.css';

type Required = 'name' | 'city' | 'street';
const REQUIRED: readonly Required[] = ['name', 'city', 'street'];

/** Adding an address (`address` null) or editing one. */
export function AddressForm({ address, onDone }: { address: Address | null; onDone: () => void }): JSX.Element {
  const { t } = useTranslation();
  const { store, me } = useSession();
  const [fields, setFields] = useState<AddressFields>(() => (address === null ? EMPTY_FIELDS : fieldsOf(address)));
  // A required field shows its error once it has been left, or after a try to save.
  const [touched, setTouched] = useState<ReadonlySet<Required>>(new Set());
  const [busy, setBusy] = useState(false);

  // The sheet focuses its first control (Close) as it opens, after autoFocus
  // would have run, so the name field takes focus a frame later.
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => first.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const missing = (field: Required): boolean => fields[field].trim() === '';
  const showError = (field: Required): boolean => touched.has(field) && missing(field);
  const touch = (field: Required): void => setTouched((before) => new Set(before).add(field));
  const set = (field: keyof AddressFields) => (event: { target: { value: string } }) =>
    setFields((before) => ({ ...before, [field]: event.target.value }));

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (REQUIRED.some(missing)) {
      setTouched(new Set(REQUIRED));
      return;
    }
    setBusy(true);
    try {
      await saveAddress(store, address, fields, me.id);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  /** A required field, with its error under it while it is empty. */
  const required = (field: Required, ref?: typeof first): JSX.Element => {
    const errorId = `address-${field}-error`;
    const invalid = showError(field);
    return (
      <div>
        <TextField
          ref={ref}
          label={t(`addresses.form.${field}`)}
          showLabel
          placeholder={t(`addresses.form.${field}Placeholder`)}
          dir="auto"
          value={fields[field]}
          onChange={set(field)}
          onBlur={() => touch(field)}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          aria-required
        />
        {invalid && (
          <p id={errorId} className={s.fieldError}>
            {t(`addresses.form.${field}Missing`)}
          </p>
        )}
      </div>
    );
  };

  return (
    <form className={s.form} onSubmit={(event) => void save(event)} noValidate>
      {required('name', first)}
      {required('street')}
      {required('city')}
      <div className={s.pair}>
        <TextField
          label={t('addresses.form.apartment')}
          showLabel
          dir="auto"
          value={fields.apartment}
          onChange={set('apartment')}
        />
        <TextField
          label={t('addresses.form.doorCode')}
          showLabel
          dir="auto"
          autoComplete="off"
          spellCheck={false}
          value={fields.doorCode}
          onChange={set('doorCode')}
        />
      </div>
      <div className={s.formActions}>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {address === null ? t('addresses.add') : t('common.save')}
        </Button>
      </div>
    </form>
  );
}
