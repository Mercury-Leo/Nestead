import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Check, ChevronDown, Ellipsis, GripVertical, Milk, Plus, ShoppingBag, X } from 'lucide-react';
import { useSession } from '../../auth/session';
import { PageHeader } from '../../components/PageHeader';
import { readPreference, writePreference } from '../../data/local/localStore';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { Button, ButtonLink, EmptyState, IconButton, Sheet, cx } from '../../components/ui';
import type { ListItem } from '../../domain/types';
import {
  GENERAL,
  SUPERMARKET,
  groupDropPosition,
  groupEndPosition,
  groupOf,
  groupStepPosition,
  isGrocery,
  leftOffList,
  orderGroups,
  recipesOnList,
} from '../../domain/kitchen/list';
import { pantryFit } from '../../domain/kitchen/fit';
import type { Box } from '../../hooks/pointerDrag';
import { addOwnToList, moveToPantry, placeListGroup, removeRecipeFromList } from '../larder/actions';
import { useKitchen } from '../larder/KitchenContext';
import { groupBySection } from '../../domain/kitchen/sections';
import { formatList, formatNumber } from '../../i18n';
import { groupName, sectionLabel } from '../larder/labels';
import { RecipeCard, RecipeGrid, RecipeList, RecipeRow } from '../larder/recipe/RecipeCard';
import { RecipePhoto } from '../larder/recipe/RecipePhoto';
import { recipePath, recipeView } from '../larder/recipe/recipeView';
import { GroupForm } from './GroupForm';
import { ItemForm } from './ItemForm';
import { AddItem, ItemRow } from './ListRows';
import type { Group } from './ListRows';
import s from './ShoppingList.module.css';
import { useJustAdded } from './useJustAdded';
import { useSectionDrag } from './useSectionDrag';

/**
 * The family's shopping list, for everything, not only food. It is split by
 * where things are bought: Supermarket (recipes put their groceries here, by
 * aisle), General, and any sections the family adds.
 */

