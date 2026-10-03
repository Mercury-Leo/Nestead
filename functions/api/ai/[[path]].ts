import { createAiHandler } from '../../../server/ai';

/**
 * Cloudflare Pages Function for /api/ai/extract and /api/ai/key. The file name
 * is a catch-all: functions/api/ai.ts would match /api/ai alone. All the work
 * is in server/ai/. The keys and the secret are Pages secrets; the Supabase URL
 * and publishable key are plain Pages variables, since the VITE_ ones exist
 * only for the build.
 *
 * There is no DNS API on Workers, so no resolveHost is given and the importer's
 * guard judges a URL alone (see functions/api/import.ts).
 */
interface Env {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_FREE_MODELS?: string;
  AI_KEY_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

/**
 * Made on the first request and kept for the life of the isolate. The env does
 * not change inside one (a new Pages variable takes a new deploy), and the
 * handler warns once, when it is made, about the OPENROUTER_FREE_MODELS entries
 * it drops: built per request, that would be a warning on every read.
 */
let handler: ((request: Request) => Promise<Response>) | null = null;

export const onRequest = (context: { request: Request; env: Env }): Promise<Response> => {
  handler ??= createAiHandler({
    openRouterKey: context.env.OPENROUTER_API_KEY,
    freeModels: context.env.OPENROUTER_FREE_MODELS,
    keySecret: context.env.AI_KEY_SECRET,
    supabaseUrl: context.env.SUPABASE_URL,
    supabaseKey: context.env.SUPABASE_ANON_KEY,
  });
  return handler(context.request);
};
