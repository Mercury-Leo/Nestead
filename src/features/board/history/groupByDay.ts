import type { TaskCompletion } from '../../../domain/types';
import { addDays, toIsoDate } from '../recurrence';

export interface DayGroup {
  /** The local day, YYYY-MM-DD. */
  day: string;
  /** Today and yesterday are named; older days show their date. */
  relative: 'today' | 'yesterday' | undefined;
  /** Newest first. */
  entries: TaskCompletion[];
}

/** History entries, newest first, in runs of one local day. */
export function groupByDay(entries: readonly TaskCompletion[], now: Date): DayGroup[] {
  const today = toIsoDate(now);
  const yesterday = toIsoDate(addDays(now, -1));
  // ISO timestamps in one format sort as strings.
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const groups: DayGroup[] = [];
  for (const entry of sorted) {
    const day = toIsoDate(new Date(entry.createdAt));
    let group = groups[groups.length - 1];
    if (group === undefined || group.day !== day) {
      group = { day, relative: day === today ? 'today' : day === yesterday ? 'yesterday' : undefined, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}
