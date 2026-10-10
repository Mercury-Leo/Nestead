import { describe, expect, it } from 'vitest';
import { ALL_TASK_ICONS, DEFAULT_TASK_ICON, TASK_ICONS, TASK_ICON_GROUPS } from './icons';

describe('task icons', () => {
  it('offers each emoji once, so a picked one is highlighted once', () => {
    expect(new Set(ALL_TASK_ICONS).size).toBe(ALL_TASK_ICONS.length);
  });

  it('are single emoji that draw in colour', () => {
    // A character that defaults to text (✈, ☀) needs U+FE0F after it, or
    // some devices draw it in black and white; one that defaults to emoji
    // takes nothing after it.
    for (const icon of ALL_TASK_ICONS) {
      const [first, ...rest] = [...icon];
      expect(rest, icon).toEqual(/\p{Emoji_Presentation}/u.test(first as string) ? [] : ['️']);
    }
  });

  it('starts a new task on an everyday icon', () => {
    expect(TASK_ICONS).toContain(DEFAULT_TASK_ICON);
  });

  it('keeps the groups to full rows of eight where it can', () => {
    for (const group of TASK_ICON_GROUPS) expect(group.icons.length, group.key).toBeGreaterThanOrEqual(8);
  });
});
