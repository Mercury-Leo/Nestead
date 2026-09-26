import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A rough net for interface text that skipped the translation file: English
 * between JSX tags, in the attributes people read (aria-label, placeholder,
 * title, alt and our own label props), and sentence-like string literals in
 * screen code. It is a set of patterns, not a parser, so it errs towards
 * quiet; walking the app in a second language is the thorough check.
 *
 * To keep English on purpose, put an `i18n:` comment on the line or the line
 * above saying why, or add the text to ALLOWED.
 */

const SRC = join(__dirname, '..');

/**
 * Seed and demo data, the domain's own language, and this folder are not
 * interface code. labels.ts maps the domain's stored English names to keys,
 * so it names them on purpose.
 */
const SKIP = [/^domain[\\/]/, /^data[\\/]/, /[\\/]seed[\\/]/, /^i18n[\\/]/, /defaultColumns\.ts$/, /larder[\\/]labels\.ts$/, /\.test\.tsx?$/, /\.d\.ts$/];

const ALLOWED = new Set([
  // The product's name.
  'Nestead',
  // Developer-facing console output.
  'Screen failed to render:',
  'Kitchen not set up:',
  'Could not add the default staples:',
]);

const ATTRIBUTES = ['aria-label', 'placeholder', 'title', 'alt', 'label', 'removeLabel', 'subtitle', 'caption', 'suffix', 'display'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Blanks out comments, keeping line numbers, so their English is not reported. */
function stripComments(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, (m, before: string) => before + ' '.repeat(m.length - before.length));
}

const WORDS = /[A-Za-z]{2,}/;

function findings(): string[] {
  const found: string[] = [];
  for (const path of files(SRC)) {
    const file = relative(SRC, path);
    if (SKIP.some((pattern) => pattern.test(file))) continue;
    const raw = readFileSync(path, 'utf8').split(/\r?\n/);
    const lines = stripComments(raw.join('\n')).split('\n');
    const tsx = path.endsWith('.tsx');

    lines.forEach((line, index) => {
      if ((raw[index] ?? '').includes('i18n:') || (raw[index - 1] ?? '').includes('i18n:')) return;
      if (/^\s*import\b|console\./.test(line)) return;
      const report = (text: string): void => {
        const clean = text.trim();
        if (clean !== '' && WORDS.test(clean) && !ALLOWED.has(clean)) found.push(`${file}:${index + 1}: ${clean}`);
      };

      if (tsx) {
        // Text between tags on one line: <p>Hello there</p>, </strong> checked off
        // Not after => (a return type like Promise<void>) or /> (the next prop after a self-closing value).
        for (const match of line.matchAll(/(?<![=/-])>([^<>{}()=;`]+)</g)) report(match[1] as string);
        // A line that is nothing but JSX text, inside a multi-line element.
        const trimmed = line.trim();
        if (/^[A-Z][A-Za-z’',.…!? —–-]*$/.test(trimmed) && /\s|…|[.?!]$/.test(trimmed) === true) report(trimmed);
        if (/^[A-Z][a-z]+$/.test(trimmed) && /[>)]\s*$/.test(lines[index - 1] ?? '') && /^\s*<\//.test(lines[index + 1] ?? '')) report(trimmed);
        // Attributes people read.
        for (const match of line.matchAll(new RegExp(`\\b(?:${ATTRIBUTES.join('|')})="([^"]*)"`, 'g'))) report(match[1] as string);
      }
      // Sentence-like string literals: 'Something went wrong', 'Loading…'.
      for (const match of line.matchAll(/(['"])([A-Z][a-z’]*(?: [^'"]*|…)[^'"]*)\1/g)) report(match[2] as string);
    });
  }
  return found;
}

describe('interface text', () => {
  it('comes from the translation file', () => {
    expect(findings()).toEqual([]);
  });

  it('would notice a stray string', () => {
    // Guards the patterns: these must all be caught.
    const probe = [
      '<p>Nothing to see here</p>',
      "<Button aria-label=\"Close the sheet\" />",
      "const title = desktop ? 'Total time' : 'Total';",
    ].join('\n');
    const lines = probe.split('\n');
    const hits = lines.filter((line) => />([^<>{}()=;`]+)</.test(line) || /aria-label="[^"]*"/.test(line) || /(['"])([A-Z][a-z’]*(?: [^'"]*|…)[^'"]*)\1/.test(line));
    expect(hits).toHaveLength(3);
  });
});
