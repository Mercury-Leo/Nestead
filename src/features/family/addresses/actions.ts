import type { DataStore } from '../../../data/types';
import type { Address, NewRow } from '../../../domain/types';

/** The form's five fields, as typed. */
export interface AddressFields {
  name: string;
  city: string;
  street: string;
  apartment: string;
  doorCode: string;
}

export const EMPTY_FIELDS: AddressFields = { name: '', city: '', street: '', apartment: '', doorCode: '' };

export function fieldsOf(address: Address): AddressFields {
  return {
    name: address.name,
    city: address.city,
    street: address.street,
    apartment: address.apartment ?? '',
    doorCode: address.doorCode ?? '',
  };
}

/** A blank optional field is no field: undefined, which also clears it on an update. */
function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Adds an address, or saves the edits to one. Required fields are trimmed; blank optional ones are cleared. */
export function saveAddress(store: DataStore, existing: Address | null, fields: AddressFields, memberId: string): Promise<Address> {
  const required = { name: fields.name.trim(), city: fields.city.trim(), street: fields.street.trim() };
  const apartment = optional(fields.apartment);
  const doorCode = optional(fields.doorCode);
  if (existing !== null) return store.addresses.update(existing.id, { ...required, apartment, doorCode });

  const row: NewRow<Address> = { ...required, createdBy: memberId };
  if (apartment !== undefined) row.apartment = apartment;
  if (doorCode !== undefined) row.doorCode = doorCode;
  return store.addresses.create(row);
}

export function removeAddress(store: DataStore, id: string): Promise<void> {
  return store.addresses.remove(id);
}
