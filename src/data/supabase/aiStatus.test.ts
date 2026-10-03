// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toAiStatus } from './aiStatus';

describe('toAiStatus', () => {
  it('maps a family with a key', () => {
    expect(toAiStatus({ has_key: true, key_hint: 'a3f2', model: 'google/gemini-2.5-flash', set_by_name: 'Dana', updated_at: '2026-10-03T10:00:00Z', free_used: 1, free_limit: 5, free_left: 4 }))
      .toEqual({ key: { hint: 'a3f2', model: 'google/gemini-2.5-flash', setByName: 'Dana', updatedAt: '2026-10-03T10:00:00Z' }, free: { used: 1, limit: 5, left: 4 } });
  });

  it('maps a family on free AI, and a key whose setter left', () => {
    expect(toAiStatus({ has_key: false, key_hint: null, model: null, set_by_name: null, updated_at: null, free_used: 0, free_limit: 5, free_left: 5 }))
      .toEqual({ free: { used: 0, limit: 5, left: 5 } });
    expect(toAiStatus({ has_key: true, key_hint: 'a3f2', model: null, set_by_name: null, updated_at: '2026-10-03T10:00:00Z', free_used: 0, free_limit: 5, free_left: 5 }).key)
      .toEqual({ hint: 'a3f2', updatedAt: '2026-10-03T10:00:00Z' });
  });

  it('never carries anything it was not asked for', () => {
    const status = toAiStatus({ has_key: true, key_hint: 'a3f2', updated_at: 'x', key_ciphertext: 'v1:secret', free_used: 0, free_limit: 5, free_left: 5 });
    expect(JSON.stringify(status)).not.toContain('v1:secret');
  });
});
