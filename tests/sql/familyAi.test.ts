// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/*
 * claim_ai_request() and the other AI functions in supabase/schema.sql, on an
 * in-process Postgres. Never against the real project: the .env.test users
 * live in production, and claiming there would spend the app's real free reads.
 */

const shim = readFileSync(new URL('./supabaseShim.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');

let db: PGlite;
const user = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FAMILY_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const FAMILY_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const CIPHERTEXT = 'v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBB';
const FREE_DAY = `(now() at time zone 'utc')::date`;
const TABLES = ['family_ai_settings', 'ai_usage', 'ai_usage_days'];
const FUNCTIONS = [
  'family_ai_status()',
  'store_family_ai_key(text, text)',
  'clear_family_ai_key()',
  'set_family_ai_model(text)',
  'claim_ai_request()',
];

/** Runs `sql` with the session's auth.uid() set to `userId`, as PostgREST does from the token. */
async function as<T>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  return (await db.query<T>(sql, params)).rows;
}
const claim = async (userId: string) => (await as<{ c: Record<string, unknown> }>(userId, 'select claim_ai_request() as c'))[0]!.c;
const status = async (userId: string) => (await as<{ s: Record<string, unknown> }>(userId, 'select family_ai_status() as s'))[0]!.s;
const utcToday = (): string => new Date().toISOString().slice(0, 10);
/** The first column of the first row, read as the superuser. */
async function value<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<{ v: T }>(`select (${sql}) as v`, params)).rows[0]!.v;
}

async function addMember(familyId: string, id: string, name = 'M'): Promise<void> {
  await db.query('insert into auth.users (id) values ($1)', [id]);
  await db.query(`insert into members (id, family_id, name, color) values ($1, $2, $3, '#000000')`, [id, familyId, name]);
}

async function addFamilyKey(familyId: string, setBy: string, model: string | null): Promise<void> {
  await db.query(
    'insert into family_ai_settings (family_id, key_ciphertext, key_hint, model, set_by) values ($1, $2, $3, $4, $5)',
    [familyId, CIPHERTEXT, 'a3f2', model, setBy],
  );
}

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(shim);
  await db.exec(schema);
}, 60_000);

beforeEach(async () => {
  await db.exec('set timezone = default; truncate ai_usage, ai_usage_days, family_ai_settings, members, families cascade; delete from auth.users;');
  await db.query(`insert into families (id, name, join_code) values ($1, 'A', 'AAAAAAAA'), ($2, 'B', 'BBBBBBBB')`, [FAMILY_A, FAMILY_B]);
});

describe('claim_ai_request: free reads', () => {
  it('lets a user make 5 free claims a day and refuses the sixth without counting it', async () => {
    await addMember(FAMILY_A, user(1));
    for (let i = 0; i < 5; i += 1) expect(await claim(user(1))).toEqual({ mode: 'free' });
    expect(await claim(user(1))).toEqual({ mode: 'quota-exceeded', scope: 'user' });
    expect(await value('select count from ai_usage where user_id = $1', [user(1)])).toBe(5);
    expect(await value('select count from ai_usage_days')).toBe(5);
  });

  it('stops the whole app at 45 free claims a day', async () => {
    for (let n = 1; n <= 10; n += 1) await addMember(FAMILY_A, user(n));
    for (let n = 1; n <= 9; n += 1) {
      for (let i = 0; i < 5; i += 1) expect(await claim(user(n))).toEqual({ mode: 'free' });
    }
    expect(await claim(user(10))).toEqual({ mode: 'quota-exceeded', scope: 'app' });
    expect(await value('select count from ai_usage_days')).toBe(45);
    expect(await value('select count(*)::int from ai_usage where user_id = $1', [user(10)])).toBe(0);
  });

  it('names the user as the reason when the user and the app are both at the cap', async () => {
    await addMember(FAMILY_A, user(1));
    await db.query(`insert into ai_usage values (${FREE_DAY}, $1, 5)`, [user(1)]);
    await db.query(`insert into ai_usage_days values (${FREE_DAY}, 45)`);
    expect(await claim(user(1))).toEqual({ mode: 'quota-exceeded', scope: 'user' });
  });

  it('starts again the next day: yesterday at both caps does not count today', async () => {
    await addMember(FAMILY_A, user(1));
    await db.query(`insert into ai_usage_days values (${FREE_DAY} - 1, 45)`);
    await db.query(`insert into ai_usage values (${FREE_DAY} - 1, $1, 5)`, [user(1)]);
    expect(await claim(user(1))).toEqual({ mode: 'free' });
  });

  it('counts by the UTC day, whatever the session time zone', async () => {
    await addMember(FAMILY_A, user(1));
    await db.exec(`set timezone = 'Pacific/Kiritimati'`);
    // Kiritimati is 14 hours ahead, so its date differs from UTC's for most of a day.
    // Reading the UTC date on both sides of the claim also holds when UTC midnight falls between.
    const before = utcToday();
    await claim(user(1));
    const after = utcToday();
    expect([before, after]).toContain(await value<string>('select day::text from ai_usage'));
  });

  it('deletes rows older than 30 days when it counts, and keeps those 30 days old', async () => {
    await addMember(FAMILY_A, user(1));
    for (const age of [31, 30]) {
      await db.query(`insert into ai_usage values (${FREE_DAY} - ${age}, $1, 2)`, [user(1)]);
      await db.query(`insert into ai_usage_days values (${FREE_DAY} - ${age}, 2)`);
    }
    await claim(user(1));
    for (const [age, kept] of [[31, 0], [30, 1]] as const) {
      expect(await value(`select count(*)::int from ai_usage where day = ${FREE_DAY} - ${age}`), `ai_usage, ${age} days old`).toBe(kept);
      expect(await value(`select count(*)::int from ai_usage_days where day = ${FREE_DAY} - ${age}`), `ai_usage_days, ${age} days old`).toBe(kept);
    }
  });
});

