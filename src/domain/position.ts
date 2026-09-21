import type { Base, Positioned } from './types';

/**
 * Ordering for board rows. Positions are plain numbers and new rows land at the
 * midpoint between their neighbours, so moving one row rewrites one row.
 *
 * Known limit: repeatedly inserting at the same spot halves the gap each time.
 * Float64 allows roughly fifty consecutive halvings before precision runs out,
 * which a family board will not reach. If that ever changes, renormalise a
 * column by rewriting every position to a multiple of POSITION_STEP.
 */

export const POSITION_STEP = 1000;

/**
 * A position between two neighbours. Pass undefined for "no neighbour that
 * side", i.e. inserting at the start, at the end, or into an empty column.
 */
export function positionBetween(before?: number, after?: number): number {
  if (before === undefined) {
    return after === undefined ? POSITION_STEP : after - POSITION_STEP;
  }
  if (after === undefined) {
    return before + POSITION_STEP;
  }
  return (before + after) / 2;
}

/**
 * Sort comparator. Two clients editing at once can produce identical positions
 * under last-write-wins, so ties fall back to createdAt and then id. That makes
 * the order stable and identical on every device rather than merely consistent.
 */
export function comparePosition<T extends Base & Positioned>(a: T, b: T): number {
  if (a.position !== b.position) return a.position - b.position;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}
