/**
 * Finding times in step text: "sear 8 min" becomes a tap-to-start timer in
 * cook mode. Durations are never stored; they are read from the words.
 */

export interface DetectedDuration {
  /** Offsets into the text of the whole phrase, verb included. */
  start: number;
  end: number;
  /** "bake 50 min", "8–10 min", "1 min". */
  phrase: string;
  /** Timer length. A range uses its lower bound. */
  seconds: number;
  /**
   * "Oven", "Sear", or "Step 3".
   * i18n: English words shown as they are (timer tray, done banner). The verb comes from the step's own text.
   */
  label: string;
}

const VERBS = [
  'bake',
  'roast',
  'sear',
  'simmer',
  'boil',
  'cook',
  'toast',
  'chill',
  'rest',
  'marinate',
  'fry',
  'steam',
  'soak',
  'rise',
  'proof',
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const VULGAR: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

const NUM = String.raw`(?:\d+(?:[.,]\d+)?\s*[¼½¾⅓⅔]?|[¼½¾⅓⅔]|\d+\/\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)`;
const UNIT = String.raw`(?:hours?|hrs?|h|minutes?|mins?|m(?![a-z])|seconds?|secs?|s)`;
const PART = String.raw`(${NUM})(?:\s*(?:-|–|—|to)\s*(${NUM}))?\s*(${UNIT})\b`;
// An optional second part: "1 hour 15 minutes", "1 h 20 min".
const DURATION = new RegExp(String.raw`\b${PART}(?:\s*(?:and\s+)?(\d+)\s*(${UNIT})\b)?`, 'gi');

function toNumber(text: string): number {
  const value = text.trim().toLowerCase();
  const word = NUMBER_WORDS[value];
  if (word !== undefined) return word;
  const vulgarOnly = VULGAR[value];
  if (vulgarOnly !== undefined) return vulgarOnly;
  const fraction = /^(\d+)\/(\d+)$/.exec(value);
  if (fraction !== null) return Number(fraction[1]) / Number(fraction[2]);
  const withVulgar = /^(\d+(?:[.,]\d+)?)\s*([¼½¾⅓⅔])$/.exec(value);
  if (withVulgar !== null) return Number((withVulgar[1] as string).replace(',', '.')) + (VULGAR[withVulgar[2] as string] ?? 0);
  return Number(value.replace(',', '.'));
}

function unitSeconds(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith('h')) return 3600;
  if (u.startsWith('m')) return 60;
  return 1;
}

function sentenceAround(text: string, start: number, end: number): string {
  const before = text.slice(0, start);
  const from = Math.max(before.lastIndexOf('. '), before.lastIndexOf('; ')) + 1;
  const after = text.slice(end).search(/[.;](\s|$)/);
  return text.slice(from, after === -1 ? text.length : end + after);
}

/**
 * @param stepNumber 1-based, used for the "Step N" label when no verb is found.
 */
export function detectDurations(text: string, stepNumber = 1): DetectedDuration[] {
  const found: DetectedDuration[] = [];
  DURATION.lastIndex = 0;

  for (let match = DURATION.exec(text); match !== null; match = DURATION.exec(text)) {
    // The range's upper bound (group 2) is only ever shown, never timed.
    const [whole, first, , unit, extraNumber, extraUnit] = match as unknown as [
      string,
      string,
      string | undefined,
      string,
      string | undefined,
      string | undefined,
    ];

    // "a" and "an" only count when followed by a time word, never alone.
    const amount = toNumber(first);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    // "s" and "m" alone are too easy to misread ("2 s" is rare, "3 m" is metres).
    if (/^(s|m)$/i.test(unit) && !/\d/.test(first)) continue;

    let seconds = amount * unitSeconds(unit);
    if (extraNumber !== undefined && extraUnit !== undefined) {
      seconds += Number(extraNumber) * unitSeconds(extraUnit);
    }
    seconds = Math.round(seconds);

    let start = match.index;
    const end = match.index + whole.length;

    // A cooking verb directly before, within two words: "sear 8 min",
    // "simmer for 15 min".
    const before = text.slice(0, start);
    const words = /(\S+)\s+(?:(\S+)\s+)?$/.exec(before);
    let verb: string | undefined;
    if (words !== null) {
      // words[2] is the nearer word when there are two.
      const nearestFirst = words[2] !== undefined ? [words[2], words[1]] : [words[1]];
      for (const candidate of nearestFirst) {
        if (candidate === undefined) continue;
        const bare = candidate.toLowerCase().replace(/[^a-z]/g, '');
        if (VERBS.includes(bare)) {
          verb = bare;
          start = before.lastIndexOf(candidate);
          break;
        }
      }
    }

    // A specific verb wins over an oven mentioned elsewhere in the sentence:
    // "bake 50 min in the oven … and chill 15 min" is an Oven timer and a
    // Chill timer. Only a bare time or a generic "cook" borrows the oven.
    const inOven = /\boven\b/i.test(sentenceAround(text, match.index, end));
    let label: string;
    if (verb === 'bake' || verb === 'roast') label = 'Oven';
    else if (verb !== undefined && verb !== 'cook') label = verb.charAt(0).toUpperCase() + verb.slice(1);
    else if (inOven) label = 'Oven';
    else if (verb === 'cook') label = 'Cook';
    else label = `Step ${stepNumber}`;

    found.push({
      start,
      end,
      phrase: text.slice(start, end),
      seconds,
      label,
    });
  }
  return found;
}
