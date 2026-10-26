/// <reference types="vitest" />
import { lookup } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import type { Connect, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createAiHandler } from './server/ai';
import { createImportHandler } from './server/import';
import { createPlacesHandler, defaultAddressProvider } from './server/places';
import { createSearchHandler } from './server/search';
import { createShowsHandler, defaultShowsProvider } from './server/shows';

/**
 * /api/import, /api/search, /api/shows, /api/places and /api/ai under
 * `npm run dev` and `vite preview`: the same handlers the Pages Functions run
 * in production. Import and AI are given Node's DNS, so they can also refuse
 * names that resolve to private addresses. Search is given the Tavily key from
 * .env.local, Shows its service's key (chosen in server/shows/provider.ts), and
 * AI its own keys and secret; without a VITE_ prefix they stay out of the
 * bundle. AI reaches Supabase through the project the app itself uses. Places
 * needs no key: its service is chosen in server/places/provider.ts.
 */
function apiRoutes(env: Record<string, string>): Plugin {
  const resolveHost = async (host: string): Promise<string[]> => (await lookup(host, { all: true })).map((entry) => entry.address);
  const routes = [
    { path: '/api/import', failed: 'fetch-failed', handler: createImportHandler({ resolveHost }) },
    { path: '/api/search', failed: 'search-failed', handler: createSearchHandler({ apiKey: env.TAVILY_API_KEY }) },
    { path: '/api/shows', failed: 'failed', handler: createShowsHandler({ provider: defaultShowsProvider(env) }) },
    { path: '/api/places', failed: 'places-failed', handler: createPlacesHandler({ provider: defaultAddressProvider() }) },
    {
      path: '/api/ai',
      failed: 'unavailable',
      // Locally the function reaches Supabase through the same project the app uses.
      handler: createAiHandler({
        resolveHost,
        openRouterKey: env.OPENROUTER_API_KEY,
        freeModels: env.OPENROUTER_FREE_MODELS,
        keySecret: env.AI_KEY_SECRET,
        supabaseUrl: env.VITE_SUPABASE_URL,
        supabaseKey: env.VITE_SUPABASE_ANON_KEY,
      }),
    },
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
          const authorization = req.headers.authorization;
          const request = new Request(`http://localhost${req.originalUrl ?? req.url ?? path}`, {
            method: req.method,
            headers: {
              'content-type': req.headers['content-type'] ?? 'application/json',
              ...(typeof authorization === 'string' ? { authorization } : {}),
            },
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
 * Gives every build an id: in the bundle as __APP_VERSION__, and beside it as
 * version.json, which a tab left open across a deploy reads to learn that it
 * runs an old build and should reload (src/app/update.ts). Builds only: the
 * dev server and tests have neither, and the check stays off there. The id is
 * when the build ran, so a rebuild of the same commit also counts as new.
 */
function buildVersion(): Plugin {
  const version = new Date().toISOString();
  return {
    name: 'nestead-build-version',
    apply: 'build',
    config: () => ({ define: { __APP_VERSION__: JSON.stringify(version) } }),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ version })}\n` });
    },
  };
}

/**
 * Builds src/app/sw.ts to /sw.js, the service worker that opens the app from a
 * kept copy when the network hangs (src/app/shellCache.ts). The browser fetches a
 * worker by a fixed name and runs it as one classic script, so the build fails
 * if it would import another file. Builds only, like the worker's registration.
 */
function serviceWorker(): Plugin {
  return {
    name: 'nestead-service-worker',
    apply: 'build',
    buildStart() {
      this.emitFile({ type: 'chunk', id: fileURLToPath(new URL('./src/app/sw.ts', import.meta.url)), fileName: 'sw.js' });
    },
    generateBundle(_options, bundle) {
      const worker = bundle['sw.js'];
      if (worker?.type !== 'chunk' || worker.imports.length > 0 || worker.dynamicImports.length > 0) {
        this.error('sw.js must be one file that imports nothing: src/app/sw.ts may import only src/app/shellCache.ts, which nothing else imports.');
      }
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
    plugins: [react(), apiRoutes(env), buildVersion(), serviceWorker()],
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
