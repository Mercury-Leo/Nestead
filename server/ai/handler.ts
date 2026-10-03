import { checkUrl, detectEquipment, fetchPage, siteOf } from '../import';
import type { ImportError, ImportReport, ImportedRecipe } from '../import';
import { decryptKey, encryptKey, importSecret } from './crypto';
import { callChat, chatBody, chatError, checkKey, freeModelList, isModelId } from './openrouter';
import type { ModelChoice } from './openrouter';
import { pageText } from './pageText';
import { postgrestStore } from './store';
import type { AiError, AiLogEntry, AiOptions, AiStore, QuotaScope } from './types';
import { validateOutput } from './validate';
import type { Extracted } from './validate';

/**
 * POST /api/ai/extract { text | url } and POST /api/ai/key { key }: see the
 * spec, docs/superpowers/specs/2026-10-03-ai-recipe-extraction-design.md section 5.
 * One model call per read, never acted on; the member's token checked by
 * Supabase; a family key decrypted only for the call that uses it.
 */

export const MAX_TEXT = 20_000;
const MAX_BODY = 128 * 1024;
const PAGE_BYTES = 5 * 1024 * 1024;
/** How much of a fetched page pageText() reads. It bounds CPU and memory on Cloudflare Workers; the text it keeps is cut at 20,000 characters anyway (spec section 15.3). */
const MAX_HTML = 1_000_000;
const TIMEOUTS = { model: 60_000, key: 10_000, rpc: 10_000, page: 10_000 };
const KEY_FORMAT = /^sk-or-[A-Za-z0-9_-]{20,200}$/;
/** A Supabase access token is a JWT: letters, digits and - _ . ~ + / = only, so nothing else can reach a request header. */
const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/i;

const STATUS: Record<AiError, number> = {
  unauthorized: 401,
  'invalid-input': 400,
  'too-large': 413,
  'quota-exceeded': 429,
  'key-invalid': 422,
  'key-out-of-credit': 402,
  'model-failed': 502,
  'not-a-recipe': 422,
  timeout: 504,
  unavailable: 503,
  method: 405,
  'invalid-url': 400,
  blocked: 400,
  'fetch-failed': 502,
};

type Route = AiLogEntry['route'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function bearer(request: Request): string | null {
  const match = BEARER.exec(request.headers.get('authorization') ?? '');
  return match === null ? null : (match[1] as string);
}

async function readBody(request: Request): Promise<Record<string, unknown> | 'too-large' | null> {
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY) return 'too-large';
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return 'too-large';
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function nonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The importer's codes as this endpoint's; a page that fetched but had no recipe is not-a-recipe. */
function fromImportError(error: ImportError): AiError {
  return error === 'not-found' ? 'not-a-recipe' : error;
}

/** The OPENROUTER_FREE_MODELS entries freeModelList() leaves out for being no valid :free id. Entries past the first three valid ones are unused, not dropped. */
function droppedModels(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '' && !(isModelId(id) && id.endsWith(':free')));
}

interface Page {
  url: string;
  site: string;
  image?: string;
}

/** The validated answer in the importer's shape: url, site and image only ever from our own reading of the page. */
function toImported(extracted: Extracted, page: Page | undefined): { recipe: ImportedRecipe; report: ImportReport } {
  const recipe: ImportedRecipe = { title: extracted.title, ingredients: extracted.ingredients, steps: extracted.steps, equipment: detectEquipment(extracted.steps) };
  if (page !== undefined) {
    recipe.url = page.url;
    recipe.site = page.site;
    if (page.image !== undefined) recipe.image = page.image;
  }
  if (extracted.description !== undefined) recipe.description = extracted.description;
  if (extracted.servings !== undefined) recipe.servings = extracted.servings;
  if (extracted.servingUnit !== undefined) recipe.servingUnit = extracted.servingUnit;
  if (extracted.prepMin !== undefined) recipe.prepMin = extracted.prepMin;
  if (extracted.cookMin !== undefined) recipe.cookMin = extracted.cookMin;

  const found = ['title', ...(recipe.image !== undefined ? ['photo'] : []), ...(recipe.servings !== undefined ? ['servings'] : [])];
  const missing: string[] = [];
  if (recipe.image === undefined) missing.push('photo');
  if (recipe.servings === undefined) missing.push('servings');
  if (recipe.prepMin === undefined && recipe.cookMin === undefined) missing.push('times');
  missing.push('calories');
  if (recipe.steps.length === 0) missing.push('steps');
  return { recipe, report: { found, missing } };
}