export function ShoppingList(): JSX.Element {
  const { t } = useTranslation();
  const { store } = useSession();
  const kitchen = useKitchen();
  const desktop = useIsDesktop();
  const justAdded = useJustAdded();
  const [showLeftOff, setShowLeftOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 'new', a ListGroup id, or null when the sheet is shut. */
  const [groupSheet, setGroupSheet] = useState<string | null>(null);
  // Folded sections, remembered per family in this browser.
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    const saved = readPreference(store.familyId, 'listCollapsed');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  });
  useEffect(() => {
    writePreference(store.familyId, 'listCollapsed', collapsed);
  }, [store.familyId, collapsed]);
  const toggleCollapsed = (id: string): void => {
    setCollapsed((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));
  };

  const items = kitchen.listItems;
  // In the family's order. Only groups the family made keep their row, for renaming.
  const slots = orderGroups(kitchen.listGroups);
  const groups: Group[] = slots.map((slot) =>
    slot.row === undefined || slot.row.builtin !== undefined
      ? { id: slot.id, name: groupName(t, { id: slot.id, name: '' }) }
      : { id: slot.id, name: slot.row.name, row: slot.row },
  );

  // Moving a section, by dragging its grip or by the grip's arrow keys.
  const sectionsRef = useRef<HTMLDivElement>(null);
  const moveGroup = (id: string, position: number | null): void => {
    const slot = slots.find((candidate) => candidate.id === id);
    if (slot !== undefined && position !== null) void placeListGroup(store, slot, position);
  };
  const { drag, startDrag } = useSectionDrag(sectionsRef, (id, beforeId) => moveGroup(id, groupDropPosition(slots, id, beforeId)));
  // Moving a focused node in the DOM drops its focus. Just after an arrow-key
  // move, put it back on the grip, unless focus has gone somewhere on purpose.
  const refocus = useRef<{ id: string; until: number } | null>(null);
  useEffect(() => {
    const pending = refocus.current;
    if (pending === null) return;
    if (Date.now() > pending.until) {
      refocus.current = null;
      return;
    }
    const lost = document.activeElement === null || document.activeElement === document.body;
    const grip = sectionsRef.current?.querySelector<HTMLElement>(`[data-section-id="${pending.id}"] [data-grip]`);
    if (lost && grip != null) grip.focus();
  });
  const stepKey = (event: KeyboardEvent, id: string): void => {
    const direction = event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : null;
    if (direction === null) return;
    event.preventDefault();
    refocus.current = { id, until: Date.now() + 2000 };
    moveGroup(id, groupStepPosition(slots, id, direction));
  };
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
  const editingGroup = groups.find((group) => group.id === groupSheet)?.row ?? null;

  // A recipe just added to a folded section: open it so the new items show.
  const unfold = collapsed.filter((id) => items.some((item) => justAdded.has(item.id) && placeOf(item) === id));
  const isOpen = (id: string): boolean => !collapsed.includes(id) || unfold.includes(id);
  // And keep it open after the flash fades. Runs only when a handoff arrives.
  useEffect(() => {
    if (unfold.length > 0) setCollapsed((ids) => ids.filter((id) => !unfold.includes(id)));
  }, [justAdded]);

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

  // The bar and "2/8"; the bar carries the words for screen readers.
  const progress = items.length > 0 && (
    <div className={s.progressWrap}>
      <div
        className={s.progress}
        role="progressbar"
        aria-label={t('lists.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={checked.length}
      >
        <span style={{ width: `${(checked.length / items.length) * 100}%` }} />
      </div>
      <span className={cx(s.progressCount, 'tabular')} aria-hidden>
        {t('lists.progress', { checked: checked.length, total: items.length })}
      </span>
    </div>
  );

  const actionBar = checked.length > 0 && desktop && (
    <div className={s.actionBar}>
      <span className={s.actionText}>
        <Check size={20} strokeWidth={2.2} aria-hidden />
        <span>
          {/* The checked items are struck through in the list below. */}
          <Trans i18nKey="lists.checked" values={{ count: checked.length }} />
        </span>
      </span>
      <Button variant="ghost" onClick={clearChecked}>
        {t('lists.clearChecked')}
      </Button>
      {checkedGroceries.length > 0 && (
        <Button variant="sage" size="lg" icon={Milk} disabled={busy} onClick={() => void move()}>
          {t('lists.moveToPantry', { count: checkedGroceries.length })}
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
    const bodyId = `list-group-body-${group.id}`;
    const open = isOpen(group.id);
    return (
      <section
        key={group.id}
        className={cx(s.card, drag?.id === group.id && s.cardDragging)}
        aria-labelledby={titleId}
        data-section-id={group.id}
      >
        <header className={s.groupHead}>
          <h2 id={titleId} className={s.cardTitle}>
            <button
              type="button"
              className={s.groupToggle}
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => toggleCollapsed(group.id)}
            >
              <ChevronDown size={20} strokeWidth={2.2} aria-hidden className={cx(s.groupChevron, !open && s.groupChevronShut)} />
              <bdi>{group.name}</bdi> {rows.length > 0 && <span className={s.groupCount}>{formatNumber(rows.length)}</span>}
            </button>
          </h2>
          <span className={s.groupTools}>
            {group.row !== undefined && (
              <IconButton label={t('lists.renameGroup', { name: group.name })} icon={Ellipsis} onClick={() => setGroupSheet(group.id)} />
            )}
            {groups.length > 1 && (
              <button
                type="button"
                className={s.grip}
                aria-label={t('lists.moveSection', { name: group.name })}
                data-grip
                onPointerDown={(event) => startDrag(event, group.id)}
                onKeyDown={(event) => stepKey(event, group.id)}
              >
                <GripVertical size={20} strokeWidth={2} aria-hidden />
              </button>
            )}
          </span>
        </header>
        {open && (
          <div id={bodyId} className={s.groupBody}>
            {rows.length === 0 && group.id === SUPERMARKET && <p className={s.muted}>{t('lists.supermarketEmpty')}</p>}
            {group.id === SUPERMARKET
              ? groupBySection(rows).map(([aisle, aisleRows]) => (
                  <div key={aisle} className={s.group}>
                    <h3 className={s.groupTitle}>
                      {sectionLabel(t, aisle)} <span className={s.groupCount}>{formatNumber(aisleRows.length)}</span>
                    </h3>
                    {itemRows(aisleRows)}
                  </div>
                ))
              : rows.length > 0 && itemRows(rows)}
            <AddItem group={group} onAdd={(names) => void addOwnToList(store, items, names, group.id)} />
          </div>
        )}
      </section>
    );
  });

  const newSection = (
    <button type="button" className={s.addAnother} onClick={() => setGroupSheet('new')}>
      <Plus size={18} strokeWidth={2} aria-hidden /> {t('lists.newSection')}
    </button>
  );

  const dragged = drag === null ? undefined : groups.find((group) => group.id === drag.id);
  const dragLayer = drag !== null && (
    <div aria-hidden>
      {dragged !== undefined && (
        <div className={cx(s.dragGhost, s.cardTitle)} style={boxStyle(drag.ghost)}>
          <bdi>{dragged.name}</bdi>
          <GripVertical size={20} strokeWidth={2} className={s.dragGhostGrip} />
        </div>
      )}
      {drag.line !== null && <div className={s.dragLine} style={boxStyle(drag.line)} />}
    </div>
  );

  const list = (
    <div className={s.groups}>
      {progress}
      {actionBar}
      <div ref={sectionsRef} className={s.groups}>
        {sections}
      </div>
      {newSection}
      {dragLayer}
    </div>
  );

  const onList = (
    <section className={s.card} aria-labelledby="on-list-title">
      <h2 id="on-list-title" className={s.cardTitle}>
        {t('lists.onList')}
      </h2>
      {recipes.length > 0 && (
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
                    <Link to={recipePath(recipe)} className={s.recipeTitle} dir="auto">
                      {entry.title}
                    </Link>
                  ) : (
                    <span className={s.recipeTitle} dir="auto">
                      {entry.title}
                    </span>
                  )}
                  <span className="visually-hidden">{t('lists.itemsAdded', { count: entry.count })}</span>
                </span>
                <span className={cx(s.chipCount, 'tabular')} aria-hidden>
                  {formatNumber(entry.count)}
                </span>
                <button
                  type="button"
                  className={s.iconX}
                  aria-label={t('lists.takeOff', { title: entry.title })}
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
        <Plus size={18} strokeWidth={2} aria-hidden /> {recipes.length === 0 ? t('lists.addRecipe') : t('lists.addAnother')}
      </Link>
    </section>
  );

  // What the recipes need that you already have: a count, and the names on demand.
  const leftOffCard = leftOffCount > 0 && (
    <section className={s.card} aria-labelledby="left-off-title">
      <h2 id="left-off-title" className={s.cardTitle}>
        <button type="button" className={s.groupToggle} aria-expanded={showLeftOff} aria-controls="left-off-body" onClick={() => setShowLeftOff(!showLeftOff)}>
          <ChevronDown size={20} strokeWidth={2.2} aria-hidden className={cx(s.groupChevron, !showLeftOff && s.groupChevronShut)} />
          {t('lists.leftOffTitle')} <span className={cx(s.groupCount, 'tabular')}>{formatNumber(leftOffCount)}</span>
        </button>
      </h2>
      <div id="left-off-body" className={s.leftOffLists} hidden={!showLeftOff}>
        {leftOff.pantry.length > 0 && (
          <p>
            <Trans i18nKey="lists.pantryNames" values={{ count: leftOff.pantry.length, names: formatList(leftOff.pantry, 'unit') }} />
          </p>
        )}
        {leftOff.staples.length > 0 && (
          <p>
            <Trans i18nKey="lists.stapleNames" values={{ count: leftOff.staples.length, names: formatList(leftOff.staples, 'unit') }} />
          </p>
        )}
      </div>
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
      <EmptyState icon={ShoppingBag} title={t('lists.nothingToBuy')}>
        <p>{t('lists.emptyBody')}</p>
      </EmptyState>
    </section>
  );
  const readySection = ready.length > 0 && (
    <section className={s.ready} aria-labelledby="ready-title">
      <h2 id="ready-title" className={s.sectionTitle}>
        {t('lists.ready')}
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


  const sheets = (
    <>
      <Sheet open={editing !== undefined} onClose={() => setEditingId(null)} title={editing !== undefined ? <span dir="auto">{editing.name}</span> : t('lists.item')}>
        {editing !== undefined && <ItemForm key={editing.id} item={editing} groups={groups} onDone={() => setEditingId(null)} />}
      </Sheet>
      <Sheet open={groupSheet !== null} onClose={() => setGroupSheet(null)} title={editingGroup === null ? t('lists.newSection') : t('lists.editSection')}>
        {groupSheet !== null && <GroupForm key={groupSheet} group={editingGroup} items={items} endPosition={groupEndPosition(slots)} onDone={() => setGroupSheet(null)} />}
      </Sheet>
    </>
  );

  return (
    <div>
      {/* No subtitle: the progress bar counts the items and the recipes card lists the recipes. */}
      <PageHeader
        title={t('lists.title')}
        actions={
          desktop ? (
            <ButtonLink to="/library" variant="secondary" size="lg" icon={Plus}>
              {t('lists.addFromRecipe')}
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
            <ul className={s.recipeChips} aria-label={t('lists.onList')}>
              {recipes.map((entry) => {
                const recipe = recipeFor(entry.recipeId);
                return (
                  <li key={entry.recipeId} className={s.recipeChip}>
                    <span className={s.chipThumb}>
                      <RecipePhoto recipe={recipe ?? { title: entry.title }} />
                    </span>
                    <span className={s.chipTitle} dir="auto">
                      {entry.title}
                    </span>
                    <span className={s.chipCount}>{formatNumber(entry.count)}</span>
                    <button
                      type="button"
                      className={s.iconX}
                      aria-label={t('lists.takeOff', { title: entry.title })}
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
          {leftOffCard}
          {readySection}
          {checked.length > 0 && <div className={s.stickySpace} aria-hidden />}
          {checked.length > 0 && (
            <div className={s.stickyMove}>
              <Button variant="ghost" size="bar" block={checkedGroceries.length === 0} onClick={clearChecked}>
                {checkedGroceries.length > 0 ? t('lists.clear') : t('lists.clearCount', { count: checked.length })}
              </Button>
              {checkedGroceries.length > 0 && (
                <Button variant="sage" size="bar" icon={Milk} disabled={busy} className={s.moveMobile} onClick={() => void move()}>
                  {t('lists.moveToPantry', { count: checkedGroceries.length })}
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

function boxStyle(box: Box): CSSProperties {
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}
