import { fetchPage } from './fetchPage';
import { parseRecipeHtml } from './parse';
import type { ImportError, ImportOptions } from './types';

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const STATUS: Record<ImportError, number> = {
  'invalid-url': 400,
  blocked: 400,
  'fetch-failed': 502,
  'too-large': 413,
  'not-found': 422,
  timeout: 504,
};

export function createImportHandler(options: ImportOptions = {}): (request: Request) => Promise<Response> {
  const settings = { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, ...options };
  return async (request) => {
    let target: string | null = null;
    if (request.method === 'POST') {
      try {
        const body = (await request.json()) as { url?: unknown };
        target = typeof body.url === 'string' ? body.url.trim() : null;
      } catch {
        target = null;
      }
    } else if (request.method === 'GET') {
      target = new URL(request.url).searchParams.get('url');
    } else {
      return json({ error: 'method' }, 405);
    }
    if (target === null || target === '') return json({ error: 'invalid-url' }, 400);

    const page = await fetchPage(target, settings);
    if (typeof page === 'string') return json({ error: page }, STATUS[page]);
    const parsed = parseRecipeHtml(page.html, page.url);
    if (parsed === null) return json({ error: 'not-found' }, STATUS['not-found']);
    return json(parsed);
  };
}

export const handleImport = createImportHandler();
