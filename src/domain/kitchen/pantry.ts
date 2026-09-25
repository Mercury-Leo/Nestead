import type { NewRow, PantryItem } from '../types';
import { catalogFor } from './calories';
import { canonicalId } from './normalize';

/** A pantry row for a name, filed under the catalog's store section. */
export function pantryRow(name: string, kind: PantryItem['kind']): NewRow<PantryItem> {
  const id = canonicalId(name);
  const line = { id: '', qty: null, unit: null, item: name, canonicalId: id };
  const row: NewRow<PantryItem> = { name, section: catalogFor(line)?.section ?? 'Other', kind };
  if (id !== undefined) row.canonicalId = id;
  return row;
}
