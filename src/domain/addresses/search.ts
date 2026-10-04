import type { Address } from '../types';

/*
 * Fuzzy search over the address book: by name, street or city, forgiving
 * partial words, typos, accents and Hebrew vowel points. The apartment and door
 * code are never searched.
 *
 * Every query word must match some word of the name, the street or the city. A word
 * matches, best first, exactly, as a prefix, inside a word, or with a typo:
 * Damerau-Levenshtein distance 1 for words of 4 to 7 letters, 2 from 8, against
 * the whole word or its start of the same length. Words under 4 letters never
 * match by typo, or "ab" would find half the book.
 */

const EXACT = 4;
const PREFIX = 3;
const INSIDE = 2;
const TYPO = 1;

/** Hebrew final letters, folded to their ordinary forms so a word typed halfway still matches. */
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/**
 * Lower case, no accents, no niqqud or cantillation, the maqaf a space, Hebrew
 * final letters as ordinary ones, the geresh, gershayim and apostrophes dropped
 * (so "צ׳" and "צ'" read the same), and every other mark a word break.
 */
export function foldWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/־/g, ' ')
    .replace(/[֑-ׇ]/g, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (letter) => FINALS[letter] ?? letter)
    .replace(/['’`׳״"]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((word) => word !== '');
}

/** Damerau-Levenshtein distance (optimal string alignment), giving up past `limit`. */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, before[j - 2]! + 1);
      }
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    before = previous;
    previous = current;
  }
  return previous[b.length]!;
}

/** How well one query word matches one word of a field: 0 is not at all. */
function wordScore(query: string, word: string): number {
  if (word === query) return EXACT;
  if (word.startsWith(query)) return PREFIX;
  if (word.includes(query)) return INSIDE;
  if (query.length < 4) return 0;
  const limit = query.length >= 8 ? 2 : 1;
  const close =
    editDistance(query, word, limit) <= limit ||
    (word.length > query.length && editDistance(query, word.slice(0, query.length), limit) <= limit);
  return close ? TYPO : 0;
}

function fieldScore(query: string, words: readonly string[]): number {
  let best = 0;
  for (const word of words) best = Math.max(best, wordScore(query, word));
  return best;
}

/**
 * The addresses that match `query`, best first. Ties go to the one matched more
 * in its name, then more in its street rather than its city, then by name in
 * the locale's order. An empty query returns every address, by name.
 */
export function searchAddresses<T extends Pick<Address, 'name' | 'street' | 'city'>>(
  addresses: readonly T[],
  query: string,
  locale: string,
): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const byName = (a: T, b: T): number => collator.compare(a.name, b.name);
  const queryWords = foldWords(query);
  if (queryWords.length === 0) return [...addresses].sort(byName);

  const ranked: { address: T; score: number; inName: number; inStreet: number }[] = [];
  for (const address of addresses) {
    const nameWords = foldWords(address.name);
    const streetWords = foldWords(address.street);
    const cityWords = foldWords(address.city);
    let score = 0;
    let inName = 0;
    let inStreet = 0;
    let matched = true;
    for (const word of queryWords) {
      const name = fieldScore(word, nameWords);
      const street = fieldScore(word, streetWords);
      const city = fieldScore(word, cityWords);
      const best = Math.max(name, street, city);
      if (best === 0) {
        matched = false;
        break;
      }
      score += best;
      // A word counts for the field it matched best, the name first on a tie.
      if (name === best) inName += 1;
      else if (street === best) inStreet += 1;
    }
    if (matched) ranked.push({ address, score, inName, inStreet });
  }
  ranked.sort(
    (a, b) => b.score - a.score || b.inName - a.inName || b.inStreet - a.inStreet || byName(a.address, b.address),
  );
  return ranked.map((entry) => entry.address);
}
