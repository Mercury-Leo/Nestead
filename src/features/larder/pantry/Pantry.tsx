import { useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { List, Milk, Plus, X } from 'lucide-react';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { useIsDesktop } from '../../../components/useMediaQuery';
import { Button, Chip, EmptyState, RemovableChip, Segmented, Sheet, TextField, cx } from '../../../components/ui';
import type { PantryItem, StoreSection } from '../../../domain/types';
import { keyForText } from '../../../domain/kitchen/fit';
import { pantryFit } from '../../../domain/kitchen/fit';
import { canonicalId } from '../../../domain/kitchen/normalize';
import { addToPantry } from '../actions';
import { useKitchen } from '../KitchenContext';
import { pantryRow } from '../seed/kitchen';
import { StatusMarker } from '../detail/RecipeDetail';
import { PantryAdd, pantryKeys } from './PantryAdd';
import s from './Pantry.module.css';

const SECTIONS: StoreSection[] = [
  'Produce',
  'Meat & fish',
  'Dairy & eggs',
  'Bakery',
  'Grains & pasta',
  'Cans & jars',
  'International aisle',
  'Spices & dried herbs',
  'Baking',
  'Frozen',
  'Drinks',
  'Other',
];

const QUICK_ADD = ['Eggs', 'Onions', 'Garlic', 'Rice', 'Pasta', 'Lemons', 'Butter', 'Canned tomatoes'];

export function groupBySection<T extends { section: StoreSection }>(items: readonly T[]): [StoreSection, T[]][] {
  return SECTIONS.map((section) => [section, items.filter((item) => item.section === section)] as [StoreSection, T[]]).filter(
    ([, rows]) => rows.length > 0,
  );
}

/** A row you can swipe left to reveal Remove. The × button does the same. */
function SwipeRow({ item, onRemove }: { item: PantryItem; onRemove: () => void }): JSX.Element {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const REVEAL = 96;

  const down = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse') return;
    start.current = { x: event.clientX - dx, y: event.clientY, id: event.pointerId };
  };
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const origin = start.current;
    if (origin === null) return;
    const x = event.clientX - origin.x;
    if (Math.abs(event.clientY - origin.y) > Math.abs(x) && dx === 0) return;
    setDx(Math.max(-REVEAL, Math.min(0, x)));
  };
  const up = (): void => {
    start.current = null;
    setDx((value) => (value < -REVEAL / 2 ? -REVEAL : 0));
  };

  return (
    <li className={cx(s.swipe, dx !== 0 && s.swipeOpen)}>
      <button type="button" className={s.swipeAction} tabIndex={dx === 0 ? -1 : 0} onClick={onRemove}>
        Remove
      </button>
      <div
        className={s.swipeFront}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <span className={s.swipeName}>{item.name}</span>
        <button type="button" className={s.rowRemove} aria-label={`Remove ${item.name}`} onClick={onRemove}>
          <X size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </li>
  );
}

