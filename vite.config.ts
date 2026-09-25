/// <reference types="vitest" />
import { lookup } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createImportHandler } from './server/import';

/**
 * /api/import in development: the same handler the Pages Function runs in
 * production, given Node's DNS so it can also refuse names that resolve to
 * private addresses.
 */
function recipeImport(): Plugin {
  const handler = createImportHandler({
    resolveHost: async (host) => (await lookup(host, { all: true })).map((entry) => entry.address),
  });

  const readBody = (req: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

  return {
    name: 'nestead-recipe-import',
    configureServer(server) {
      server.middlewares.use('/api/import', (req, res) => {
        void (async () => {
          const body = req.method === 'POST' ? new Uint8Array(await readBody(req)) : undefined;
          const request = new Request(`http://localhost${req.originalUrl ?? req.url ?? '/api/import'}`, {
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
          res.end(JSON.stringify({ error: 'fetch-failed' }));
        });
      });
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

  return {
    plugins: [react(), recipeImport()],
    // SUPABASE_TEST_* live in .env.test, which Vite only loads in test mode, so
    // they never reach a production build. Do not put them in .env.local, which
    // IS loaded for builds and would inline them into the public bundle.
    envPrefix: ['VITE_', 'SUPABASE_TEST_'],
    test: {
      environment: 'jsdom',
    },
  };
});
