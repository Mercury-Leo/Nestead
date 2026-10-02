import { createSearchHandler } from '../../server/search';

/**
 * Cloudflare Pages Function at /api/search, deployed alongside import.ts. The
 * Tavily key is a secret on the Pages project, TAVILY_API_KEY, and reaches the
 * function through its environment. All the work is in server/search/.
 */
export const onRequest = (context: { request: Request; env: { TAVILY_API_KEY?: string } }): Promise<Response> =>
  createSearchHandler({ apiKey: context.env.TAVILY_API_KEY })(context.request);
