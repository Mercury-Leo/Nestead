import { createShowsHandler } from '../../server/shows';

/**
 * Cloudflare Pages Function at /api/shows, deployed alongside search.ts. The
 * OMDb key is a secret on the Pages project, OMDB_API_KEY, and reaches the
 * function through its environment. All the work is in server/shows/.
 */
export const onRequest = (context: { request: Request; env: { OMDB_API_KEY?: string } }): Promise<Response> =>
  createShowsHandler({ apiKey: context.env.OMDB_API_KEY })(context.request);
