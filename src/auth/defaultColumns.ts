import type { DataStore } from '../data/types';
import { POSITION_STEP } from '../domain/position';

/**
 * A family starts with somewhere to put things. Seeded only when there are no
 * columns at all: matching on name would re-create a column somebody renamed,
 * and a family that deliberately deleted the lot can have them back.
 */

const DEFAULT_COLUMNS: ReadonlyArray<{ name: string; isDone: boolean }> = [
  { name: 'To do', isDone: false },
  { name: 'Doing', isDone: false },
  { name: 'Done', isDone: true },
];

export async function seedDefaultColumns(store: DataStore): Promise<void> {
  const columns = await store.columns.list();
  if (columns.length > 0) return;

  let position = 0;
  for (const column of DEFAULT_COLUMNS) {
    position += POSITION_STEP;
    await store.columns.create({ ...column, position });
  }
}