export function createAiHandler(options: AiOptions = {}): (request: Request) => Promise<Response> {
  const doFetch = options.fetch ?? fetch;
  const timeouts = { ...TIMEOUTS, ...options.timeouts };
  const freeModels = freeModelList(options.freeModels);
  const sharedKey = options.openRouterKey?.trim() ?? '';
  const log = options.log ?? ((entry: AiLogEntry) => console.info(JSON.stringify({ ai: entry })));
  const warn = options.warn ?? ((message: string) => console.warn(message));

  // Model ids are not secret; an entry is cut to the longest id there is, so one stray value cannot fill the log.
  const dropped = droppedModels(options.freeModels);
  if (dropped.length > 0) {
    warn(`OPENROUTER_FREE_MODELS: ignoring ${JSON.stringify(dropped.map((id) => id.slice(0, 100)))}; each entry must be a plain vendor/model id ending in :free`);
  }

  const storeFor = (token: string): AiStore | null => {
    if (options.store !== undefined) return options.store(token);
    const url = options.supabaseUrl?.trim() ?? '';
    const key = options.supabaseKey?.trim() ?? '';
    if (url === '' || key === '') return null;
    return postgrestStore({ url, key, token, fetch: doFetch, timeoutMs: timeouts.rpc });
  };

  const fail = (route: Route, error: AiError, extra: { scope?: QuotaScope; status?: number; model?: string } = {}): Response => {
    const entry: AiLogEntry = { route, error };
    if (extra.status !== undefined) entry.status = extra.status;
    if (extra.model !== undefined) entry.model = extra.model;
    log(entry);
    return json(extra.scope !== undefined ? { error, scope: extra.scope } : { error }, STATUS[error]);
  };

  async function extract(request: Request, token: string): Promise<Response> {
    const body = await readBody(request);
    if (body === 'too-large') return fail('extract', 'too-large');
    if (body === null || ('text' in body) === ('url' in body)) return fail('extract', 'invalid-input');

    let input: { text: string } | { url: string };
    if ('text' in body) {
      if (typeof body.text !== 'string' || body.text.trim() === '') return fail('extract', 'invalid-input');
      const text = body.text.trim();
      if (text.length > MAX_TEXT) return fail('extract', 'too-large');
      input = { text };
    } else {
      if (typeof body.url !== 'string') return fail('extract', 'invalid-input');
      const url = body.url.trim();
      const problem = await checkUrl(url, options.resolveHost);
      if (problem !== null) return fail('extract', fromImportError(problem));
      input = { url };
    }

    const store = storeFor(token);
    if (store === null) return fail('extract', 'unavailable');
    const claim = await store.claim();
    if (claim === 'unauthorized' || claim.mode === 'no-family') return fail('extract', 'unauthorized');
    if (claim.mode === 'quota-exceeded') return fail('extract', 'quota-exceeded', { scope: claim.scope });

    // Everything the call needs is checked before the page is fetched.
    const secret = claim.mode === 'family' ? await importSecret(options.keySecret) : null;
    if (claim.mode === 'family' && secret === null) return fail('extract', 'unavailable');
    if (claim.mode === 'free' && (sharedKey === '' || freeModels.length === 0)) return fail('extract', 'unavailable');
    let choice: ModelChoice;
    if (claim.mode === 'family' && claim.model !== null) {
      if (!isModelId(claim.model)) return fail('extract', 'model-failed');
      choice = { model: claim.model };
    } else {
      if (freeModels.length === 0) return fail('extract', 'unavailable');
      choice = { models: freeModels };
    }

    let text: string;
    let page: Page | undefined;
    if ('text' in input) {
      text = input.text;
    } else {
      const fetched = await fetchPage(input.url, { fetch: doFetch, resolveHost: options.resolveHost, timeoutMs: timeouts.page, maxBytes: PAGE_BYTES });
      if (typeof fetched === 'string') return fail('extract', fromImportError(fetched));
      const reduced = pageText(fetched.html.slice(0, MAX_HTML), fetched.url);
      if (reduced.text === '') return fail('extract', 'not-a-recipe');
      text = reduced.text;
      page = { url: fetched.url, site: siteOf(fetched.url) };
      if (reduced.image !== undefined) page.image = reduced.image;
    }

    // Decrypted last, so the plaintext key lives only for the one call.
    let key = sharedKey;
    if (claim.mode === 'family') {
      const plain = await decryptKey(claim.ciphertext, claim.familyId, secret as CryptoKey);
      if (plain === null) return fail('extract', 'key-invalid');
      key = plain;
    }
    const outcome = await callChat(key, chatBody(text, nonce(), choice), { fetch: doFetch, timeoutMs: timeouts.model });
    if (outcome.kind !== 'content') {
      const { error, scope } = chatError(outcome, claim.mode === 'family' ? 'family' : 'free');
      return fail('extract', error, { ...(scope !== undefined ? { scope } : {}), ...(outcome.kind === 'http' ? { status: outcome.status } : {}) });
    }
    const result = validateOutput(outcome.content);
    const model = outcome.model !== undefined ? { model: outcome.model } : {};
    if (result.kind === 'not-a-recipe') return fail('extract', 'not-a-recipe', model);
    if (result.kind === 'invalid') return fail('extract', 'model-failed', model);
    log({ route: 'extract', ...model });
    return json(toImported(result.recipe, page));
  }

  async function saveKey(request: Request, token: string): Promise<Response> {
    const body = await readBody(request);
    if (body === 'too-large') return fail('key', 'too-large');
    if (body === null || typeof body.key !== 'string') return fail('key', 'invalid-input');
    const key = body.key.trim();
    if (!KEY_FORMAT.test(key)) return fail('key', 'key-invalid');
    const secret = await importSecret(options.keySecret);
    const store = storeFor(token);
    if (secret === null || store === null) return fail('key', 'unavailable');

    // The member first, so this is no anonymous way to test keys.
    const familyId = await store.familyId();
    if (familyId === null || familyId === 'unauthorized') return fail('key', 'unauthorized');
    const check = await checkKey(key, { fetch: doFetch, timeoutMs: timeouts.key });
    if (check !== 'ok') return fail('key', check);
    const stored = await store.storeKey(await encryptKey(key, familyId, secret), key.slice(-4));
    if (stored === 'unauthorized') return fail('key', 'unauthorized');
    log({ route: 'key' });
    return json({ saved: true });
  }

  return async (request) => {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const route: Route | null = path.endsWith('/api/ai/extract') ? 'extract' : path.endsWith('/api/ai/key') ? 'key' : null;
    if (request.method !== 'POST' || route === null) return json({ error: 'method' }, STATUS.method);
    const token = bearer(request);
    if (token === null) return fail(route, 'unauthorized');
    try {
      return route === 'extract' ? await extract(request, token) : await saveKey(request, token);
    } catch {
      // A StoreError or anything unexpected. Its message is not logged: it could carry a request detail.
      return fail(route, 'unavailable');
    }
  };
}
