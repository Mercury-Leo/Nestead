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

// i18n: English unit names, for formatAmount. Screens word units from the translation file
// (kitchen.unit.<unit>) through amountParts.
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

/**
 * An amount in pieces, so a screen can word the unit in its own language:
 * the number as shown ("1½", "2–3"), the unit, and the quantity the unit
 * agrees with (the upper bound of a range).
 */
export interface AmountParts {
  number: string;
  unit: Unit;
  count: number;
}

export function amountParts(qty: number | null, unit: Unit, qtyMax?: number): AmountParts | null {
  if (qty === null) return null;
  const number =
    qtyMax !== undefined && qtyMax !== qty
      ? `${formatQty(qty, unit)}–${formatQty(qtyMax, unit)}`
      : formatQty(qty, unit);
  return { number, unit, count: qtyMax ?? qty };
}

/** The English wording of amountParts: "1½ tsp", "2–3 cloves", "12". */
export function formatAmountParts(parts: AmountParts): string {
  const label = unitLabel(parts.unit, parts.count);
  return label === '' ? parts.number : `${parts.number} ${label}`;
}

/** "1½ tsp", "2–3 cloves", "12", or "" when there is no amount. */
export function formatAmount(qty: number | null, unit: Unit, qtyMax?: number): string {
  const parts = amountParts(qty, unit, qtyMax);
  return parts === null ? '' : formatAmountParts(parts);
}

/**
 * "35 min", "1 h", "1 h 20 min".
 * i18n: English; screens word durations from the translation file (labels.ts formatMinutes).
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
 * i18n: Latin digits; screens swap in the locale's digits (labels.ts formatClockDigits).
 */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}
