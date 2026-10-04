import { createShowsHandler, defaultShowsProvider } from '../../server/shows';
import type { ShowsEnv } from '../../server/shows';

/**
 * Cloudflare Pages Function at /api/shows, deployed alongside search.ts. The
 * service is chosen in server/shows/provider.ts; its key is a secret on the
 * Pages project (OMDB_API_KEY today) and reaches the function through its
 * environment. All the work is in server/shows/.
 */
export const onRequest = (context: { request: Request; env: ShowsEnv }): Promise<Response> =>
  createShowsHandler({ provider: defaultShowsProvider(context.env) })(context.request);
