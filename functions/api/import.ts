import { handleImport } from '../../server/import';

/**
 * Cloudflare Pages Function at /api/import. `wrangler pages deploy` picks up
 * this folder alongside dist/, so it ships with every deploy. All the work is
 * in server/import/, which the Vite dev server also mounts.
 *
 * Cloudflare's fetch cannot reach private networks, and there is no DNS API
 * here, so the handler's address checks work from the URL alone.
 */
export const onRequest = (context: { request: Request }): Promise<Response> => handleImport(context.request);
