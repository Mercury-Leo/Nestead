import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Ellipsis, Milk, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useSession } from '../../auth/session';
import { PageHeader } from '../../components/PageHeader';
import { useIsDesktop } from '../../components/useMediaQuery';
import { Button, ButtonLink, Checkbox, EmptyState, IconButton, RadioList, Sheet, TextField, cx } from '../../components/ui';
import type { ListGroup, ListItem, NewRow } from '../../domain/types';
import { catalogItem } from '../../domain/kitchen/catalog';
import {
  BUILT_IN_GROUPS,
  GENERAL,
  SUPERMARKET,
  formatListQty,
  groupOf,
  isGrocery,
  leftOffList,
  recipesOnList,
} from '../../domain/kitchen/list';
import { canonicalId, exactCatalogId } from '../../domain/kitchen/normalize';
import { pantryFit } from '../../domain/kitchen/fit';
import { addOwnToList, moveToPantry, removeListGroup, removeRecipeFromList } from '../larder/actions';
import { useKitchen } from '../larder/KitchenContext';
import { groupBySection } from '../larder/pantry/Pantry';
import { RecipeCard, RecipeGrid, RecipeList, RecipeRow } from '../larder/RecipeCard';
import { RecipePhoto } from '../larder/RecipePhoto';
import { recipePath, recipeView } from '../larder/recipeView';
import s from './ShoppingList.module.css';

/**
 * The family's shopping list, for everything, not only food. It is split by
 * where things are bought: Supermarket (recipes put their groceries here, by
 * aisle), General, and any sections the family adds.
 */