function BulkAdd({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: PantryItem[] }): JSX.Element {
  const { store } = useSession();
  const [text, setText] = useState('');
  const keys = pantryKeys(existing.filter((item) => item.kind === 'have'));
  const names = [
    ...new Set(
      text
        .split(/[\n,]/)
        .map((part) => part.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter((part) => part !== ''),
    ),
  ];
  const parsed = names.map((name) => {
    const id = canonicalId(name);
    return { name, id, already: keys.has(keyForText(name, id)) };
  });
  const toAdd = parsed.filter((row) => !row.already);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Bulk add"
      footer={
        <Button
          variant="primary"
          size="bar"
          block
          disabled={toAdd.length === 0}
          onClick={() => {
            void addToPantry(store, toAdd.map((row) => row.name), 'have', existing).then(() => {
              setText('');
              onClose();
            });
          }}
        >
          Add {toAdd.length} item{toAdd.length === 1 ? '' : 's'}
        </Button>
      }
    >
      <label className={s.bulkLabel} htmlFor="bulk-text">
        Paste or type what you have, one per line or separated by commas.
      </label>
      <textarea
        id="bulk-text"
        className={s.bulkText}
        rows={6}
        value={text}
        placeholder={'eggs\nfeta\nbasil, lemons'}
        onChange={(event) => setText(event.target.value)}
      />
      {parsed.length > 0 && (
        <ul className={s.bulkPreview} aria-label="Preview">
          {parsed.map((row) => (
            <li key={row.name}>
              <span>{row.name}</span>
              <span className={s.bulkStatus}>
                {row.already ? 'Already in your pantry' : row.id !== undefined ? pantryRow(row.name, 'have').section : 'New item · Other'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

export function Pantry(): JSX.Element {
  const { store } = useSession();
  const kitchen = useKitchen();
  const desktop = useIsDesktop();
  const [tab, setTab] = useState<'have' | 'staple'>('have');
  const [bulk, setBulk] = useState(false);
  const [staple, setStaple] = useState('');

  const all = [...kitchen.have, ...kitchen.staples];
  const haveKeys = useMemo(() => pantryKeys(kitchen.have), [kitchen.have]);

  // "Needed for": things missing from recipes on the list, then from the
  // recipes that are closest to cookable.
  const neededFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of kitchen.listItems) {
      const title = item.parts[0]?.recipeTitle;
      if (item.canonicalId !== undefined && title !== undefined && !map.has(item.canonicalId)) map.set(item.canonicalId, title);
    }
    const ranked = kitchen.recipes
      .map((recipe) => ({ recipe, fit: pantryFit(recipe, kitchen.pantry) }))
      .filter(({ fit }) => fit.missing > 0)
      .sort((a, b) => b.fit.ratio - a.fit.ratio)
      .slice(0, 5);
    for (const { recipe, fit } of ranked) {
      for (const line of fit.missingLines) {
        const id = line.canonicalId;
        if (id !== undefined && !map.has(id)) map.set(id, recipe.title);
      }
    }
    return map;
  }, [kitchen.listItems, kitchen.recipes, kitchen.pantry]);

  const addHave = (names: string[]): void => {
    void addToPantry(store, names, 'have', all);
  };
  const addStaple = (): void => {
    const name = staple.trim();
    if (name === '') return;
    setStaple('');
    void addToPantry(store, [name], 'staple', all);
  };
  const remove = (item: PantryItem): void => {
    void store.pantry.remove(item.id);
  };

  const groups = groupBySection(kitchen.have);
  const empty = kitchen.loaded && kitchen.have.length === 0;

  const haveCard = empty ? (
    <section className={cx(s.card, s.emptyCard)} aria-label="Have now">
      <EmptyState icon={Milk} title="Your pantry is empty" className={s.empty}>
        <p>Add what’s in your kitchen and Larder will show what you can cook tonight — and leave those items off your shopping lists.</p>
      </EmptyState>
      <PantryAdd onAdd={addHave} existingKeys={haveKeys} neededFor={neededFor} placeholder="Type an item — e.g. eggs" autoFocus inline={!desktop} />
      <Button variant="ghost" icon={List} onClick={() => setBulk(true)} className={s.pasteLink}>
        Paste a list to bulk add
      </Button>
      <p className={s.quickLabel}>Quick add</p>
      <div className={s.quick}>
        {QUICK_ADD.map((name) => (
          <Chip key={name} icon={Plus} onClick={() => addHave([name])}>
            {name}
          </Chip>
        ))}
      </div>
    </section>
  ) : (
    <section className={s.card} aria-labelledby="have-title">
      {desktop && (
        <header className={s.cardHead}>
          <h2 id="have-title" className={s.cardTitle}>
            Have now
          </h2>
          <span className={s.cardMeta}>
            <strong>{kitchen.have.length} items</strong> · grouped by aisle
          </span>
        </header>
      )}
      <PantryAdd onAdd={addHave} existingKeys={haveKeys} neededFor={neededFor} inline={!desktop} />
      {desktop ? (
        groups.map(([section, rows]) => (
          <div key={section} className={s.group}>
            <h3 className={s.groupTitle}>
              {section} <span className={s.groupCount}>{rows.length}</span>
            </h3>
            <div className={s.chips}>
              {rows.map((item) => (
                <RemovableChip key={item.id} tone="sunk" removeLabel={`Remove ${item.name}`} onRemove={() => remove(item)}>
                  {item.name}
                </RemovableChip>
              ))}
            </div>
          </div>
        ))
      ) : (
        <>
          <p className={s.swipeHint}>Swipe left to remove</p>
          {groups.map(([section, rows]) => (
            <div key={section} className={s.group}>
              <h3 className={s.groupEyebrow}>
                {section} <span className={s.groupCount}>{rows.length}</span>
              </h3>
              <ul className={s.rows}>
                {rows.map((item) => (
                  <SwipeRow key={item.id} item={item} onRemove={() => remove(item)} />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );

  const staplesCard = (
    <section className={cx(s.card, s.staplesCard)} aria-labelledby="staples-title">
      {desktop && (
        <header className={s.cardHead}>
          <h2 id="staples-title" className={s.cardTitle}>
            Always have
          </h2>
          <span className={s.cardMeta}>{kitchen.staples.length} staples</span>
        </header>
      )}
      <p className={s.staplesNote}>Assumed present in every recipe. Staples never land on a shopping list.</p>
      <ul className={s.staples}>
        {kitchen.staples.map((item) => (
          <li key={item.id}>
            <StatusMarker status="staple" />
            <span className={s.stapleName}>{item.name}</span>
            <button type="button" className={s.rowRemove} aria-label={`Remove ${item.name} from staples`} onClick={() => remove(item)}>
              <X size={18} strokeWidth={2} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <form
        className={s.stapleForm}
        onSubmit={(event) => {
          event.preventDefault();
          addStaple();
        }}
      >
        <TextField label="Add a staple" placeholder="Add a staple" value={staple} onChange={(event) => setStaple(event.target.value)} wrapClassName={s.stapleInput} />
        <Button type="submit" variant="secondary" size="lg" icon={Plus} disabled={staple.trim() === ''}>
          Add
        </Button>
      </form>
    </section>
  );

  return (
    <div>
      <PageHeader
        title="Pantry"
        subtitle="What you have now, plus the staples Larder assumes are always in your kitchen."
        actions={
          desktop && !empty ? (
            <Button variant="secondary" size="lg" icon={List} onClick={() => setBulk(true)}>
              Bulk add
            </Button>
          ) : undefined
        }
      />

      {desktop ? (
        <div className={s.layout}>
          {haveCard}
          {staplesCard}
        </div>
      ) : (
        <>
          <Segmented
            label="Pantry"
            className={s.tabs}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'have', label: `Have now · ${kitchen.have.length}` },
              { value: 'staple', label: `Always have · ${kitchen.staples.length}` },
            ]}
          />
          {tab === 'have' ? haveCard : staplesCard}
          {tab === 'have' && !empty && (
            <Button variant="secondary" block icon={List} onClick={() => setBulk(true)} className={s.mobileBulk}>
              Bulk add
            </Button>
          )}
        </>
      )}

      <BulkAdd open={bulk} onClose={() => setBulk(false)} existing={all} />
    </div>
  );
}
