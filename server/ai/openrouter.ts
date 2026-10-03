import { RECIPE_SCHEMA, systemPrompt, userMessage } from './prompt';
import type { AiError, QuotaScope } from './types';

/**
 * OpenRouter over plain fetch: one chat completion per read, with no tools,
 * plugins or web search, and the key check used when a family adds a key.
 * Docs: https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
 */

export const OPENROUTER = 'https://openrouter.ai/api/v1';
export const MAX_COMPLETION_TOKENS = 6000;
const MODEL_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*(:free)?$/;
const FREE_MODELS_USED = 3;

/** A plain vendor/model id: no :online or other variants, no ~ aliases, no openrouter/* routers. */
export function isModelId(id: string): boolean {
  return id.length <= 100 && MODEL_ID.test(id) && !id.startsWith('openrouter/');
}

/** OPENROUTER_FREE_MODELS as the list to send: valid :free ids only, the first three. */
export function freeModelList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => isModelId(id) && id.endsWith(':free'))
    .slice(0, FREE_MODELS_USED);
}

export type ModelChoice = { model: string } | { models: string[] };

/**
 * The whole request. For the free list, `model` is the first entry and
 * `models` the whole list, which falls back in order under either reading of
 * OpenRouter's docs (spec §15.1).
 */
export function chatBody(text: string, nonce: string, choice: ModelChoice): Record<string, unknown> {
  const routing = 'model' in choice ? { model: choice.model } : { model: choice.models[0], models: choice.models };
  return {
    ...routing,
    messages: [
      { role: 'system', content: systemPrompt(nonce) },
      { role: 'user', content: userMessage(text, nonce) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'recipe', strict: true, schema: RECIPE_SCHEMA } },
    provider: { require_parameters: true },
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    temperature: 0,
    stream: false,
  };
}

export type ChatOutcome =
  | { kind: 'content'; content: string; model?: string }
  | { kind: 'http'; status: number }
  | { kind: 'incomplete' }
  | { kind: 'timeout' }
  | { kind: 'network' };

interface Choice {
  finish_reason?: unknown;
  error?: unknown;
  message?: { content?: unknown };
}

export async function callChat(key: string, body: Record<string, unknown>, options: { fetch: typeof fetch; timeoutMs: number }): Promise<ChatOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const doFetch = options.fetch;
  try {
    const response = await doFetch(`${OPENROUTER}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { kind: 'http', status: response.status };
    const data = (await response.json()) as { model?: unknown; error?: unknown; choices?: unknown };
    const choice = Array.isArray(data.choices) ? (data.choices[0] as Choice | undefined) : undefined;
    const content = choice?.message?.content;
    if (data.error !== undefined || choice === undefined || choice.error !== undefined || choice.finish_reason !== 'stop' || typeof content !== 'string') {
      return { kind: 'incomplete' };
    }
    return typeof data.model === 'string' ? { kind: 'content', content, model: data.model } : { kind: 'content', content };
  } catch {
    return controller.signal.aborted ? { kind: 'timeout' } : { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/** What a failed call means for the person (spec §5.7), on the shared free key or the family's own. */
export function chatError(outcome: Exclude<ChatOutcome, { kind: 'content' }>, path: 'free' | 'family'): { error: AiError; scope?: QuotaScope } {
  if (outcome.kind === 'timeout') return { error: 'timeout' };
  if (outcome.kind !== 'http') return { error: 'model-failed' };
  switch (outcome.status) {
    case 401:
      return { error: path === 'free' ? 'unavailable' : 'key-invalid' };
    case 402:
      return { error: path === 'free' ? 'unavailable' : 'key-out-of-credit' };
    case 408:
      return { error: 'timeout' };
    case 429:
      return path === 'free' ? { error: 'quota-exceeded', scope: 'app' } : { error: 'model-failed' };
    default:
      return { error: 'model-failed' };
  }
}

export type KeyCheck = 'ok' | 'key-invalid' | 'key-out-of-credit' | 'unavailable';

/** Asks OpenRouter about a key before it is stored. Keeps nothing from the answer. */
export async function checkKey(key: string, options: { fetch: typeof fetch; timeoutMs: number }): Promise<KeyCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const doFetch = options.fetch;
  try {
    const response = await doFetch(`${OPENROUTER}/key`, { signal: controller.signal, headers: { authorization: `Bearer ${key}` } });
    if (response.status === 401) return 'key-invalid';
    if (!response.ok) return 'unavailable';
    const body = (await response.json()) as { data?: unknown };
    if (typeof body.data !== 'object' || body.data === null) return 'unavailable';
    const data = body.data as { is_management_key?: unknown; is_provisioning_key?: unknown; limit_remaining?: unknown };
    // A key that can create keys is not one to keep.
    if (data.is_management_key === true || data.is_provisioning_key === true) return 'key-invalid';
    if (typeof data.limit_remaining === 'number' && data.limit_remaining <= 0) return 'key-out-of-credit';
    return 'ok';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}
