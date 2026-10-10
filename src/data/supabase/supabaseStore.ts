import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type {
  Address,
  Base,
  BoardColumn,
  DietProfile,
  ListGroup,
  ListItem,
  Member,
  NewRow,
  PantryItem,
  Recipe,
  Show,
  Task,
} from '../../domain/types';
import { refreshIfExpired, requireSession } from './signedIn';
import { getSupabaseClient } from './supabaseClient';
import type { ChangeListener, Collection, DataStore, PhotoStore, Unsubscribe } from '../types';

/**
 * Supabase backend. Mirrors localStore.ts through the same Collection
 * interface, so screens cannot tell which one they are talking to.
 *
 * This module is the only place that knows about snake_case. Everything above
 * it works in the camelCase domain types. Only top-level keys are converted:
 * nested structures (ingredient lines, steps, list parts) are jsonb and keep
 * their camelCase keys inside it.
 */

type TableName =
  | 'members'
  | 'board_columns'
  | 'tasks'
  | 'recipes'
  | 'pantry_items'
  | 'diet_profiles'
  | 'list_items'
  | 'list_groups'
  | 'shows'
  | 'addresses';

/** Timestamps arrive from Postgres as e.g. 2026-09-22T10:00:00.123456+00:00. */
const TIMESTAMP_KEYS = new Set(['createdAt', 'updatedAt', 'fetchedAt', 'watchedAt']);

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

/** A Postgres or realtime timestamp as fromRow() would give it, or null if it is not one. */
function canonicalTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Enough to cover the echoes still on their way; older entries are dropped first. */
const WRITTEN_LIMIT = 200;

function createCollection<T extends Base>(
  client: SupabaseClient,
  familyId: string,
  table: TableName,
): Collection<T> {
  const listeners = new Set<ChangeListener>();
  let channel: RealtimeChannel | null = null;

  /**
   * The version of each row this client last wrote, by id. Realtime sends
   * every insert and update back to the client that made it, a few hundred
   * milliseconds after create() and update() have already notified. An echo
   * carrying exactly the version written here is dropped, so the listeners do
   * not re-read the whole table a second time. Anything else still notifies,
   * including a later change to the same row from somewhere else.
   */
  const written = new Map<string, string>();

  function remember(row: T): T {
    written.delete(row.id);
    written.set(row.id, row.updatedAt);
    if (written.size > WRITTEN_LIMIT) written.delete(written.keys().next().value as string);
    return row;
  }

  function isOwnEcho(record: Record<string, unknown> | undefined): boolean {
    if (record === undefined || typeof record.id !== 'string') return false;
    const version = written.get(record.id);
    if (version === undefined || version !== canonicalTime(record.updated_at)) return false;
    written.delete(record.id);
    return true;
  }

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  return {
    async list(): Promise<T[]> {
      await requireSession(client);
      const { data, error } = await client.from(table).select('*').eq('family_id', familyId);
      if (error !== null) {
        refreshIfExpired(client, error.message);
        fail(table, 'list', error.message);
      }
      return (data ?? []).map((row) => fromRow<T>(row as Record<string, unknown>));
    },

    async create(row: NewRow<T>): Promise<T> {
      await requireSession(client);
      const payload = {
        ...toRow(row as Record<string, unknown>),
        family_id: familyId,
      };
      const { data, error } = await client.from(table).insert(payload).select().single();
      if (error !== null) fail(table, 'create', error.message);
      const created = remember(fromRow<T>(data as Record<string, unknown>));
      notify();
      return created;
    },

    async update(id: string, patch: Partial<NewRow<T>>): Promise<T> {
      await requireSession(client);
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

      const updated = remember(fromRow<T>(rows[0] as Record<string, unknown>));
      notify();
      return updated;
    },

    async remove(id: string): Promise<void> {
      // Without a session a delete matches nothing and still succeeds: the row
      // would leave the screen and come back on the next read.
      await requireSession(client);
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
        let joined = false;
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
            (payload) => {
              if (isOwnEcho(payload.new as Record<string, unknown> | undefined)) return;
              notify();
            },
          )
          .subscribe((status) => {
            // The channel joins again by itself after the connection drops (a
            // phone asleep, a network change), but changes made meanwhile are
            // never sent: read the table again once it is back.
            if (status !== 'SUBSCRIBED') return;
            if (joined) notify();
            joined = true;
          });
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
    recipes: createCollection<Recipe>(client, familyId, 'recipes'),
    pantry: createCollection<PantryItem>(client, familyId, 'pantry_items'),
    dietProfiles: createCollection<DietProfile>(client, familyId, 'diet_profiles'),
    listItems: createCollection<ListItem>(client, familyId, 'list_items'),
    listGroups: createCollection<ListGroup>(client, familyId, 'list_groups'),
    shows: createCollection<Show>(client, familyId, 'shows'),
    addresses: createCollection<Address>(client, familyId, 'addresses'),
    photos: createPhotoStore(client, familyId),
  };
}

const PHOTO_BUCKET = 'recipe-photos';
/** Signed URLs last an hour; re-sign a little before that. */
const SIGNED_FOR_S = 3600;

/**
 * Photos in a private Storage bucket, one folder per family. Storage policies
 * (see schema.sql) only let a member read or write their own family's folder,
 * so the folder is the security boundary, the same way family_id is for rows.
 */
function createPhotoStore(client: SupabaseClient, familyId: string): PhotoStore {
  const signed = new Map<string, { url: string; until: number }>();

  type Waiting = Map<string, Array<(url: string | null) => void>>;
  /**
   * Photos asked for since the current task began. A screen of recipe cards
   * asks for all its photos in one go, one url() call per card; once that
   * task's microtasks have run they are signed in a single request.
   */
  let waiting: Waiting | null = null;

  async function signAll(batch: Waiting): Promise<void> {
    const found = new Map<string, string>();
    try {
      const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrls([...batch.keys()], SIGNED_FOR_S);
      if (error === null) {
        for (const entry of data) if (entry.path !== null && entry.error === null && entry.signedUrl) found.set(entry.path, entry.signedUrl);
      }
    } catch {
      // Every photo in the batch shows its placeholder, as a failed one did before.
    }
    const until = Date.now() + (SIGNED_FOR_S - 300) * 1000;
    for (const [id, resolvers] of batch) {
      const url = found.get(id) ?? null;
      if (url !== null) signed.set(id, { url, until });
      for (const resolve of resolvers) resolve(url);
    }
  }

  return {
    async put(blob) {
      const id = `${familyId}/${crypto.randomUUID()}.jpg`;
      const { error } = await client.storage
        .from(PHOTO_BUCKET)
        .upload(id, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      if (error !== null) throw new Error(`photos.put: ${error.message}`);
      return id;
    },

    async url(id) {
      const cached = signed.get(id);
      if (cached !== undefined && cached.until > Date.now()) return cached.url;
      return new Promise<string | null>((resolve) => {
        if (waiting === null) {
          const batch: Waiting = new Map();
          waiting = batch;
          queueMicrotask(() => {
            waiting = null;
            void signAll(batch);
          });
        }
        const resolvers = waiting.get(id);
        if (resolvers === undefined) waiting.set(id, [resolve]);
        else resolvers.push(resolve);
      });
    },

    async remove(id) {
      signed.delete(id);
      const { error } = await client.storage.from(PHOTO_BUCKET).remove([id]);
      if (error !== null) throw new Error(`photos.remove: ${error.message}`);
    },
  };
}