describe('claim_ai_request: other modes', () => {
  it('hands over the family key and counts nothing, even for a user at the cap', async () => {
    await addMember(FAMILY_A, user(1));
    await addFamilyKey(FAMILY_A, user(1), 'google/gemini-2.5-flash');
    await db.query(`insert into ai_usage values (${FREE_DAY}, $1, 5)`, [user(1)]);
    await db.query(`insert into ai_usage_days values (${FREE_DAY}, 5)`);
    expect(await claim(user(1))).toEqual({
      mode: 'family',
      family_id: FAMILY_A,
      ciphertext: CIPHERTEXT,
      model: 'google/gemini-2.5-flash',
    });
    expect(await value('select count from ai_usage where user_id = $1', [user(1)])).toBe(5);
    expect(await value('select count from ai_usage_days')).toBe(5);
  });

  it('gives a null model when the family has not chosen one', async () => {
    await addMember(FAMILY_A, user(1));
    await addFamilyKey(FAMILY_A, user(1), null);
    expect(await claim(user(1))).toEqual({ mode: 'family', family_id: FAMILY_A, ciphertext: CIPHERTEXT, model: null });
  });

  it('says no-family for a signed-in user who belongs to none, and counts nothing', async () => {
    await db.query('insert into auth.users (id) values ($1)', [user(99)]);
    expect(await claim(user(99))).toEqual({ mode: 'no-family' });
    expect(await value('select count(*)::int from ai_usage_days')).toBe(0);
  });

  it('never gives one family the key of another', async () => {
    await addMember(FAMILY_A, user(1));
    await addMember(FAMILY_B, user(2));
    await addFamilyKey(FAMILY_A, user(1), null);
    const result = await claim(user(2));
    expect(result).toEqual({ mode: 'free' });
    expect(JSON.stringify(result)).not.toContain(CIPHERTEXT);
  });
});

describe('family_ai_status', () => {
  it('reports no key and the full allowance for a family without one', async () => {
    await addMember(FAMILY_A, user(1));
    expect(await status(user(1))).toEqual({
      has_key: false,
      key_hint: null,
      model: null,
      set_by_name: null,
      updated_at: null,
      free_used: 0,
      free_limit: 5,
      free_left: 5,
    });
  });

  it('counts the free reads the user has made', async () => {
    await addMember(FAMILY_A, user(1));
    await claim(user(1));
    await claim(user(1));
    expect(await status(user(1))).toMatchObject({ free_used: 2, free_left: 3 });
  });

  it('shows what the app has left when that is less than the user has left', async () => {
    await addMember(FAMILY_A, user(1));
    await db.query(`insert into ai_usage_days values (${FREE_DAY}, 44)`);
    expect(await status(user(1))).toMatchObject({ free_used: 0, free_left: 1 });
  });

  it('never returns less than zero left, even past the cap', async () => {
    await addMember(FAMILY_A, user(1));
    await db.query(`insert into ai_usage_days values (${FREE_DAY}, 50)`);
    expect(await status(user(1))).toMatchObject({ free_left: 0 });
  });
});

