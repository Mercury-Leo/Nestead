/**
 * The dev-only en-XA pseudo-locale, made from en.json at startup. Every string
 * is wrapped in [!! … !!], its vowels accented and padded about 30% longer,
 * and the locale is right to left. Plain English on screen is a string that
 * missed the translation file; anything that clips will clip in a longer
 * language too.
 *
 * Interpolations ({{count}}), <Trans> tags (<strong>, <1>) and $t() nesting
 * are left alone so they still work.
 */

const ACCENTS: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' };
const PROTECTED = /(\{\{[^}]*\}\}|<\/?[\w]+\s*\/?>|\$t\([^)]*\))/;

export function pseudoString(text: string): string {
  let visible = 0;
  const body = text
    .split(PROTECTED)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      visible += part.length;
      return part.replace(/[aeiouAEIOU]/g, (vowel) => ACCENTS[vowel] ?? vowel);
    })
    .join('');
  const pad = '~'.repeat(Math.max(1, Math.round(visible * 0.3)));
  return `[!! ${body} ${pad} !!]`;
}

export function pseudoLocalize<T>(value: T): T {
  if (typeof value === 'string') return pseudoString(value) as T;
  if (Array.isArray(value)) return value.map((item) => pseudoLocalize(item)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, pseudoLocalize(item)])) as T;
  }
  return value;
}
