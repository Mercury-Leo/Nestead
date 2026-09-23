import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Milk, Plus, ShoppingBag, X } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { useIsDesktop } from '../../../components/useMediaQuery';
import { Button, ButtonLink, Checkbox, EmptyState, cx } from '../../../components/ui';
import type { ListItem } from '../../../domain/types';
import { formatListQty, leftOffList, recipesOnList } from '../../../domain/kitchen/list';
import { pantryFit } from '../../../domain/kitchen/fit';
import { moveToPantry, removeRecipeFromList } from '../actions';
import { useKitchen } from '../KitchenContext';
import { groupBySection } from '../pantry/Pantry';
import { RecipeCard, RecipeGrid, RecipeList, RecipeRow } from '../RecipeCard';
import { RecipePhoto } from '../RecipePhoto';
import { recipePath, recipeView } from '../recipeView';
import s from './ShoppingList.module.css';

function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function forLine(item: ListItem): string {
  return `for ${listJoin([...new Set(item.parts.map((part) => part.recipeTitle))])}`;
}

export function ShoppingList(): JSX.Element {
  const { store } = useSession();
  const kitchen = useKitchen();
  const desktop = useIsDesktop();
  const [showLeftOff, setShowLeftOff] = useState(false);
  const [busy, setBusy] = useState(false);

  const items = kitchen.listItems;
  const checked = items.filter((item) => item.checked);
  const recipes = recipesOnList(items);
  const recipeFor = (id: string) => kitchen.findRecipe(id);
  const leftOff = leftOffList(
    recipes.map((entry) => recipeFor(entry.recipeId)).filter((recipe) => recipe !== undefined),
    kitchen.pantry,
  );
  const leftOffCount = leftOff.pantry.length + leftOff.staples.length;

  const toggle = (item: ListItem, value: boolean): void => {
    void store.listItems.update(item.id, { checked: value });
  };
  const clearChecked = (): void => {
    for (const item of checked) void store.listItems.remove(item.id);
  };
  const move = async (): Promise<void> => {
    setBusy(true);
    try {
      await moveToPantry(store, checked, [...kitchen.have, ...kitchen.staples]);
    } finally {
      setBusy(false);
    }
  };

  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

  if (kitchen.loaded && items.length === 0) {
    const ready = kitchen.recipes
      .map((recipe) => recipeView({ ...recipe, inLibrary: true }, kitchen.pantry, kitchen.profile, { fit: pantryFit(recipe, kitchen.pantry) }))
      .filter((view) => view.fit.missing === 0);
    return (
      <div>
        <PageHeader title="Shopping list" subtitle="Only what you don’t already have." />
        <div className={s.layout}>
          <div>
            <section className={cx(s.card, s.emptyCard)}>
              <EmptyState
                icon={ShoppingBag}
                title="Nothing to buy"
                actions={
                  <>
                    <ButtonLink to="/library" variant="primary" size="lg">
                      Browse library
                    </ButtonLink>
                    <ButtonLink to="/search?pantry=1" variant="secondary" size="lg" icon={Milk}>
                      Cook from my pantry
                    </ButtonLink>
                  </>
                }
              >
                <p>
                  Open a recipe and tap <strong>Make shopping list</strong>. Larder adds only what’s missing from your pantry, grouped by store
                  section.
                </p>
              </EmptyState>
            </section>
            {ready.length > 0 && (
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
            )}
          </div>
          {desktop && (
            <aside className={s.side}>
              <section className={s.card}>
                <h2 className={s.cardTitle}>Recipes on this list</h2>
                <p className={s.muted}>No recipes yet. Add one and only its missing ingredients come across.</p>
              </section>
            </aside>
          )}
        </div>
      </div>
    );
  }

  const staplesLike = leftOff.staples.slice(0, 2).map((name) => name.toLowerCase());
  const leftOffText = (
    <>
      {plural(leftOffCount, 'ingredient')} you already have — <strong>{leftOff.pantry.length} from your pantry</strong> and{' '}
      <strong>{plural(leftOff.staples.length, 'staple')}</strong>
      {staplesLike.length > 0 && ` like ${listJoin(staplesLike)}`}.
    </>
  );

  const list = (
    <section className={s.card} aria-label="Shopping list">
      <div className={s.progressHead}>
        <span>
          <strong>
            {checked.length} of {items.length}
          </strong>{' '}
          checked off
        </span>
        {desktop && <span className={s.muted}>Grouped by store section</span>}
      </div>
      <div
        className={s.progress}
        role="progressbar"
        aria-label="Checked off"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={checked.length}
      >
        <span style={{ width: `${items.length === 0 ? 0 : (checked.length / items.length) * 100}%` }} />
      </div>

      {groupBySection(items).map(([section, rows]) => (
        <div key={section} className={s.group}>
          <h3 className={s.groupTitle}>
            {section} <span className={s.groupCount}>{rows.length}</span>
          </h3>
          <ul className={s.rows}>
            {rows.map((item) => (
              <li key={item.id} className={cx(s.row, item.checked && s.rowChecked)}>
                <Checkbox size={26} checked={item.checked} onChange={(value) => toggle(item, value)} className={s.rowCheck}>
                  <span className={s.rowText}>
                    <span className={s.rowName}>{item.name}</span>
                    <span className={s.rowFor}>{forLine(item)}</span>
                  </span>
                </Checkbox>
                <span className={cx(s.rowQty, 'tabular')}>{formatListQty(item.parts)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {checked.length > 0 && desktop && (
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
          <Button variant="sage" size="lg" icon={Milk} disabled={busy} onClick={() => void move()}>
            Move {checked.length} to pantry
          </Button>
        </div>
      )}
    </section>
  );

  const onList = (
    <section className={s.card} aria-labelledby="on-list-title">
      <h2 id="on-list-title" className={s.cardTitle}>
        Recipes on this list
      </h2>
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
      <Link to="/library" className={s.addAnother}>
        <Plus size={18} strokeWidth={2} aria-hidden /> Add another recipe
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

  return (
    <div>
      <PageHeader
        title="Shopping list"
        subtitle={`${plural(items.length, 'item')} from ${plural(recipes.length, 'recipe')} — only what you don’t already have.`}
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
          {list}
          <aside className={s.side}>
            {onList}
            {leftOffCard}
          </aside>
        </div>
      ) : (
        <>
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
          {list}
          {leftOffCount > 0 && <p className={s.leftOffLine}>{leftOffText}</p>}
          {checked.length > 0 && <div className={s.stickySpace} aria-hidden />}
          {checked.length > 0 && (
            <div className={s.stickyMove}>
              <Button variant="ghost" onClick={clearChecked} className={s.clearMobile}>
                Clear
              </Button>
              <Button variant="sage" size="bar" block icon={Milk} disabled={busy} onClick={() => void move()}>
                Move {checked.length} checked to pantry
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