describe('store, replace, model and clear', () => {
  it('stores a key, keeps the model when the key is replaced, and clears both', async () => {
    await addMember(FAMILY_A, user(1), 'Dana');
    await as(user(1), 'select store_family_ai_key($1, $2)', [CIPHERTEXT, 'a3f2']);
    const stored = await status(user(1));
    expect(stored).toMatchObject({ has_key: true, key_hint: 'a3f2', model: null, set_by_name: 'Dana' });
    expect(typeof stored.updated_at).toBe('string');
    expect(JSON.stringify(stored)).not.toContain(CIPHERTEXT);

    await as(user(1), 'select set_family_ai_model($1)', ['google/gemini-2.5-flash']);
    expect(await status(user(1))).toMatchObject({ model: 'google/gemini-2.5-flash' });

    await as(user(1), 'select store_family_ai_key($1, $2)', [CIPHERTEXT, 'b4c5']);
    expect(await status(user(1))).toMatchObject({ key_hint: 'b4c5', model: 'google/gemini-2.5-flash' });

    await as(user(1), 'select set_family_ai_model($1::text)', [null]);
    expect(await status(user(1))).toMatchObject({ has_key: true, model: null });

    await as(user(1), 'select set_family_ai_model($1)', ['  ']);
    expect(await status(user(1))).toMatchObject({ model: null });

    await as(user(1), 'select clear_family_ai_key()');
    expect(await status(user(1))).toMatchObject({ has_key: false, key_hint: null, model: null, set_by_name: null });
  });

  it('names whoever stored the key, and shows the family the same key', async () => {
    await addMember(FAMILY_A, user(1), 'Dana');
    await addMember(FAMILY_A, user(2), 'Noam');
    await as(user(2), 'select store_family_ai_key($1, $2)', [CIPHERTEXT, 'a3f2']);
    expect(await status(user(1))).toMatchObject({ has_key: true, set_by_name: 'Noam' });
  });

  it('keeps one family from seeing or clearing the key of another', async () => {
    await addMember(FAMILY_A, user(1));
    await addMember(FAMILY_B, user(2));
    await as(user(1), 'select store_family_ai_key($1, $2)', [CIPHERTEXT, 'a3f2']);
    expect(await status(user(2))).toMatchObject({ has_key: false });
    await as(user(2), 'select clear_family_ai_key()');
    expect(await status(user(1))).toMatchObject({ has_key: true });
  });

  it('refuses a model when the family has no key', async () => {
    await addMember(FAMILY_A, user(1));
    await expect(as(user(1), `select set_family_ai_model('a/b')`)).rejects.toThrow(/No family key/);
  });

  it('refuses all four writes and the status to a user in no family', async () => {
    await db.query('insert into auth.users (id) values ($1)', [user(99)]);
    for (const sql of [
      'select family_ai_status()',
      `select store_family_ai_key('${CIPHERTEXT}', 'a3f2')`,
      'select clear_family_ai_key()',
      `select set_family_ai_model('a/b')`,
    ]) {
      await expect(as(user(99), sql), sql).rejects.toThrow(/You do not belong to a family/);
    }
    await expect(as(null, 'select family_ai_status()')).rejects.toThrow(/You do not belong to a family/);
  });
});

