/// <reference types="vitest" />
import { lookup } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv } from 'vite';
import type { Connect, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createImportHandler } from './server/import';
import { createSearchHandler } from './server/search';

/**
 * /api/import and /api/search under `npm run dev` and `vite preview`: the same
 * handlers the Pages Functions run in production. Import is given Node's DNS,
 * so it can also refuse names that resolve to private addresses. Search is
 * given the Tavily key from .env.local; without a VITE_ prefix it stays out of
 * the bundle.
 */
function apiRoutes(tavilyKey: string | undefined): Plugin {
  const routes = [
    {
      path: '/api/import',
      failed: 'fetch-failed',
      handler: createImportHandler({
        resolveHost: async (host) => (await lookup(host, { all: true })).map((entry) => entry.address),
      }),
    },
    { path: '/api/search', failed: 'search-failed', handler: createSearchHandler({ apiKey: tavilyKey }) },
  ];

  const readBody = (req: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

  const mount = (middlewares: Connect.Server): void => {
    for (const { path, failed, handler } of routes) {
      middlewares.use(path, (req, res) => {
        void (async () => {
          const body = req.method === 'POST' ? new Uint8Array(await readBody(req)) : undefined;
          const request = new Request(`http://localhost${req.originalUrl ?? req.url ?? path}`, {
            method: req.method,
            headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
            body,
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        })().catch(() => {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: failed }));
        });
      });
    }
  };

  return {
    name: 'nestead-api',
    configureServer(server) {
      mount(server.middlewares);
    },
    configurePreviewServer(server) {
      mount(server.middlewares);
    },
  };
}

/**
 * Refuses a production build that would ship demo mode.
 *
 * VITE_BACKEND is inlined at build time and falls back to "local" when unset,
 * so a build from anywhere without .env.local (a fresh clone, CI) would quietly
 * deploy the no-accounts demo: pick-who-you-are, data in the browser only. For
 * a deliberate demo build, use another mode: `npx vite build --mode demo`.
 */
function requireRealBackend(mode: string): void {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const problems: string[] = [];

  if (env.VITE_BACKEND !== 'supabase') {
    problems.push(`VITE_BACKEND is ${env.VITE_BACKEND === undefined ? 'unset' : `"${env.VITE_BACKEND}"`}, not "supabase"`);
  }
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
    if ((env[name] ?? '').trim() === '') problems.push(`${name} is empty`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing a production build that would ship demo mode:\n  - ${problems.join('\n  - ')}\n` +
        'Set them in .env.local or the build environment. For a deliberate demo build, run `npx vite build --mode demo`.',
    );
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') requireRealBackend(mode);
  // Every variable, for the server side only: envPrefix below still decides
  // what reaches the bundle.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), apiRoutes(env.TAVILY_API_KEY)],
    build: {
      rollupOptions: {
        output: {
          // Libraries change far less often than the app. In chunks of their
          // own they stay cached on every device through a deploy that only
          // touched app code, instead of coming down again inside the entry.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules[\\/](@supabase|iceberg-js)[\\/]/.test(id)) return 'supabase';
            if (/node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/.test(id)) return 'react';
            if (/node_modules[\\/](i18next|react-i18next|html-parse-stringify|void-elements)[\\/]/.test(id)) return 'i18n';
            return undefined;
          },
        },
      },
    },
    // SUPABASE_TEST_* live in .env.test, which Vite only loads in test mode, so
    // they never reach a production build. Do not put them in .env.local, which
    // IS loaded for builds and would inline them into the public bundle.
    envPrefix: ['VITE_', 'SUPABASE_TEST_'],
    test: {
      environment: 'jsdom',
    },
  };
});
