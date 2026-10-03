import type { AiStatus } from '../../domain/types';

/** family_ai_status()'s jsonb in the app's shape, taking only the fields it names. */
export function toAiStatus(row: unknown): AiStatus {
  const r = (typeof row === 'object' && row !== null ? row : {}) as Record<string, unknown>;
  const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  const status: AiStatus = { free: { used: count(r.free_used), limit: count(r.free_limit), left: count(r.free_left) } };
  if (r.has_key === true && typeof r.key_hint === 'string' && typeof r.updated_at === 'string') {
    status.key = { hint: r.key_hint, updatedAt: r.updated_at };
    if (typeof r.model === 'string') status.key.model = r.model;
    if (typeof r.set_by_name === 'string') status.key.setByName = r.set_by_name;
  }
  return status;
}