function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function forLine(item: ListItem): string | null {
  if (item.parts.length === 0) return null;
  return `for ${listJoin([...new Set(item.parts.map((part) => part.recipeTitle))])}`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Router state from a recipe's "Make shopping list": the items it added. */
export interface ListHandoff {
  added: string[];
}

const FLASH_MS = 2000;

/**
 * The items a recipe just added, lit up for two seconds so you can see what
 * came across. The handoff is spent once shown: back or reload do not repeat it.
 */
function useJustAdded(): ReadonlySet<string> {
  const location = useLocation();
  const navigate = useNavigate();
  const [flash, setFlash] = useState<ReadonlySet<string>>(() => new Set());
  const added = (location.state as ListHandoff | null)?.added;

  useEffect(() => {
    if (added === undefined) return;
    setFlash(new Set(added));
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [added, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (flash.size === 0) return;
    document.querySelector('[data-just-added]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timer = setTimeout(() => setFlash(new Set()), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  return flash;
}

interface Group {
  id: string;
  name: string;
  /** A ListGroup row, so it can be renamed and deleted. */
  row?: ListGroup;
}

function ItemRow({
  item,
  justAdded,
  onToggle,
  onEdit,
}: {
  item: ListItem;
  justAdded: boolean;
  onToggle: (value: boolean) => void;
  onEdit: () => void;
}): JSX.Element {
  const detail = [forLine(item), item.note].filter((part) => part !== null && part !== undefined && part !== '').join(' · ');
  return (
    <li className={cx(s.row, item.checked && s.rowChecked, justAdded && s.rowJustAdded)} data-just-added={justAdded || undefined}>
      <Checkbox size={26} checked={item.checked} onChange={onToggle} className={s.rowCheck}>
        <span className={s.rowText}>
          <span className={s.rowName}>{item.name}</span>
          {detail !== '' && <span className={s.rowFor}>{detail}</span>}
        </span>
      </Checkbox>
      <span className={cx(s.rowQty, 'tabular')}>{formatListQty(item.parts)}</span>
      <IconButton label={`Edit ${item.name}`} icon={Ellipsis} className={s.rowEdit} onClick={onEdit} />
    </li>
  );
}

/** Type and press Enter; commas add several at once. */
function AddItem({ group, onAdd }: { group: Group; onAdd: (names: string[]) => void }): JSX.Element {
  const [text, setText] = useState('');
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const names = text.split(',').map((name) => name.trim()).filter((name) => name !== '');
    if (names.length > 0) onAdd(names);
    setText('');
  };
  return (
    <form className={s.addItem} onSubmit={submit}>
      <TextField
        label={`Add to ${group.name}`}
        icon={Plus}
        placeholder={group.id === SUPERMARKET ? 'Add groceries — e.g. milk, bread' : `Add to ${group.name}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        wrapClassName={s.addField}
        enterKeyHint="done"
      />
      {text.trim() !== '' && (
        <Button type="submit" variant="secondary" size="lg">
          Add
        </Button>
      )}
    </form>
  );
}

/** Rename, add a note, move to another section, or take off the list. */
function ItemForm({ item, groups, onDone }: { item: ListItem; groups: Group[]; onDone: () => void }): JSX.Element {
  const { store } = useSession();
  const [name, setName] = useState(item.name);
  const [note, setNote] = useState(item.note ?? '');
  const [groupId, setGroupId] = useState(groupOf(item));
  const [busy, setBusy] = useState(false);
  const recipes = forLine(item);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    const patch: Partial<NewRow<ListItem>> = { note: note.trim() === '' ? undefined : note.trim(), groupId };
    if (trimmed !== item.name) {
      // A new name is a new thing: look it up again for its aisle.
      const id = groupId === SUPERMARKET ? canonicalId(trimmed) : exactCatalogId(trimmed);
      patch.name = trimmed;
      patch.canonicalId = id;
      patch.section = catalogItem(id)?.section ?? 'Other';
    }
    setBusy(true);
    try {
      await store.listItems.update(item.id, patch);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    try {
      await store.listItems.remove(item.id);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={s.sheetForm} onSubmit={(event) => void save(event)}>
      <TextField label="Name" showLabel value={name} onChange={(event) => setName(event.target.value)} required />
      <TextField
        label="Amount or note"
        showLabel
        placeholder="e.g. 2 packs, the big one"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {recipes !== null && (
        <p className={s.muted}>
          {formatListQty(item.parts)} {recipes}.
        </p>
      )}
      <div>
        <p className={s.legend} aria-hidden>
          Section
        </p>
        <RadioList label="Section" value={groupId} onChange={setGroupId} options={groups.map((group) => ({ value: group.id, label: group.name }))} />
      </div>
      <div className={s.sheetActions}>
        <Button variant="ghost" icon={Trash2} disabled={busy} onClick={() => void remove()}>
          Remove
        </Button>
        <Button type="submit" variant="primary" size="lg" disabled={busy || name.trim() === ''}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** A new section, or renaming or deleting one the family made. */
function GroupForm({ group, items, onDone }: { group: ListGroup | null; items: readonly ListItem[]; onDone: () => void }): JSX.Element {
  const { store } = useSession();
  const [name, setName] = useState(group?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const inIt = group === null ? 0 : items.filter((item) => groupOf(item) === group.id).length;

  // The sheet focuses its first control (Close) as it opens, after autoFocus
  // would have run, so the name field takes focus a frame later.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const run = async (write: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await write();
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    void run(() => (group === null ? store.listGroups.create({ name: trimmed }) : store.listGroups.update(group.id, { name: trimmed })));
  };

  return (
    <form className={s.sheetForm} onSubmit={save}>
      <TextField
        ref={input}
        label="Section name"
        showLabel
        placeholder="e.g. Chemist, Hardware shop"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      {group !== null && confirmDelete ? (
        <div className={s.danger}>
          <span>
            Delete “{group.name}” for everyone?
            {inIt > 0 && ` Its ${plural(inIt, 'item')} move${inIt === 1 ? 's' : ''} to General.`}
          </span>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
          <Button variant="primary" icon={Trash2} disabled={busy} onClick={() => void run(() => removeListGroup(store, items, group.id))}>
            Delete section
          </Button>
        </div>
      ) : (
        <div className={s.sheetActions}>
          {group !== null && (
            <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
              Delete section
            </Button>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={busy || name.trim() === ''}>
            {group === null ? 'Add section' : 'Save'}
          </Button>
        </div>
      )}
    </form>
  );
}

export function ShoppingList(): JSX.Element {
  const { store } = useSession();
  const kitchen = useKitchen();
  const desktop = useIsDesktop();
  const justAdded = useJustAdded();
  const [showLeftOff, setShowLeftOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 'new', a ListGroup id, or null when the sheet is shut. */
  const [groupSheet, setGroupSheet] = useState<string | null>(null);

  const items = kitchen.listItems;
  const groups: Group[] = [...BUILT_IN_GROUPS, ...kitchen.listGroups.map((row) => ({ id: row.id, name: row.name, row }))];
  // A section deleted on another device before its items moved: show them in General.
  const known = new Set(groups.map((group) => group.id));
  const placeOf = (item: ListItem): string => (known.has(groupOf(item)) ? groupOf(item) : GENERAL);

  const checked = items.filter((item) => item.checked);
  const checkedGroceries = checked.filter(isGrocery);
  const recipes = recipesOnList(items);
  const recipeFor = (id: string) => kitchen.findRecipe(id);
  const leftOff = leftOffList(
    recipes.map((entry) => recipeFor(entry.recipeId)).filter((recipe) => recipe !== undefined),
    kitchen.pantry,
  );
  const leftOffCount = leftOff.pantry.length + leftOff.staples.length;
  const editing = items.find((item) => item.id === editingId);
  const editingGroup = kitchen.listGroups.find((group) => group.id === groupSheet) ?? null;

  const toggle = (item: ListItem, value: boolean): void => {
    void store.listItems.update(item.id, { checked: value });
  };
  const clearChecked = (): void => {
    for (const item of checked) void store.listItems.remove(item.id);
  };
  const move = async (): Promise<void> => {
    setBusy(true);
    try {
      await moveToPantry(store, checkedGroceries, [...kitchen.have, ...kitchen.staples]);
    } finally {
      setBusy(false);
    }
  };

  const staplesLike = leftOff.staples.slice(0, 2).map((name) => name.toLowerCase());
  const leftOffText = (
    <>
      {plural(leftOffCount, 'ingredient')} you already have — <strong>{leftOff.pantry.length} from your pantry</strong> and{' '}
      <strong>{plural(leftOff.staples.length, 'staple')}</strong>
      {staplesLike.length > 0 && ` like ${listJoin(staplesLike)}`}.
    </>
  );

  const progress = items.length > 0 && (
    <div className={s.progressWrap}>
      <div className={s.progressHead}>
        <span>
          <strong>
            {checked.length} of {items.length}
          </strong>{' '}
          checked off
        </span>
      </div>
      <div
        className={s.progress}
        role="progressbar"
        aria-label="Checked off"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={checked.length}
      >
        <span style={{ width: `${(checked.length / items.length) * 100}%` }} />
      </div>
    </div>
  );

  const actionBar = checked.length > 0 && desktop && (
    <div className={s.actionBar}>
      <span className={s.actionText}>
        <Check size={20} strokeWidth={2.2} aria-hidden />
        <span>
          <strong>{checked.length} checked</strong> — {listJoin(checked.map((item) => item.name))}
        </span>
      </span>
      <Button variant="ghost" onClick={clearChecked}>
        Clear checked
      </Button>
      {checkedGroceries.length > 0 && (
        <Button variant="sage" size="lg" icon={Milk} disabled={busy} onClick={() => void move()}>
          Move {checkedGroceries.length} to pantry
        </Button>
      )}
    </div>
  );

  const sections = groups.map((group) => {
    const rows = items.filter((item) => placeOf(item) === group.id);
    const itemRows = (list: ListItem[]) => (
      <ul className={s.rows}>
        {list.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            justAdded={justAdded.has(item.id)}
            onToggle={(value) => toggle(item, value)}
            onEdit={() => setEditingId(item.id)}
          />
        ))}
      </ul>
    );
    const titleId = `list-group-${group.id}`;
    return (
      <section key={group.id} className={s.card} aria-labelledby={titleId}>
        <header className={s.groupHead}>
          <h2 id={titleId} className={s.cardTitle}>
            {group.name} {rows.length > 0 && <span className={s.groupCount}>{rows.length}</span>}
          </h2>
          {group.row !== undefined && (
            <IconButton label={`Rename or delete ${group.name}`} icon={Ellipsis} onClick={() => setGroupSheet(group.id)} />
          )}
        </header>
        {rows.length === 0 && group.id === SUPERMARKET && (
          <p className={s.muted}>
            Open a recipe and tap <strong>Make shopping list</strong> — only what’s missing from your pantry comes across, sorted by aisle.
          </p>
        )}
        {group.id === SUPERMARKET
          ? groupBySection(rows).map(([aisle, aisleRows]) => (
              <div key={aisle} className={s.group}>
                <h3 className={s.groupTitle}>
                  {aisle} <span className={s.groupCount}>{aisleRows.length}</span>
                </h3>
                {itemRows(aisleRows)}
              </div>
            ))
          : rows.length > 0 && itemRows(rows)}
        <AddItem group={group} onAdd={(names) => void addOwnToList(store, items, names, group.id)} />
      </section>
    );
  });

  const newSection = (
    <button type="button" className={s.addAnother} onClick={() => setGroupSheet('new')}>
      <Plus size={18} strokeWidth={2} aria-hidden /> New section
    </button>
  );

  const list = (
    <div className={s.groups}>
      {progress}
      {actionBar}
      {sections}
      {newSection}
    </div>
  );

  const onList = (
    <section className={s.card} aria-labelledby="on-list-title">
      <h2 id="on-list-title" className={s.cardTitle}>
        Recipes on this list
      </h2>
      {recipes.length === 0 ? (
        <p className={s.muted}>No recipes yet. Add one and only its missing ingredients come across.</p>
      ) : (
        <ul className={s.recipes}>
          {recipes.map((entry) => {
            const recipe = recipeFor(entry.recipeId);
            return (
              <li key={entry.recipeId} className={s.recipe}>
                <span className={s.thumb}>
                  <RecipePhoto recipe={recipe ?? { title: entry.title }} />
                </span>
                <span className={s.recipeText}>
                  {recipe !== undefined ? (
                    <Link to={recipePath(recipe)} className={s.recipeTitle}>
                      {entry.title}
                    </Link>
                  ) : (
                    <span className={s.recipeTitle}>{entry.title}</span>
                  )}
                  <span className={s.muted}>{plural(entry.count, 'item')} added</span>
                </span>
                <button
                  type="button"
                  className={s.iconX}
                  aria-label={`Take ${entry.title} off the list`}
                  onClick={() => void removeRecipeFromList(store, items, entry.recipeId)}
                >
                  <X size={20} strokeWidth={2} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Link to="/library" className={s.addAnother}>
        <Plus size={18} strokeWidth={2} aria-hidden /> {recipes.length === 0 ? 'Add a recipe' : 'Add another recipe'}
      </Link>
    </section>
  );

  const leftOffCard = leftOffCount > 0 && (
    <section className={s.card} aria-labelledby="left-off-title">
      <h2 id="left-off-title" className={s.cardTitle}>
        Left off this list
      </h2>
      <p className={s.leftOff}>{leftOffText}</p>
      <button type="button" className={s.showThem} aria-expanded={showLeftOff} onClick={() => setShowLeftOff(!showLeftOff)}>
        {showLeftOff ? 'Hide them' : 'Show them'}{' '}
        <ChevronDown size={16} strokeWidth={2.2} aria-hidden className={cx(showLeftOff && s.flip)} />
      </button>
      {showLeftOff && (
        <div className={s.leftOffLists}>
          <p>
            <strong>Pantry:</strong> {leftOff.pantry.join(', ')}
          </p>
          <p>
            <strong>Staples:</strong> {leftOff.staples.join(', ')}
          </p>
        </div>
      )}
    </section>
  );

  // Nothing on the list: suggest what can be cooked without shopping.
  const ready =
    items.length === 0
      ? kitchen.recipes
          .map((recipe) => recipeView({ ...recipe, inLibrary: true }, kitchen.pantry, kitchen.profile, { fit: pantryFit(recipe, kitchen.pantry) }))
          .filter((view) => view.fit.missing === 0)
      : [];
  const empty = items.length === 0 && (
    <section className={cx(s.card, s.emptyCard)}>
      <EmptyState icon={ShoppingBag} title="Nothing to buy">
        <p>Add anything you need below, or add a recipe and only what’s missing from your pantry comes across.</p>
      </EmptyState>
    </section>
  );
  const readySection = ready.length > 0 && (
    <section className={s.ready} aria-labelledby="ready-title">
      <h2 id="ready-title" className={s.sectionTitle}>
        Ready without shopping
      </h2>
      {desktop ? (
        <RecipeGrid dense>
          {ready.map((view) => (
            <RecipeCard key={view.recipe.id} view={view} />
          ))}
        </RecipeGrid>
      ) : (
        <RecipeList>
          {ready.map((view) => (
            <RecipeRow key={view.recipe.id} view={view} />
          ))}
        </RecipeList>
      )}
    </section>
  );

  const forRecipes = items.filter((item) => item.parts.length > 0).length;
  const subtitle =
    items.length === 0
      ? 'Groceries from your recipes, and anything else you need.'
      : recipes.length === 0
        ? plural(items.length, 'item')
        : `${plural(items.length, 'item')}, ${forRecipes === items.length ? 'all' : `${forRecipes} of them`} for ${plural(recipes.length, 'recipe')} — only what you don’t already have.`;

  const sheets = (
    <>
      <Sheet open={editing !== undefined} onClose={() => setEditingId(null)} title={editing?.name ?? 'Item'}>
        {editing !== undefined && <ItemForm key={editing.id} item={editing} groups={groups} onDone={() => setEditingId(null)} />}
      </Sheet>
      <Sheet open={groupSheet !== null} onClose={() => setGroupSheet(null)} title={editingGroup === null ? 'New section' : 'Edit section'}>
        {groupSheet !== null && <GroupForm key={groupSheet} group={editingGroup} items={items} onDone={() => setGroupSheet(null)} />}
      </Sheet>
    </>
  );

  return (
    <div>
      <PageHeader
        title="Shopping list"
        subtitle={subtitle}
        actions={
          desktop ? (
            <ButtonLink to="/library" variant="secondary" size="lg" icon={Plus}>
              Add from a recipe
            </ButtonLink>
          ) : undefined
        }
      />

      {desktop ? (
        <div className={s.layout}>
          <div className={s.groups}>
            {empty}
            {list}
            {readySection}
          </div>
          <aside className={s.side}>
            {onList}
            {leftOffCard}
          </aside>
        </div>
      ) : (
        <>
          {recipes.length > 0 && (
            <ul className={s.recipeChips} aria-label="Recipes on this list">
              {recipes.map((entry) => {
                const recipe = recipeFor(entry.recipeId);
                return (
                  <li key={entry.recipeId} className={s.recipeChip}>
                    <span className={s.chipThumb}>
                      <RecipePhoto recipe={recipe ?? { title: entry.title }} />
                    </span>
                    <span className={s.chipTitle}>{entry.title}</span>
                    <span className={s.chipCount}>{entry.count}</span>
                    <button
                      type="button"
                      className={s.iconX}
                      aria-label={`Take ${entry.title} off the list`}
                      onClick={() => void removeRecipeFromList(store, items, entry.recipeId)}
                    >
                      <X size={16} strokeWidth={2} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {empty}
          {list}
          {leftOffCount > 0 && <p className={s.leftOffLine}>{leftOffText}</p>}
          {readySection}
          {checked.length > 0 && <div className={s.stickySpace} aria-hidden />}
          {checked.length > 0 && (
            <div className={s.stickyMove}>
              <Button variant="ghost" size="bar" block={checkedGroceries.length === 0} onClick={clearChecked}>
                {checkedGroceries.length > 0 ? 'Clear' : `Clear ${checked.length} checked`}
              </Button>
              {checkedGroceries.length > 0 && (
                <Button variant="sage" size="bar" icon={Milk} disabled={busy} className={s.moveMobile} onClick={() => void move()}>
                  Move {checkedGroceries.length} to pantry
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {sheets}
    </div>
  );
}
