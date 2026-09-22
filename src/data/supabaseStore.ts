import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Base, BoardColumn, Member, NewRow, Task } from '../domain/types';
import { getSupabaseClient } from './supabaseClient';
import type { ChangeListener, Collection, DataStore, Unsubscribe } from './types';

/**
 * Supabase backend. Mirrors localStore.ts through the same Collection
 * interface, so screens cannot tell which one they are talking to.
 *
 * This module is the only place that knows about snake_case. Everything above
 * it works in the camelCase domain types.
 */

type TableName = 'members' | 'board_columns' | 'tasks';

/** Timestamps arrive from Postgres as e.g. 2026-09-22T10:00:00.123456+00:00. */
const TIMESTAMP_KEYS = new Set(['createdAt', 'updatedAt']);

/** Base fields are owned by the store and can never be patched by a caller. */
const READONLY_KEYS = new Set(['id', 'familyId', 'createdAt', 'updatedAt']);

function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase());
}

/**
 * Postgres row -> domain object.
 *
 * Two conversions matter beyond the key names:
 *
 * NULL becomes absent rather than null, because the domain types spell optional
 * fields `icon?: string`, not `icon: string | null`.
 *
 * Timestamps are re-serialised through Date so they are canonical JS ISO
 * strings. Postgres offers `+00:00` and microseconds, which would fail the
 * contract's `new Date(x).toISOString() === x` check. The cost is that
 * timestamps are truncated to milliseconds, so two writes to one row inside the
 * same millisecond would compare equal. A network round trip makes that
 * unreachable in practice.
 */
function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(row)) {
    if (value === null) continue;
    const key = toCamel(rawKey);
    out[key] = TIMESTAMP_KEYS.has(key) ? new Date(value as string).toISOString() : value;
  }
  return out as T;
}

/**
 * Domain object -> Postgres row, dropping anything the caller may not set.
 *
 * undefined becomes NULL, the mirror of fromRow: a patch like
 * `{ assigneeId: undefined }` means "clear it", but JSON would drop the key and
 * leave the column untouched.
 */
function toRow(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (READONLY_KEYS.has(key)) continue;
    out[toSnake(key)] = value === undefined ? null : value;
  }
  return out;
}

function fail(table: TableName, action: string, message: string): never {
  throw new Error(`${table}.${action}: ${message}`);
}

function createCollection<T extends Base>(
  client: SupabaseClient,
  familyId: string,
  table: TableName,
): Collection<T> {
  const listeners = new Set<ChangeListener>();
  let channel: RealtimeChannel | null = null;

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  return {
    async list(): Promise<T[]> {
      const { data, error } = await client.from(table).select('*').eq('family_id', familyId);
      if (error !== null) fail(table, 'list', error.message);
      return (data ?? []).map((row) => fromRow<T>(row as Record<string, unknown>));
    },

    async create(row: NewRow<T>): Promise<T> {
      const payload = {
        ...toRow(row as Record<string, unknown>),
        family_id: familyId,
      };
      const { data, error } = await client.from(table).insert(payload).select().single();
      if (error !== null) fail(table, 'create', error.message);
      notify();
      return fromRow<T>(data as Record<string, unknown>);
    },

    async update(id: string, patch: Partial<NewRow<T>>): Promise<T> {
      const { data, error } = await client
        .from(table)
        .update(toRow(patch as Record<string, unknown>))
        .eq('id', id)
        .eq('family_id', familyId)
        .select();

      if (error !== null) fail(table, 'update', error.message);

      // An update that matches nothing is a success with no rows in PostgREST,
      // not an error. The contract requires a rejection, and silently doing
      // nothing is the worse failure mode anyway.
      const rows = data ?? [];
      if (rows.length === 0) fail(table, 'update', `no row with id ${id}`);

      notify();
      return fromRow<T>(rows[0] as Record<string, unknown>);
    },

    async remove(id: string): Promise<void> {
      const { error } = await client
        .from(table)
        .delete()
        .eq('id', id)
        .eq('family_id', familyId);
      if (error !== null) fail(table, 'remove', error.message);
      notify();
    },

    subscribe(onChange: ChangeListener): Unsubscribe {
      listeners.add(onChange);

      if (channel === null) {
        // Rows this client cannot see under RLS are never delivered, so the
        // family filter is belt and braces rather than the security boundary.
        channel = client
          .channel(`nestead:${familyId}:${table}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table,
              filter: `family_id=eq.${familyId}`,
            },
            () => notify(),
          )
          .subscribe();
      }

      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && channel !== null) {
          void client.removeChannel(channel);
          channel = null;
        }
      };
    },
  };
}

/**
 * @param familyId Which family's rows to work with. RLS decides what the caller
 *                 may actually see, so this scopes queries rather than granting
 *                 anything: naming another family's id returns nothing.
 * @param client   Overridable so tests can supply a client signed in as a
 *                 particular user.
 */
export function createSupabaseStore(
  familyId: string,
  client: SupabaseClient = getSupabaseClient(),
): DataStore {
  return {
    familyId,
    members: createCollection<Member>(client, familyId, 'members'),
    columns: createCollection<BoardColumn>(client, familyId, 'board_columns'),
    tasks: createCollection<Task>(client, familyId, 'tasks'),
  };
}
