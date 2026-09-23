/// <reference types="vitest" />
import { lookup } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import { defineConfig } from 'vite';
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

export default defineConfig({
  plugins: [react(), recipeImport()],
  // SUPABASE_TEST_* live in .env.test, which Vite only loads in test mode, so
  // they never reach a production build. Do not put them in .env.local, which
  // IS loaded for builds and would inline them into the public bundle.
  envPrefix: ['VITE_', 'SUPABASE_TEST_'],
  test: {
    environment: 'jsdom',
  },
});
