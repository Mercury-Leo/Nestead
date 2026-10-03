import type { AiError, QuotaScope } from '../../server/ai';
import type { ImportReport, ImportedRecipe } from '../../server/import';
import type { Session } from '../auth/session';
import { formatDate, i18n } from '../i18n';

/**
 * Nestead's /api/ai routes (server/ai) from the browser: the member's token
 * on every call, answers sorted into typed outcomes, and error codes in
 * words. Shared by the import screen and the Family page.
 */

export type FamilyAi = NonNullable<Session['ai']>;
export type AiInput = { text: string } | { url: string };
export type AiFailure = { kind: 'error'; code: AiError | 'offline'; scope?: QuotaScope };
export type ExtractOutcome = { kind: 'ok'; recipe: ImportedRecipe; report: ImportReport } | AiFailure;
export type SaveKeyOutcome = { kind: 'ok' } | AiFailure;

async function post(ai: FamilyAi, path: string, payload: unknown): Promise<Record<string, unknown> | AiFailure> {
  if (!navigator.onLine) return { kind: 'error', code: 'offline' };
  let token: string | null;
  try {
    token = await ai.token();
  } catch {
    // A session that cannot be refreshed: the person has to sign in again, as with no token.
    return { kind: 'error', code: 'unauthorized' };
  }
  if (token === null) return { kind: 'error', code: 'unauthorized' };
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    return { kind: 'error', code: navigator.onLine ? 'unavailable' : 'offline' };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { kind: 'error', code: 'unavailable' };
  const answer = body as Record<string, unknown>;
  if (typeof answer.error === 'string') {
    const failure: AiFailure = { kind: 'error', code: answer.error as AiError };
    if (answer.scope === 'user' || answer.scope === 'app') failure.scope = answer.scope;
    return failure;
  }
  return answer;
}

const failed = (value: Record<string, unknown> | AiFailure): value is AiFailure => value.kind === 'error';
const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null && !Array.isArray(value);

export async function extractRecipe(ai: FamilyAi, input: AiInput): Promise<ExtractOutcome> {
  const answer = await post(ai, '/api/ai/extract', input);
  if (failed(answer)) return answer;
  const { recipe, report } = answer;
  if (!isObject(recipe) || !isObject(report)) return { kind: 'error', code: 'unavailable' };
  return { kind: 'ok', recipe: recipe as ImportedRecipe, report: report as ImportReport };
}

export async function saveFamilyKey(ai: FamilyAi, key: string): Promise<SaveKeyOutcome> {
  const answer = await post(ai, '/api/ai/key', { key });
  if (failed(answer)) return answer;
  return answer.saved === true ? { kind: 'ok' } : { kind: 'error', code: 'unavailable' };
}

/** 00:00 UTC after `now`, when free reads come back. */
export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export function aiErrorMessage(
  code: AiFailure['code'],
  context: { input: 'text' | 'url' | 'key'; scope?: QuotaScope; now?: Date },
): { message: string; offerWrite?: boolean } {
  const t = i18n.t;
  const key = context.input === 'key';
  switch (code) {
    case 'offline':
      return { message: t('import.offline') };
    case 'unauthorized':
      return { message: t('ai.error.unauthorized') };
    case 'invalid-input':
      return { message: t(context.input === 'text' ? 'ai.error.emptyText' : 'ai.error.generic') };
    case 'too-large':
      return { message: t(context.input === 'url' ? 'import.error.tooLarge' : 'ai.error.textTooLong') };
    case 'quota-exceeded': {
      const time = formatDate(nextUtcMidnight(context.now ?? new Date()), { hour: 'numeric', minute: '2-digit' });
      return { message: t(context.scope === 'app' ? 'ai.error.quotaApp' : 'ai.error.quotaUser', { time }) };
    }
    case 'key-invalid':
      return { message: t(key ? 'ai.error.keyRejected' : 'ai.error.keyBroken') };
    case 'key-out-of-credit':
      return { message: t(key ? 'ai.error.keyNoCredit' : 'ai.error.familyKeyNoCredit') };
    case 'model-failed':
      return { message: t('ai.error.modelFailed'), offerWrite: true };
    case 'not-a-recipe':
      return { message: t('ai.error.notARecipe'), offerWrite: true };
    case 'timeout':
      return { message: t('ai.error.timeout') };
    case 'invalid-url':
      return { message: t('import.error.invalidUrl') };
    case 'blocked':
      return { message: t('import.error.blocked') };
    case 'fetch-failed':
      return { message: t('import.error.notFound'), offerWrite: true };
    default:
      return { message: t('ai.error.unavailable') };
  }
}
