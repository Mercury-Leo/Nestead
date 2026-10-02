import type { IngredientLine, Unit } from '../types';
import { canonicalId } from './normalize';

/**
 * parseIngredientLine: "1½ tsp fine salt (plus a pinch for the sauce)" ->
 * { qty: 1.5, unit: 'tsp', item: 'fine salt', note: 'plus a pinch for the sauce' }.
 */

const UNIT_WORDS: Record<string, Exclude<Unit, null>> = {
  g: 'g',
  gr: 'g',
  gram: 'g',
  grams: 'g',
  gramme: 'g',
  grammes: 'g',
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  tsp: 'tsp',
  tsps: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  tbs: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  cup: 'cup',
  cups: 'cup',
  pinch: 'pinch',
  pinches: 'pinch',
  clove: 'clove',
  cloves: 'clove',
  can: 'can',
  cans: 'can',
  tin: 'can',
  tins: 'can',
  bunch: 'bunch',
  bunches: 'bunch',
  head: 'head',
  heads: 'head',
  slice: 'slice',
  slices: 'slice',
  sheet: 'sheet',
  sheets: 'sheet',
};

/** Imperial amounts are converted, since the app is metric only. */
const IMPERIAL: Record<string, { factor: number; unit: 'g' | 'ml' }> = {
  oz: { factor: 28.35, unit: 'g' },
  ounce: { factor: 28.35, unit: 'g' },
  ounces: { factor: 28.35, unit: 'g' },
  lb: { factor: 453.6, unit: 'g' },
  lbs: { factor: 453.6, unit: 'g' },
  pound: { factor: 453.6, unit: 'g' },
  pounds: { factor: 453.6, unit: 'g' },
  'fl oz': { factor: 29.57, unit: 'ml' },
  quart: { factor: 946, unit: 'ml' },
  quarts: { factor: 946, unit: 'ml' },
  pint: { factor: 473, unit: 'ml' },
  pints: { factor: 473, unit: 'ml' },
};

const VULGAR: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
  '⅕': 0.2,
};

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
  eleven: 11,
  twelve: 12,
  half: 0.5,
};

/** Amounts nobody can shop for. The line keeps its item and asks for a fix. */
const VAGUE = /^(?:a |an |some |few |a few )?(?:big |large |small |generous |good )?(?:handful|handfuls|splash|drizzle|dash|few|knob|sprig|sprigs|sprinkle|glug|bit|little|some)(?: of)?\s+/i;

const NOTE_ONLY = /\b(to taste|as needed|for serving|to serve|for garnish|to garnish|optional)\b/i;

