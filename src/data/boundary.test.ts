import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Keeps Supabase swappable: only its adapter, src/data/supabase/, may import
 * the Supabase SDK or anything from that folder. Everything else talks to the
 * DataStore and Account interfaces in types.ts.
 *
 * The one exception is src/auth/session.tsx, the swap point, which names the
 * backend's Account and nothing else from it.
 */

const ROOT = join(__dirname, '..', '..');

/** The only importer of the adapter outside it, and the one name it may take. */
const SWAP_POINT = 'src/auth/session.tsx';
const SWAP_IMPORT = /import \{ supabaseAccount \} from '\.\.\/data\/supabase\/supabaseAccount';/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const IMPORT = /^\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm;

function leaks(): string[] {
  const found: string[] = [];
  for (const path of ['src', 'server', 'functions'].flatMap((dir) => files(join(ROOT, dir)))) {
    const file = relative(ROOT, path).replace(/\\/g, '/');
    if (file.startsWith('src/data/supabase/')) continue;
    const text = readFileSync(path, 'utf8');
    for (const [, source] of text.matchAll(IMPORT)) {
      if (!/@supabase\/|\/supabase\//.test(source!)) continue;
      if (file === SWAP_POINT && SWAP_IMPORT.test(text) && source === '../data/supabase/supabaseAccount') continue;
      found.push(`${file}: ${source}`);
    }
  }
  return found;
}

describe('backend boundary', () => {
  it('only src/data/supabase/ knows about Supabase, besides the swap point', () => {
    expect(leaks()).toEqual([]);
  });
});
