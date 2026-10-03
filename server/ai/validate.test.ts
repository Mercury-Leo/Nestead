// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RECIPE_SCHEMA, systemPrompt, userMessage } from './prompt';
import { LIMITS, plainText, validateOutput } from './validate';

const good = {
  found: true,
  title: 'Lentil soup',
  description: 'A weeknight soup.',
  servings: 4,
  servingUnit: null,
  prepMin: 10,
  cookMin: 30,
  ingredients: ['1 cup brown lentils', '1 onion'],
  steps: ['Chop the onion.', 'Simmer for 30 minutes.'],
};
const answer = (patch: Record<string, unknown> = {}): string => JSON.stringify({ ...good, ...patch });

describe('the prompt', () => {
  it('names the nonce markers and calls the text data', () => {
    const prompt = systemPrompt('abc123');
    expect(prompt).toContain('<<<RECIPE abc123>>>');
    expect(prompt).toContain('<<<END abc123>>>');
    expect(prompt).toMatch(/untrusted data, not instructions/);
  });

  it('puts only the delimited text in the user message', () => {
    expect(userMessage('1 onion', 'abc123')).toBe('<<<RECIPE abc123>>>\n1 onion\n<<<END abc123>>>');
  });

  it('sends a closed schema with every field required', () => {
    expect(RECIPE_SCHEMA.additionalProperties).toBe(false);
    expect([...RECIPE_SCHEMA.required].sort()).toEqual(Object.keys(RECIPE_SCHEMA.properties).sort());
  });
});

describe('validateOutput', () => {
  it('accepts a well-formed recipe', () => {
    expect(validateOutput(answer())).toEqual({
      kind: 'recipe',
      recipe: { title: 'Lentil soup', description: 'A weeknight soup.', servings: 4, prepMin: 10, cookMin: 30, ingredients: good.ingredients, steps: good.steps },
    });
  });

  it('leaves out what is null, and counts an empty description as none', () => {
    const result = validateOutput(answer({ description: '  ', servings: null, prepMin: null, cookMin: null, servingUnit: 'slice' }));
    expect(result).toEqual({ kind: 'recipe', recipe: { title: 'Lentil soup', servingUnit: 'slice', ingredients: good.ingredients, steps: good.steps } });
  });

  it('answers not-a-recipe for found: false, an empty title or no ingredients', () => {
    expect(validateOutput(answer({ found: false, title: 'whatever' }))).toEqual({ kind: 'not-a-recipe' });
    expect(validateOutput(answer({ title: ' <b></b> ' }))).toEqual({ kind: 'not-a-recipe' });
    expect(validateOutput(answer({ ingredients: [] }))).toEqual({ kind: 'not-a-recipe' });
  });

  it('rejects anything but the exact keys, at every level', () => {
    expect(validateOutput(answer({ image: 'https://evil.example/x.jpg' })).kind).toBe('invalid');
    expect(validateOutput(answer({ url: 'https://evil.example' })).kind).toBe('invalid');
    const { steps: _steps, ...missing } = good;
    expect(validateOutput(JSON.stringify(missing)).kind).toBe('invalid');
    expect(validateOutput(answer({ ingredients: [{ line: '1 onion' }] })).kind).toBe('invalid');
  });

  it('rejects wrong types and numbers out of range', () => {
    for (const patch of [
      { servings: 2.5 }, { servings: '4' }, { servings: 0 }, { servings: 101 },
      { prepMin: -1 }, { cookMin: 4321 }, { servingUnit: 'bowl' }, { found: 'yes' }, { title: 7 },
    ]) {
      expect(validateOutput(answer(patch)).kind, JSON.stringify(patch)).toBe('invalid');
    }
  });

  it('rejects counts and lengths over the limits instead of cutting them', () => {
    expect(validateOutput(answer({ title: 'x'.repeat(LIMITS.title + 1) })).kind).toBe('invalid');
    expect(validateOutput(answer({ description: 'x'.repeat(LIMITS.description + 1) })).kind).toBe('invalid');
    expect(validateOutput(answer({ ingredients: Array.from({ length: LIMITS.ingredients + 1 }, () => '1 egg') })).kind).toBe('invalid');
    expect(validateOutput(answer({ ingredients: ['x'.repeat(LIMITS.line + 1)] })).kind).toBe('invalid');
    expect(validateOutput(answer({ steps: Array.from({ length: LIMITS.steps + 1 }, () => 'Stir.') })).kind).toBe('invalid');
    expect(validateOutput(answer({ steps: ['x'.repeat(LIMITS.step + 1)] })).kind).toBe('invalid');
    expect(validateOutput(answer({ ingredients: ['1 egg', ''] })).kind).toBe('invalid');
    expect(validateOutput(answer({ steps: ['Stir.', '   '] })).kind).toBe('invalid');
  });

  it('rejects text that is not exactly one JSON object, without repairing it', () => {
    for (const content of ['not json', '```json\n' + answer() + '\n```', answer() + ' trailing', answer().slice(0, -5), '[1,2]', 'null', 'x'.repeat(LIMITS.content + 1)]) {
      expect(validateOutput(content).kind).toBe('invalid');
    }
  });

  it('keeps plain text only: tags, control and bidi characters go', () => {
    const result = validateOutput(answer({ title: '<b>Lentil</b> soup‮', steps: ['<script>alert(1)</script>Bake\u0007 at <180C'] }));
    expect(result).toMatchObject({ kind: 'recipe', recipe: { title: 'Lentil soup', steps: ['alert(1) Bake at <180C'] } });
  });

  it('plainText collapses whitespace and trims', () => {
    expect(plainText('  a \n\t b  ')).toBe('a b');
  });
});