const VULGAR_CLASS = Object.keys(VULGAR).join('');
// A number: "1 1/2", "1½", "1/2", "0.5", "½", "12".
const NUMBER = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\s*[${VULGAR_CLASS}]|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?|[${VULGAR_CLASS}])`;
const QTY_RE = new RegExp(`^(${NUMBER})(?:\\s*(?:-|–|—|to)\\s*(${NUMBER}))?\\s*`);

/* ------------------------------------------------------------- Hebrew -- */

/*
 * Hebrew amounts: "2 כוסות קמח", "חצי כוס סוכר", "3-4 שיני שום". Hebrew has no
 * "a", so a unit in the singular with no number is one: "כף רסק עגבניות" is a
 * tablespoon of tomato paste. Item names stay as written; normalize.ts reads
 * Latin letters only, so they match nothing in the catalog yet.
 */

const HEBREW_UNITS: Record<string, { unit: Exclude<Unit, null>; one?: true }> = {
  גרם: { unit: 'g' },
  גרמים: { unit: 'g' },
  גר: { unit: 'g' },
  "גר'": { unit: 'g' },
  'ק"ג': { unit: 'kg' },
  קג: { unit: 'kg' },
  קילו: { unit: 'kg', one: true },
  קילוגרם: { unit: 'kg', one: true },
  'מ"ל': { unit: 'ml' },
  ליטר: { unit: 'l', one: true },
  ליטרים: { unit: 'l' },
  כפית: { unit: 'tsp', one: true },
  כפיות: { unit: 'tsp' },
  כף: { unit: 'tbsp', one: true },
  כפות: { unit: 'tbsp' },
  כוס: { unit: 'cup', one: true },
  כוסות: { unit: 'cup' },
  קורט: { unit: 'pinch', one: true },
  קמצוץ: { unit: 'pinch', one: true },
  שן: { unit: 'clove', one: true },
  שיני: { unit: 'clove' },
  קופסה: { unit: 'can', one: true },
  קופסת: { unit: 'can', one: true },
  קופסאות: { unit: 'can' },
  פחית: { unit: 'can', one: true },
  פחיות: { unit: 'can' },
  צרור: { unit: 'bunch', one: true },
  צרורות: { unit: 'bunch' },
  ראש: { unit: 'head', one: true },
  ראשי: { unit: 'head' },
  פרוסה: { unit: 'slice', one: true },
  פרוסות: { unit: 'slice' },
  דף: { unit: 'sheet', one: true },
  דפי: { unit: 'sheet' },
  דפים: { unit: 'sheet' },
};

const HEBREW_NUMBERS: Record<string, number> = {
  'שלושת רבעי': 0.75,
  חצי: 0.5,
  רבע: 0.25,
  שליש: 1 / 3,
  אחד: 1,
  אחת: 1,
  שניים: 2,
  שתיים: 2,
  שני: 2,
  שתי: 2,
  שלוש: 3,
  שלושה: 3,
  שלושת: 3,
  ארבע: 4,
  ארבעה: 4,
  ארבעת: 4,
  חמש: 5,
  חמישה: 5,
  חמשת: 5,
  שש: 6,
  שישה: 6,
  ששת: 6,
  שבע: 7,
  שבעה: 7,
  שבעת: 7,
  שמונה: 8,
  שמונת: 8,
  תשע: 9,
  תשעה: 9,
  תשעת: 9,
  עשר: 10,
  עשרה: 10,
  עשרת: 10,
};

// Longest first, so "שלושת רבעי" wins over "שלושת".
const HEBREW_NUMBER_RE = new RegExp(`^(${Object.keys(HEBREW_NUMBERS).sort((a, b) => b.length - a.length).join('|')})\\s+`);

// "1/2 1 כוסות": typed so that, shown right to left, it reads "1 1/2". walla.co.il stores amounts so.
const REVERSED_MIXED = new RegExp(`^(\\d+\\/\\d+|[${VULGAR_CLASS}])\\s+(\\d+)\\s+(?=[\\u05D0-\\u05EA])`);

/** A Hebrew unit at the start of `text`, with the amount it makes: "כוס וחצי" is one and a half cups. */
function hebrewUnit(text: string, qty: number | null): { unit: Exclude<Unit, null>; qty: number; rest: string } | null {
  const match = /^([א-ת]+(?:["״'׳][א-ת]*)?)\s+/.exec(text);
  if (match === null) return null;
  const found = HEBREW_UNITS[(match[1] as string).replace(/״/g, '"').replace(/׳/g, "'")];
  // A plural or a weight needs its number: "כוסות קמח" alone says nothing.
  if (found === undefined || (qty === null && found.one !== true)) return null;
  let rest = text.slice(match[0].length);
  // "כוס ועוד כף קמח" (a cup and a spoon) is past what one amount can say: leave it for a fix.
  if (rest.startsWith('ועוד ')) return null;
  let amount = qty ?? 1;
  const plus = /^ו(חצי|רבע)\s+/.exec(rest);
  if (plus !== null) {
    amount += plus[1] === 'חצי' ? 0.5 : 0.25;
    rest = rest.slice(plus[0].length);
  }
  return { unit: found.unit, qty: amount, rest: rest.replace(/^של\s+/, '') };
}

export function parseNumber(text: string): number | null {
  const value = text.trim();
  if (value === '') return null;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(value);
  if (mixed !== null) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const withVulgar = new RegExp(`^(\\d+)\\s*([${VULGAR_CLASS}])$`).exec(value);
  if (withVulgar !== null) return Number(withVulgar[1]) + (VULGAR[withVulgar[2] as string] ?? 0);
  const fraction = /^(\d+)\/(\d+)$/.exec(value);
  if (fraction !== null) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  if (VULGAR[value] !== undefined) return VULGAR[value] as number;
  const word = NUMBER_WORDS[value.toLowerCase()];
  if (word !== undefined) return word;
  const plain = Number(value.replace(',', '.'));
  return Number.isFinite(plain) ? plain : null;
}

let counter = 0;
/** Short ids for lines and steps. Unique enough within one recipe. */
export function localId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Splits "item, note" at the first comma whose left side is recognisably an
 * ingredient. "bone-in, skin-on chicken thighs" is not split, because "bone-in"
 * alone is not an ingredient.
 */
function splitNote(text: string): { item: string; note?: string } {
  let rest = text;
  const notes: string[] = [];

  const bracket = /\(([^)]*)\)/g;
  rest = rest.replace(bracket, (_match, inner: string) => {
    if (inner.trim() !== '') notes.push(inner.trim());
    return ' ';
  });
  rest = rest.replace(/\s+/g, ' ').trim();

  let commaAt = -1;
  for (let at = rest.indexOf(','); at !== -1; at = rest.indexOf(',', at + 1)) {
    if (canonicalId(rest.slice(0, at)) !== undefined) {
      commaAt = at;
      break;
    }
  }
  if (commaAt === -1 && rest.includes(',') && canonicalId(rest) === undefined) {
    commaAt = rest.indexOf(',');
  }
  if (commaAt !== -1) {
    const after = rest.slice(commaAt + 1).trim();
    rest = rest.slice(0, commaAt).trim();
    if (after !== '') notes.unshift(after);
  }

  const noteOnly = NOTE_ONLY.exec(rest);
  if (noteOnly !== null) {
    notes.push(noteOnly[0]);
    rest = rest.replace(NOTE_ONLY, '').replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim();
  }

  const note = notes.join('; ');
  return note === '' ? { item: rest } : { item: rest, note };
}

export function parseIngredientLine(raw: string): IngredientLine {
  const original = raw.replace(/\s+/g, ' ').trim();
  let text = original.replace(/^[-*•·]\s*/, '');

  let qty: number | null = null;
  let qtyMax: number | undefined;
  let unit: Unit = null;
  let vague = false;

  const vagueMatch = VAGUE.exec(text);
  const reversed = REVERSED_MIXED.exec(text);
  if (vagueMatch !== null) {
    vague = true;
    text = text.slice(vagueMatch[0].length);
  } else if (reversed !== null) {
    qty = Number(reversed[2]) + (parseNumber(reversed[1] as string) ?? 0);
    text = text.slice(reversed[0].length);
  } else {
    const match = QTY_RE.exec(text);
    if (match !== null) {
      qty = parseNumber(match[1] as string);
      if (match[2] !== undefined) {
        const max = parseNumber(match[2]);
        if (max !== null) qtyMax = max;
      }
      text = text.slice(match[0].length);
    } else {
      // "a pinch of salt", "one onion", "half a lemon".
      const word = /^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half)\s+(?:a\s+|an\s+)?/i.exec(text);
      // "חצי כוס סוכר", "שתי כפות שמן".
      const hebrew = HEBREW_NUMBER_RE.exec(text);
      if (word !== null) {
        qty = parseNumber(word[1] as string);
        text = text.slice(word[0].length);
      } else if (hebrew !== null) {
        qty = HEBREW_NUMBERS[hebrew[1] as string] ?? null;
        text = text.slice(hebrew[0].length);
      }
    }
  }

  if (!vague) {
    const imperial = /^(fl\.?\s?oz|oz|ounces?|lbs?|pounds?|quarts?|pints?)\.?\s+/i.exec(text);
    const unitMatch = /^([a-z]+)\.?\s+/i.exec(text);
    if (imperial !== null && qty !== null) {
      const word = (imperial[1] as string).toLowerCase();
      const conversion = IMPERIAL[word.startsWith('fl') ? 'fl oz' : word];
      if (conversion !== undefined) {
        qty = Math.round(qty * conversion.factor);
        if (qtyMax !== undefined) qtyMax = Math.round(qtyMax * conversion.factor);
        unit = conversion.unit;
        text = text.slice(imperial[0].length);
      }
    } else if (unitMatch !== null) {
      const found = UNIT_WORDS[(unitMatch[1] as string).toLowerCase()];
      // A bare "l" or "g" only counts as a unit straight after a number.
      if (found !== undefined && (qty !== null || !['l', 'g'].includes(found))) {
        unit = found;
        text = text.slice(unitMatch[0].length);
      }
    }
    text = text.replace(/^of\s+/i, '');

    const hebrew = unit === null ? hebrewUnit(text, qty) : null;
    if (hebrew !== null) {
      ({ unit, qty } = hebrew);
      text = hebrew.rest;
    }
    // "ביצה אחת", "בצל גדול אחד": in Hebrew, "one" follows the noun.
    const one = qty === null ? /^((?:[א-ת"'״׳-]+ ){1,2})(?:אחד|אחת)(?=[\s,(]|$)/.exec(text) : null;
    if (one !== null) {
      qty = 1;
      text = `${one[1] as string}${text.slice(one[0].length)}`.replace(/\s+/g, ' ').trim();
    }
  }

  const { item, note } = splitNote(text);
  const cleanItem = item.replace(/^of\s+/i, '').trim();
  const id = canonicalId(cleanItem);

  const line: IngredientLine = {
    id: localId('i'),
    qty,
    unit,
    item: cleanItem,
    raw: original,
  };
  if (qtyMax !== undefined) line.qtyMax = qtyMax;
  if (note !== undefined) line.note = note;
  if (id !== undefined) line.canonicalId = id;
  if (qty === null) line.needsFix = true;
  return line;
}

/**
 * A heading over ingredients rather than one of them: "Ingredients", "For the
 * sauce:", "תיבול:". A line that ends in a colon and has no number is one.
 */
export function isIngredientHeading(line: string): boolean {
  const text = line.trim();
  return /^(ingredients|מצרכים|רכיבים|for the .*):?$/i.test(text) || (/:$/.test(text) && !/\d/.test(text));
}

/** Reads a pasted block: one ingredient per line, blank lines and headings skipped. */
export function parseIngredientBlock(block: string): IngredientLine[] {
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !isIngredientHeading(line))
    .map(parseIngredientLine);
}
