// The demo backend's localStorage for a typical and a heavy family, so the
// demo build can be measured with as many rows as the database runs use.
//
//   npx vite-node scripts/perf/demodata.ts <out.json>
//
// Keys are the ones src/data/local/localStore.ts reads. The diet profile and
// the columns are included, so the demo session finds a set-up family and
// seeds nothing of its own.

import { writeFileSync } from 'node:fs';
import type { Base } from '../../src/domain/types';
import { COLUMNS, GROUPS, SIZES, TWELVE, listRows, pantryRows, recipeRows, showRows, taskRows } from './fixtures';

const FAMILY = 'demo-family';
let clock = Date.parse('2026-09-01T08:00:00Z');

function stamp<T extends object>(fields: T): T & Base {
  clock += 1000;
  const at = new Date(clock).toISOString();
  return { id: crypto.randomUUID(), familyId: FAMILY, createdAt: at, updatedAt: at, ...fields };
}

function family(size: keyof typeof SIZES): Record<string, unknown[]> {
  const target = SIZES[size];
  const members = [stamp({ name: 'Alex', color: '#4f8ef7' }), stamp({ name: 'Sam', color: '#e8734a' })];
  const columns = COLUMNS.map(stamp);
  const listGroups = GROUPS.map(stamp);
  const tasks = taskRows(0, target.tasks, columns, members[0]!.id).map(stamp);
  const library = recipeRows(0, target.recipes, members[0]!.id).map(stamp);
  const recipes = [stamp({ ...TWELVE }), ...library];
  const pantry = pantryRows(0, target.pantry).map(stamp);
  const list = listRows(0, target.listItems, library, listGroups.map((group) => group.id)).map(stamp);
  const shows = showRows(0, target.shows, members[0]!.id).map(stamp);
  // Rules that flag some recipes, so screens that check them do real work.
  const diet = [stamp({
    presets: { vegetarian: true, nutAllergy: true },
    custom: [{ id: 'no-mushrooms', label: 'No mushrooms', terms: ['mushroom'], hint: 'Sam will not eat them' }],
    conflictMode: 'warn' as const,
  })];
  const collections: Record<string, unknown[]> = { members, columns, tasks, recipes, pantry, diet, list, listGroups, shows };
  return Object.fromEntries(Object.entries(collections).map(([name, rows]) => [`nestead:${FAMILY}:${name}`, rows]));
}

const out = process.argv[2];
if (out === undefined) throw new Error('usage: npx vite-node scripts/perf/demodata.ts <out.json>');
writeFileSync(out, JSON.stringify({ typical: family('typical'), heavy: family('heavy') }));
console.log(`wrote ${out}`);
