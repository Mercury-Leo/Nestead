/**
 * AI recipe reading: POST /api/ai/extract and POST /api/ai/key. Framework-
 * agnostic, (request: Request) => Promise<Response>, run as the Pages Function
 * functions/api/ai/[[path]].ts and by vite.config.ts in dev and preview. No
 * dependencies: OpenRouter and Supabase over fetch, AES-GCM over WebCrypto.
 */

export { MAX_TEXT, createAiHandler } from './handler';
export type { AiError, AiLogEntry, AiOptions, AiStore, ClaimResult, QuotaScope } from './types';
