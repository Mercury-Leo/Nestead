import { useMemo, useState } from 'react';
import { MapPin, Pencil, Plus, Search as SearchIcon, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { Button, EmptyState, IconButton, Sheet, TextField } from '../../../components/ui';
import { useCollectionState } from '../../../data/useCollection';
import { searchAddresses } from '../../../domain/addresses/search';
import type { Address } from '../../../domain/types';
import { useLocale } from '../../../i18n';
import { AddressForm } from './AddressForm';
import { removeAddress } from './actions';
import { NavigateButton } from './NavigateButton';
import s from './Addresses.module.css';

/** What the sheet is showing: the form for a new address or an existing one, or nothing. */
type Editing = { address: Address | null } | null;

/**
 * The family's address book (/addresses): every saved place, a search by name
 * or street, and directions to each. The search is not saved: it starts empty
 * on every visit.
 */
export function AddressesPage(): JSX.Element {
  const { t } = useTranslation();
  const { store } = useSession();
  const { info } = useLocale();
  const { rows, loaded } = useCollectionState(store.addresses);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);

  const intl = info.intl;
  const results = useMemo(() => searchAddresses(rows, query, intl), [rows, query, intl]);

  const add = (): void => setEditing({ address: null });
  const addButton = (
    <Button variant="primary" size="lg" icon={Plus} onClick={add}>
      {t('addresses.add')}
    </Button>
  );

  const confirmDelete = async (): Promise<void> => {
    if (deleting === null) return;
    setBusy(true);
    try {
      await removeAddress(store, deleting.id);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  let body: JSX.Element;
  if (!loaded) {
    body = <p className="centred">{t('common.loading')}</p>;
  } else if (rows.length === 0) {
    body = (
      <EmptyState icon={MapPin} title={t('addresses.empty.title')} actions={addButton}>
        <p>{t('addresses.empty.body')}</p>
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div className={s.toolbar} role="search">
          <TextField
            label={t('addresses.searchLabel')}
            icon={SearchIcon}
            type="search"
            dir="auto"
            value={query}
            placeholder={t('addresses.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('');
            }}
            wrapClassName={s.search}
          />
          {query !== '' && <IconButton label={t('addresses.clearSearch')} icon={X} variant="secondary" onClick={() => setQuery('')} />}
        </div>
        {results.length === 0 ? (
          <div className={s.noMatches}>
            <p>{t('addresses.noMatches')}</p>
            <Button variant="secondary" onClick={() => setQuery('')}>
              {t('addresses.clearSearch')}
            </Button>
          </div>
        ) : (
          <ul className={s.list}>
            {results.map((address) => (
              <AddressRow key={address.id} address={address} onEdit={() => setEditing({ address })} onDelete={() => setDeleting(address)} />
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <div className={s.page}>
      <PageHeader title={t('addresses.title')} actions={loaded && rows.length > 0 ? addButton : undefined} />
      {body}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.address == null ? t('addresses.form.addTitle') : t('addresses.form.editTitle')}
      >
        {editing !== null && <AddressForm key={editing.address?.id ?? 'new'} address={editing.address} onDone={() => setEditing(null)} />}
      </Sheet>

      <Sheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting === null ? '' : t('addresses.deleteTitle', { name: deleting.name })}
        footer={
          <div className={s.formActions}>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t('common.keepIt')}
            </Button>
            <Button variant="primary" icon={Trash2} disabled={busy} onClick={() => void confirmDelete()}>
              {t('common.delete')}
            </Button>
          </div>
        }
      >
        <p className={s.deleteBody}>{t('addresses.deleteBody')}</p>
      </Sheet>
    </div>
  );
}

/** One saved place: what to call it, where it is, how to get in, and its actions. */
function AddressRow({ address, onEdit, onDelete }: { address: Address; onEdit: () => void; onDelete: () => void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <li className={s.row}>
      <div className={s.rowText}>
        {/* <bdi> gets each piece's own direction without moving it off the page's side. */}
        <h2 className={s.name}>
          <bdi>{address.name}</bdi>
        </h2>
        <p className={s.where}>
          <bdi>{t('addresses.streetCity', { street: address.street, city: address.city })}</bdi>
        </p>
        {(address.apartment !== undefined || address.doorCode !== undefined) && (
          <dl className={s.details}>
            {address.apartment !== undefined && (
              <div>
                <dt>{t('addresses.apartment')}</dt>
                <dd>
                  <bdi>{address.apartment}</bdi>
                </dd>
              </div>
            )}
            {address.doorCode !== undefined && (
              <div>
                <dt>{t('addresses.doorCode')}</dt>
                <dd className="tabular">
                  <bdi>{address.doorCode}</bdi>
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
      <div className={s.rowActions}>
        <NavigateButton address={address} />
        <IconButton label={t('addresses.editLabel', { name: address.name })} icon={Pencil} onClick={onEdit} />
        <IconButton label={t('addresses.deleteLabel', { name: address.name })} icon={Trash2} onClick={onDelete} />
      </div>
    </li>
  );
}
