import { checkUrl } from './guard';
import type { ImportError, ImportOptions } from './types';

const MAX_REDIRECTS = 5;

async function readCapped(response: Response, maxBytes: number): Promise<string | 'too-large'> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return 'too-large';
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return 'too-large';
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(all);
}

/** Fetches a page, re-checking every redirect against the guard, within the time and size limits. */
export async function fetchPage(start: string, options: Required<Pick<ImportOptions, 'timeoutMs' | 'maxBytes'>> & ImportOptions): Promise<{ html: string; url: string } | ImportError> {
  const doFetch = options.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    let url = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const problem = await checkUrl(url, options.resolveHost);
      if (problem !== null) return problem;
      const response = await doFetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'Mozilla/5.0 (compatible; NesteadRecipeImport/1.0)',
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location === null) return 'fetch-failed';
        url = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) return 'fetch-failed';
      const html = await readCapped(response, options.maxBytes);
      if (html === 'too-large') return 'too-large';
      return { html, url };
    }
    return 'fetch-failed';
  } catch (error) {
    return controller.signal.aborted ? 'timeout' : error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'fetch-failed';
  } finally {
    clearTimeout(timer);
  }
}
