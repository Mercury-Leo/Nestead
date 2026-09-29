// What a device that already has the app downloads again after a deploy that
// changed only app code, not libraries.
//
//   node scripts/perf/redeploy.mjs <scratchDir> [mode] [label]
//
// Builds twice (mode "production" by default, the Supabase build): once as the
// code stands, once with one attribute added to the board page, which is put
// back afterwards. Files whose hashed names changed are what the second deploy
// makes every device fetch again; brotli quality 11 sizes them. The builds are
// left in <scratchDir>/<label>-a and -b for `pageload.mjs --after`.

import { brotliCompressSync, constants } from 'node:zlib';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';

const [scratch, mode = 'production', label = 'redeploy'] = process.argv.slice(2);
if (scratch === undefined) throw new Error('usage: node scripts/perf/redeploy.mjs <scratchDir> [mode] [label]');
const PAGE = 'src/features/board/BoardPage.tsx';
const BEFORE = '<div className="app">';
const AFTER = '<div className="app" data-deploy="next">';

async function buildTo(outDir) {
  await build({ mode, logLevel: 'error', build: { outDir, emptyOutDir: true } });
  return new Map(readdirSync(join(outDir, 'assets')).map((name) => [name, join(outDir, 'assets', name)]));
}

const first = await buildTo(resolve(scratch, `${label}-a`));
const source = readFileSync(PAGE, 'utf8');
if (!source.includes(BEFORE)) throw new Error(`${PAGE} no longer has ${BEFORE}; pick another harmless change`);
let second;
try {
  writeFileSync(PAGE, source.replace(BEFORE, AFTER));
  second = await buildTo(resolve(scratch, `${label}-b`));
} finally {
  writeFileSync(PAGE, source);
}

const size = (path) => brotliCompressSync(readFileSync(path), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const code = (name) => /\.(js|css)$/.test(name);
const changed = [...second.keys()].filter((name) => code(name) && !first.has(name));
const all = [...second.keys()].filter(code);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const changedBytes = changed.reduce((sum, name) => sum + size(second.get(name)), 0);
const allBytes = all.reduce((sum, name) => sum + size(second.get(name)), 0);
console.log(`${mode}: an app-only deploy changes ${changed.length} of ${all.length} JS/CSS files, ${kb(changedBytes)} of ${kb(allBytes)} brotli`);
for (const name of changed) console.log(`  ${name.padEnd(40)} ${kb(size(second.get(name)))}`);
