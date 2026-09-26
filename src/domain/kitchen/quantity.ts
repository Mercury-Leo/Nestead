import type { Unit } from '../types';

/** Scaling and formatting of amounts, durations and clocks. */

export function scaleQty(qty: number | null, factor: number): number | null {
  return qty === null ? null : qty * factor;
}

const FRACTIONS: ReadonlyArray<[number, string]> = [
  [0, ''],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
  [1, ''],
];

/** 1.5 -> "1½", 0.1 -> "¼" (the smallest amount shown), 12.2 -> "12". */
export function formatNumber(value: number): string {
  if (value >= 10) return String(Math.round(value));
  let whole = Math.floor(value);
  const rest = value - whole;
  let best = FRACTIONS[0] as [number, string];
  for (const candidate of FRACTIONS) {
    if (Math.abs(candidate[0] - rest) < Math.abs(best[0] - rest)) best = candidate;
  }
  if (best[0] === 1) {
    whole += 1;
    best = [0, ''];
  }
  if (whole === 0 && best[1] === '') return '¼';
  return whole === 0 ? best[1] : `${whole}${best[1]}`;
}

function roundMetric(value: number): number {
  if (value >= 100) return Math.round(value / 10) * 10;
  const rounded = Math.round(value / 5) * 5;
  return rounded === 0 ? Math.max(1, Math.round(value)) : rounded;
}

/** The number alone, rounded the way the unit deserves. */
export function formatQty(qty: number, unit: Unit): string {
  // Whole numbers are shown as written ("125 g"); rounding tidies up scaling.
  if (unit === 'g' || unit === 'ml') return Number.isInteger(qty) ? String(qty) : String(roundMetric(qty));
  if (unit === 'kg' || unit === 'l') return String(Math.round(qty * 10) / 10);
  return formatNumber(qty);
}

// i18n: unit names and their plurals are the parser's English words, shown in amounts as they are.
const PLURAL: Partial<Record<Exclude<Unit, null>, string>> = {
  cup: 'cups',
  pinch: 'pinches',
  clove: 'cloves',
  can: 'cans',
  bunch: 'bunches',
  head: 'heads',
  slice: 'slices',
  sheet: 'sheets',
};

export function unitLabel(unit: Unit, qty: number | null): string {
  if (unit === null) return '';
  const plural = PLURAL[unit];
  return plural !== undefined && qty !== null && qty > 1 ? plural : unit;
}

/** "1½ tsp", "2–3 cloves", "12", or "" when there is no amount. */
export function formatAmount(qty: number | null, unit: Unit, qtyMax?: number): string {
  if (qty === null) return '';
  const number =
    qtyMax !== undefined && qtyMax !== qty
      ? `${formatQty(qty, unit)}–${formatQty(qtyMax, unit)}`
      : formatQty(qty, unit);
  const label = unitLabel(unit, qtyMax ?? qty);
  return label === '' ? number : `${number} ${label}`;
}

/**
 * "35 min", "1 h", "1 h 20 min".
 * i18n: English units, shown as they are on cards, recipe pages and the import preview.
 */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * 2852 -> "47:32"; 3600 and over -> "1:00:00".
 * i18n: always Latin digits, whatever the locale.
 */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}
