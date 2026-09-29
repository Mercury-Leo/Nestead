// What ends up in each chunk of a build, and how big it is on the wire.
//
//   node scripts/perf/bundle.mjs <mode> <outDir> [result.json]
//
// <mode> is "production" (the Supabase build, needs .env.local) or "demo".
// Builds through Vite's API with one extra plugin that records every module's
// rendered size per chunk, then compresses each emitted file the way a CDN
// would. Brotli is quality 11 and gzip level 9: the ceiling, not whatever
// level Cloudflare picks, so compare runs with each other rather than with
// what a browser reports.

import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { build } from 'vite';

const [mode = 'production', outDirArg, jsonOut] = process.argv.slice(2);
if (outDirArg === undefined) throw new Error('usage: node scripts/perf/bundle.mjs <mode> <outDir> [result.json]');
const outDir = resolve(outDirArg);
const root = process.cwd();

/** node_modules/@scope/name/... -> @scope/name; src/features/larder/x.ts -> src/features/larder. */
function groupOf(id) {
  const clean = id.replace(/^\0/, '').split('?')[0].replace(/\\/g, '/');
  const nm = clean.lastIndexOf('/node_modules/');
  if (nm !== -1) {
    const parts = clean.slice(nm + '/node_modules/'.length).split('/');
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  const rel = relative(root, clean).replace(/\\/g, '/');
  if (rel.startsWith('..')) return clean;
  const parts = rel.split('/');
  return parts.length > 3 ? parts.slice(0, 3).join('/') : parts.slice(0, -1).join('/') || rel;
}

const chunks = {};

await build({
  mode,
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true },
  plugins: [
    {
      name: 'perf-module-sizes',
      generateBundle(_options, bundle) {
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type !== 'chunk') continue;
          const groups = {};
          for (const [id, info] of Object.entries(chunk.modules)) {
            const group = groupOf(id);
            groups[group] = (groups[group] ?? 0) + info.renderedLength;
          }
          chunks[fileName] = {
            isEntry: chunk.isEntry,
            isDynamicEntry: chunk.isDynamicEntry,
            imports: chunk.imports,
            groups: Object.fromEntries(Object.entries(groups).sort((a, b) => b[1] - a[1])),
          };
        }
      },
    },
  ],
});

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(outDir).map((path) => {
  const bytes = readFileSync(path);
  const name = relative(outDir, path).replace(/\\/g, '/');
  const compressible = /\.(js|css|html|json|svg|webmanifest)$/.test(name);
  return {
    name,
    raw: bytes.length,
    gzip: compressible ? gzipSync(bytes, { level: 9 }).length : bytes.length,
    brotli: compressible
      ? brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
      : bytes.length,
  };
});

// What the first screen needs: index.html, the entry chunk, what it imports
// statically (Vite preloads those), and the stylesheets index.html links.
const html = readFileSync(join(outDir, 'index.html'), 'utf8');
const linked = [...html.matchAll(/(?:src|href)="\/([^"]+\.(?:js|css))"/g)].map((match) => match[1]);
const entry = Object.keys(chunks).find((name) => chunks[name].isEntry);
const firstLoad = new Set(['index.html', ...linked]);
const queue = [entry];
while (queue.length > 0) {
  const name = queue.pop();
  if (name === undefined || firstLoad.has(name) && name !== entry) continue;
  firstLoad.add(name);
  for (const imported of chunks[name]?.imports ?? []) if (!firstLoad.has(imported)) queue.push(imported);
}

const sum = (list, key) => list.reduce((total, file) => total + file[key], 0);
const first = files.filter((file) => firstLoad.has(file.name));
const fonts = files.filter((file) => /\.(woff2?|ttf)$/.test(file.name));

const result = {
  mode,
  entry,
  firstLoad: {
    files: first.map((file) => file.name),
    raw: sum(first, 'raw'),
    gzip: sum(first, 'gzip'),
    brotli: sum(first, 'brotli'),
  },
  js: { raw: sum(files.filter((f) => f.name.endsWith('.js')), 'raw'), brotli: sum(files.filter((f) => f.name.endsWith('.js')), 'brotli') },
  fonts: { count: fonts.length, raw: sum(fonts, 'raw') },
  files: files.sort((a, b) => b.raw - a.raw),
  chunks,
};

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`${mode}: entry ${entry}`);
console.log(`first load (${first.length} files): raw ${kb(result.firstLoad.raw)}, gzip ${kb(result.firstLoad.gzip)}, brotli ${kb(result.firstLoad.brotli)}`);
for (const file of first) console.log(`  ${file.name.padEnd(48)} raw ${kb(file.raw).padStart(10)}  br ${kb(file.brotli).padStart(9)}`);
console.log(`all JS: raw ${kb(result.js.raw)}, brotli ${kb(result.js.brotli)}; fonts: ${fonts.length} files, ${kb(result.fonts.raw)}`);
console.log(`entry chunk by source (rendered, before minification):`);
for (const [group, size] of Object.entries(chunks[entry].groups).slice(0, 25)) console.log(`  ${group.padEnd(48)} ${kb(size).padStart(10)}`);

if (jsonOut !== undefined) {
  mkdirSync(dirname(resolve(jsonOut)), { recursive: true });
  writeFileSync(jsonOut, JSON.stringify(result, null, 2));
}