describe('check constraints', () => {
  it('rejects model ids that are variants, aliases, routers or too long, and keeps the model', async () => {
    await addMember(FAMILY_A, user(1));
    await as(user(1), 'select store_family_ai_key($1, $2)', [CIPHERTEXT, 'a3f2']);
    await as(user(1), 'select set_family_ai_model($1)', ['google/gemini-2.5-flash']);
    for (const model of ['openai/gpt-4o:online', 'openrouter/auto', '~a/b', 'no-vendor', 'a/' + 'b'.repeat(99)]) {
      await expect(as(user(1), 'select set_family_ai_model($1)', [model]), model).rejects.toThrow(/family_ai_settings_model_check/);
    }
    expect(await status(user(1))).toMatchObject({ model: 'google/gemini-2.5-flash' });
  });

  it('accepts a :free model and a 100-character id', async () => {
    await addMember(FAMILY_A, user(1));
    await as(user(1), 'select store_family_ai_key($1, $2)', [CIPHERTEXT, 'a3f2']);
    await as(user(1), 'select set_family_ai_model($1)', ['meta-llama/llama-3.3-70b-instruct:free']);
    expect(await status(user(1))).toMatchObject({ model: 'meta-llama/llama-3.3-70b-instruct:free' });
    const longest = 'a/' + 'b'.repeat(98);
    await as(user(1), 'select set_family_ai_model($1)', [longest]);
    expect(await status(user(1))).toMatchObject({ model: longest });
  });

  it('rejects a key that is not v1:iv:ciphertext, one that is too long, and a hint that is not 4 characters', async () => {
    await addMember(FAMILY_A, user(1));
    await expect(as(user(1), 'select store_family_ai_key($1, $2)', ['plaintext-key', 'a3f2'])).rejects.toThrow(
      /family_ai_settings_key_ciphertext_check/,
    );
    await expect(as(user(1), 'select store_family_ai_key($1, $2)', ['v1:AAAA:' + 'B'.repeat(1020), 'a3f2'])).rejects.toThrow(
      /family_ai_settings_key_ciphertext_check/,
    );
    await expect(as(user(1), 'select store_family_ai_key($1, $2)', [CIPHERTEXT, 'toolong'])).rejects.toThrow(
      /family_ai_settings_key_hint_check/,
    );
    expect(await status(user(1))).toMatchObject({ has_key: false });
  });
});

describe('who can reach the tables and functions', () => {
  // The suite runs as the superuser, so it checks the grants instead of switching role.
  it('gives anon and authenticated no privilege on any AI table', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of TABLES) {
        for (const privilege of ['select', 'insert', 'update', 'delete']) {
          const ok = await value<boolean>('select has_table_privilege($1, $2, $3)', [role, table, privilege]);
          expect(ok, `${role} ${privilege} ${table}`).toBe(false);
        }
      }
    }
  });

  it('keeps row level security on, with no policy, for every AI table', async () => {
    for (const table of TABLES) {
      expect(await value<boolean>('select relrowsecurity from pg_class where relname = $1', [table]), table).toBe(true);
    }
    expect(await value('select count(*)::int from pg_policies where tablename = any($1)', [TABLES])).toBe(0);
  });

  it('lets authenticated, and not anon, execute the five functions', async () => {
    expect(await value<boolean>(`select has_function_privilege('authenticated', 'claim_ai_request()', 'execute')`)).toBe(true);
    expect(await value<boolean>(`select has_function_privilege('anon', 'claim_ai_request()', 'execute')`)).toBe(false);
    for (const fn of FUNCTIONS) {
      expect(await value<boolean>(`select has_function_privilege('authenticated', $1, 'execute')`, [fn]), `authenticated ${fn}`).toBe(true);
      expect(await value<boolean>(`select has_function_privilege('anon', $1, 'execute')`, [fn]), `anon ${fn}`).toBe(false);
    }
  });

  it('runs the five functions as their owner with the search path pinned', async () => {
    const names = ['family_ai_status', 'store_family_ai_key', 'clear_family_ai_key', 'set_family_ai_model', 'claim_ai_request'];
    const rows = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
      'select proname, prosecdef, proconfig from pg_proc where proname = any($1) order by proname',
      [names],
    );
    expect(rows.rows.map((row) => row.proname)).toEqual([...names].sort());
    for (const row of rows.rows) {
      expect(row.prosecdef, row.proname).toBe(true);
      expect(row.proconfig, row.proname).toContain('search_path=public');
    }
  });

  it('keeps all three tables out of the realtime publication', async () => {
    // A control first: the query does see a table that is published.
    const published = `select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime'`;
    expect(await value(`${published} and tablename = 'members'`)).toBe(1);
    expect(await value(`${published} and tablename = any($1)`, [TABLES])).toBe(0);
  });
});
