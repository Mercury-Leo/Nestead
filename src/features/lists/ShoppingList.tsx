import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Check, ChevronDown, Ellipsis, Milk, Plus, ShoppingBag, X } from 'lucide-react';
import { useSession } from '../../auth/session';
import { PageHeader } from '../../components/PageHeader';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { Button, ButtonLink, EmptyState, IconButton, Sheet, cx } from '../../components/ui';
import type { ListItem } from '../../domain/types';
import {
  BUILT_IN_GROUPS,
  GENERAL,
  SUPERMARKET,
  groupOf,
  isGrocery,
  leftOffList,
  recipesOnList,
} from '../../domain/kitchen/list';
import { pantryFit } from '../../domain/kitchen/fit';
import { addOwnToList, moveToPantry, removeRecipeFromList } from '../larder/actions';
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

  const items = kitchen.listItems;
  const groups: Group[] = [
    ...BUILT_IN_GROUPS.map((group) => ({ id: group.id, name: groupName(t, group) })),
    ...kitchen.listGroups.map((row) => ({ id: row.id, name: row.name, row })),
  ];
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

  // i18n: staple names are catalog names (English), lower-cased to sit mid-sentence.
  const staplesLike = leftOff.staples.slice(0, 2).map((name) => name.toLowerCase());
  const leftOffText = (
    <Trans
      i18nKey={staplesLike.length > 0 ? 'lists.leftOffLike' : 'lists.leftOff'}
      values={{
        ingredients: t('common.ingredients', { count: leftOffCount }),
        pantry: leftOff.pantry.length,
        staples: t('common.staples', { count: leftOff.staples.length }),
        examples: formatList(staplesLike),
      }}
    />
  );

  const progress = items.length > 0 && (
    <div className={s.progressWrap}>
      <div className={s.progressHead}>
        <span>
          <Trans i18nKey="lists.progress" values={{ checked: checked.length, total: items.length }} />
        </span>
      </div>
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
    </div>
  );

  const actionBar = checked.length > 0 && desktop && (
    <div className={s.actionBar}>
      <span className={s.actionText}>
        <Check size={20} strokeWidth={2.2} aria-hidden />
        <span>
          <Trans i18nKey="lists.checked" values={{ count: checked.length, names: formatList(checked.map((item) => item.name)) }} />
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
    return (
      <section key={group.id} className={s.card} aria-labelledby={titleId}>
        <header className={s.groupHead}>
          <h2 id={titleId} className={s.cardTitle}>
            <bdi>{group.name}</bdi> {rows.length > 0 && <span className={s.groupCount}>{formatNumber(rows.length)}</span>}
          </h2>
          {group.row !== undefined && (
            <IconButton label={t('lists.renameGroup', { name: group.name })} icon={Ellipsis} onClick={() => setGroupSheet(group.id)} />
          )}
        </header>
        {rows.length === 0 && group.id === SUPERMARKET && (
          <p className={s.muted}>
            <Trans i18nKey="lists.supermarketEmpty" />
          </p>
        )}
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
      </section>
    );
  });

  const newSection = (
    <button type="button" className={s.addAnother} onClick={() => setGroupSheet('new')}>
      <Plus size={18} strokeWidth={2} aria-hidden /> {t('lists.newSection')}
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
        {t('lists.onList')}
      </h2>
      {recipes.length === 0 ? (
        <p className={s.muted}>{t('lists.noRecipes')}</p>
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
                    <Link to={recipePath(recipe)} className={s.recipeTitle} dir="auto">
                      {entry.title}
                    </Link>
                  ) : (
                    <span className={s.recipeTitle} dir="auto">
                      {entry.title}
                    </span>
                  )}
                  <span className={s.muted}>{t('lists.itemsAdded', { count: entry.count })}</span>
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

  const leftOffCard = leftOffCount > 0 && (
    <section className={s.card} aria-labelledby="left-off-title">
      <h2 id="left-off-title" className={s.cardTitle}>
        {t('lists.leftOffTitle')}
      </h2>
      <p className={s.leftOff}>{leftOffText}</p>
      <button type="button" className={s.showThem} aria-expanded={showLeftOff} onClick={() => setShowLeftOff(!showLeftOff)}>
        {showLeftOff ? t('lists.hideThem') : t('lists.showThem')}{' '}
        <ChevronDown size={16} strokeWidth={2.2} aria-hidden className={cx(showLeftOff && s.flip)} />
      </button>
      {showLeftOff && (
        <div className={s.leftOffLists}>
          <p>
            <Trans i18nKey="lists.pantryNames" values={{ names: formatList(leftOff.pantry, 'unit') }} />
          </p>
          <p>
            <Trans i18nKey="lists.stapleNames" values={{ names: formatList(leftOff.staples, 'unit') }} />
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

  const forRecipes = items.filter((item) => item.parts.length > 0).length;
  const itemCount = t('common.items', { count: items.length });
  const subtitle =
    items.length === 0
      ? t('lists.subtitleEmpty')
      : recipes.length === 0
        ? itemCount
        : forRecipes === items.length
          ? t('lists.subtitleAll', { items: itemCount, recipes: t('common.recipes', { count: recipes.length }) })
          : t('lists.subtitleSome', { items: itemCount, count: forRecipes, recipes: t('common.recipes', { count: recipes.length }) });

  const sheets = (
    <>
      <Sheet open={editing !== undefined} onClose={() => setEditingId(null)} title={editing !== undefined ? <span dir="auto">{editing.name}</span> : t('lists.item')}>
        {editing !== undefined && <ItemForm key={editing.id} item={editing} groups={groups} onDone={() => setEditingId(null)} />}
      </Sheet>
      <Sheet open={groupSheet !== null} onClose={() => setGroupSheet(null)} title={editingGroup === null ? t('lists.newSection') : t('lists.editSection')}>
        {groupSheet !== null && <GroupForm key={groupSheet} group={editingGroup} items={items} onDone={() => setGroupSheet(null)} />}
      </Sheet>
    </>
  );

  return (
    <div>
      <PageHeader
        title={t('lists.title')}
        subtitle={subtitle}
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
          {leftOffCount > 0 && <p className={s.leftOffLine}>{leftOffText}</p>}
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
