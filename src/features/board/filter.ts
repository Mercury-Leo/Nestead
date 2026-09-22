import type { Task } from '../../domain/types';

/** Assignee filter value meaning "tasks nobody has picked up". */
export const UNASSIGNED = '__unassigned__';

export interface TaskFilter {
  /** Free text, matched case-insensitively against title and description. */
  query: string;
  /** '' for everyone, UNASSIGNED, or a member id. */
  assignee: string;
}

export const NO_FILTER: TaskFilter = { query: '', assignee: '' };

/** Rebuilds a filter from a stored preference, ignoring anything malformed. */
export function parseFilter(raw: unknown): TaskFilter {
  if (typeof raw !== 'object' || raw === null) return NO_FILTER;
  const { query, assignee } = raw as Record<string, unknown>;
  return {
    query: typeof query === 'string' ? query : '',
    assignee: typeof assignee === 'string' ? assignee : '',
  };
}

/**
 * A remembered assignee may since have been deleted. Treat that as Everyone
 * rather than showing an empty board with nothing selected in the menu.
 */
export function withKnownAssignee(filter: TaskFilter, memberIds: readonly string[]): TaskFilter {
  if (filter.assignee === '' || filter.assignee === UNASSIGNED) return filter;
  if (memberIds.includes(filter.assignee)) return filter;
  return { ...filter, assignee: '' };
}

export function isFiltering(filter: TaskFilter): boolean {
  return filter.query.trim() !== '' || filter.assignee !== '';
}

export function matchesFilter(task: Task, filter: TaskFilter): boolean {
  if (filter.assignee === UNASSIGNED && task.assigneeId !== undefined) return false;
  if (filter.assignee !== '' && filter.assignee !== UNASSIGNED && task.assigneeId !== filter.assignee) {
    return false;
  }
  const query = filter.query.trim().toLowerCase();
  if (query === '') return true;
  return (
    task.title.toLowerCase().includes(query) ||
    (task.description ?? '').toLowerCase().includes(query)
  );
}
