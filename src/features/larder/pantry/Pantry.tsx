import { useMemo, useState } from 'react';
import { List, Milk, Plus, X } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { useDirection } from '../../../hooks/useDirection';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import { Button, Chip, EmptyState, RemovableChip, Segmented, TextField, cx } from '../../../components/ui';
import type { PantryItem } from '../../../domain/types';
import { pantryFit } from '../../../domain/kitchen/fit';
import { addToPantry } from '../actions';
import { useKitchen } from '../KitchenContext';
import { groupBySection } from '../../../domain/kitchen/sections';
import { formatNumber } from '../../../i18n';
import { sectionLabel } from '../labels';
import { StatusMarker } from '../recipe/StatusMarker';
import { PantryAdd, pantryKeys } from './PantryAdd';
import { BulkAdd } from './BulkAdd';
import s from './Pantry.module.css';
import { SwipeRow } from './SwipeRow';

// i18n: these become pantry rows, matched against the English catalog, so they stay English like the seed data.
const QUICK_ADD = ['Eggs', 'Onions', 'Garlic', 'Rice', 'Pasta', 'Lemons', 'Butter', 'Canned tomatoes'];

export function Pantry(): JSX.Element {
  const { t } = useTranslation();
  const { store } = useSession();
  const kitchen = useKitchen();
  const desktop = useIsDesktop();
  const rtl = useDirection() === 'rtl';
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
    <section className={cx(s.card, s.emptyCard)} aria-label={t('pantry.haveNow')}>
      <EmptyState icon={Milk} title={t('pantry.empty.title')} className={s.empty}>
        <p>{t('pantry.empty.body')}</p>
      </EmptyState>
      <PantryAdd onAdd={addHave} existingKeys={haveKeys} neededFor={neededFor} placeholder={t('pantry.empty.placeholder')} autoFocus inline={!desktop} />
      <Button variant="ghost" icon={List} onClick={() => setBulk(true)} className={s.pasteLink}>
        {t('pantry.paste')}
      </Button>
      <p className={s.quickLabel}>{t('pantry.quickAdd')}</p>
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
            {t('pantry.haveNow')}
          </h2>
          <span className={s.cardMeta}>
            <Trans i18nKey="pantry.meta" count={kitchen.have.length} />
          </span>
        </header>
      )}
      <PantryAdd onAdd={addHave} existingKeys={haveKeys} neededFor={neededFor} inline={!desktop} />
      {desktop ? (
        groups.map(([section, rows]) => (
          <div key={section} className={s.group}>
            <h3 className={s.groupTitle}>
              {sectionLabel(t, section)} <span className={s.groupCount}>{formatNumber(rows.length)}</span>
            </h3>
            <div className={s.chips}>
              {rows.map((item) => (
                <RemovableChip key={item.id} tone="sunk" removeLabel={t('pantry.remove', { name: item.name })} onRemove={() => remove(item)}>
                  <span dir="auto">{item.name}</span>
                </RemovableChip>
              ))}
            </div>
          </div>
        ))
      ) : (
        <>
          <p className={s.swipeHint}>{rtl ? t('pantry.swipeHintRtl') : t('pantry.swipeHintLtr')}</p>
          {groups.map(([section, rows]) => (
            <div key={section} className={s.group}>
              <h3 className={s.groupEyebrow}>
                {sectionLabel(t, section)} <span className={s.groupCount}>{formatNumber(rows.length)}</span>
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
            {t('pantry.alwaysHave')}
          </h2>
          <span className={s.cardMeta}>{t('common.staples', { count: kitchen.staples.length })}</span>
        </header>
      )}
      <p className={s.staplesNote}>{t('pantry.staplesNote')}</p>
      <ul className={s.staples}>
        {kitchen.staples.map((item) => (
          <li key={item.id}>
            <StatusMarker status="staple" />
            <span className={s.stapleName} dir="auto">
              {item.name}
            </span>
            <button type="button" className={s.rowRemove} aria-label={t('pantry.removeStaple', { name: item.name })} onClick={() => remove(item)}>
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
        <TextField label={t('pantry.addStaple')} placeholder={t('pantry.addStaple')} dir="auto" value={staple} onChange={(event) => setStaple(event.target.value)} wrapClassName={s.stapleInput} />
        <Button type="submit" variant="secondary" size="lg" icon={Plus} disabled={staple.trim() === ''}>
          {t('common.add')}
        </Button>
      </form>
    </section>
  );

  return (
    <div>
      <PageHeader
        title={t('pantry.title')}
        subtitle={t('pantry.subtitle')}
        actions={
          desktop && !empty ? (
            <Button variant="secondary" size="lg" icon={List} onClick={() => setBulk(true)}>
              {t('pantry.bulkAdd')}
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
            wrap
            label={t('pantry.tabs')}
            className={s.tabs}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'have', label: t('pantry.haveTab', { count: kitchen.have.length }) },
              { value: 'staple', label: t('pantry.alwaysTab', { count: kitchen.staples.length }) },
            ]}
          />
          {tab === 'have' ? haveCard : staplesCard}
          {tab === 'have' && !empty && (
            <Button variant="secondary" block icon={List} onClick={() => setBulk(true)} className={s.mobileBulk}>
              {t('pantry.bulkAdd')}
            </Button>
          )}
        </>
      )}

      <BulkAdd open={bulk} onClose={() => setBulk(false)} existing={all} />
    </div>
  );
}
