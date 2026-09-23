import type { ReactNode } from 'react';
import { Checkbox, Chip, RadioList, Segmented, Tag, cx } from '../../../components/ui';
import type { DietProfile } from '../../../domain/types';
import { ruleLabels } from '../../../domain/kitchen/diet';
import { KCAL_MAX, KCAL_MIN, SORT_LABELS, SORT_SHORT, TIME_LABELS } from '../../../domain/kitchen/search';
import type { SearchFilters, SortKey, TimeBucket } from '../../../domain/kitchen/search';
import s from './Search.module.css';

/**
 * Every search filter. The desktop panel and the phone sheet show the same
 * controls in a different order and shape.
 */

type Buy = 'any' | '0' | '1' | '2' | '3';
type MinRating = 'any' | '3' | '4' | '4.5';

const SORT_KEYS: SortKey[] = ['fit', 'fewest', 'rating', 'kcal', 'time'];
const BUCKETS: TimeBucket[] = ['under30', '30to60', 'over60'];

function Group({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }): JSX.Element {
  return (
    <fieldset className={cx(s.group, className)}>
      <legend className={s.groupHead}>
        <span className={s.groupTitle}>{title}</span>
        {aside !== undefined && <span className={s.groupAside}>{aside}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

/** Two thumbs on one track; each is a real range input. */
function CalorieRange({ min, max, onChange }: { min: number; max: number; onChange: (min: number, max: number) => void }): JSX.Element {
  const pct = (value: number): number => ((value - KCAL_MIN) / (KCAL_MAX - KCAL_MIN)) * 100;
  return (
    <div className={s.range}>
      <div className={s.rangeTrack}>
        <span className={s.rangeFill} style={{ left: `${pct(min)}%`, right: `${100 - pct(max)}%` }} />
        <input
          type="range"
          aria-label="Fewest calories per serving"
          min={KCAL_MIN}
          max={KCAL_MAX}
          step={50}
          value={min}
          onChange={(event) => onChange(Math.min(Number(event.target.value), max - 50), max)}
        />
        <input
          type="range"
          aria-label="Most calories per serving"
          min={KCAL_MIN}
          max={KCAL_MAX}
          step={50}
          value={max}
          onChange={(event) => onChange(min, Math.max(Number(event.target.value), min + 50))}
        />
      </div>
      <div className={s.rangeEnds}>
        <span>{KCAL_MIN}</span>
        <span>{KCAL_MAX} kcal</span>
      </div>
    </div>
  );
}

export function calorieLabel(filters: SearchFilters): string {
  if (filters.kcalMin > KCAL_MIN) return `${filters.kcalMin}–${filters.kcalMax}`;
  return filters.kcalMax < KCAL_MAX ? `up to ${filters.kcalMax}` : 'any';
}

export function FilterControls({
  filters,
  onChange,
  profile,
  layout,
}: {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  profile: Pick<DietProfile, 'presets' | 'custom'> | null;
  layout: 'panel' | 'sheet';
}): JSX.Element {
  const set = (patch: Partial<SearchFilters>): void => onChange({ ...filters, ...patch });
  const rules = ruleLabels(profile);

  const sort =
    layout === 'panel' ? (
      <Group title="Sort by" key="sort">
        <RadioList
          label="Sort by"
          value={filters.sort}
          onChange={(sort) => set({ sort })}
          options={SORT_KEYS.map((key) => ({ value: key, label: SORT_LABELS[key] }))}
        />
      </Group>
    ) : (
      <Group title="Sort by" key="sort">
        <div className={s.chipWrap} role="radiogroup" aria-label="Sort by">
          {SORT_KEYS.map((key) => (
            <Chip key={key} selected={filters.sort === key} onClick={() => set({ sort: key })}>
              {key === 'fit' ? SORT_LABELS.fit : SORT_SHORT[key]}
            </Chip>
          ))}
        </div>
      </Group>
    );

  const buy = (
    <Group title="Items to buy" aside="at most" key="buy">
      <Segmented<Buy>
        label="Items to buy, at most"
        className={s.full}
        value={filters.maxBuy === null ? 'any' : (String(filters.maxBuy) as Buy)}
        onChange={(value) => set({ maxBuy: value === 'any' ? null : Number(value) })}
        options={[
          { value: '0', label: '0' },
          { value: '1', label: '≤ 1' },
          { value: '2', label: '≤ 2' },
          { value: '3', label: '≤ 3' },
          { value: 'any', label: 'Any' },
        ]}
      />
    </Group>
  );

  const time = (
    <Group title="Total time" key="time">
      <div className={s.chipWrap}>
        {BUCKETS.map((bucket) => {
          const on = filters.time.includes(bucket);
          return (
            <Chip
              key={bucket}
              selected={on}
              onClick={() => set({ time: on ? filters.time.filter((b) => b !== bucket) : [...filters.time, bucket] })}
            >
              {TIME_LABELS[bucket]}
            </Chip>
          );
        })}
      </div>
    </Group>
  );

  const calories = (
    <Group title="Calories per serving" aside={calorieLabel(filters)} key="kcal">
      <CalorieRange min={filters.kcalMin} max={filters.kcalMax} onChange={(kcalMin, kcalMax) => set({ kcalMin, kcalMax })} />
    </Group>
  );

  const rating = (
    <Group title="Star rating" key="rating">
      <Segmented<MinRating>
        label="Minimum star rating"
        className={s.full}
        value={filters.minRating === null ? 'any' : (String(filters.minRating) as MinRating)}
        onChange={(value) => set({ minRating: value === 'any' ? null : Number(value) })}
        options={[
          { value: 'any', label: 'Any' },
          { value: '3', label: '3+' },
          { value: '4', label: '4+' },
          { value: '4.5', label: '4.5+' },
        ]}
      />
    </Group>
  );

  const diet = (
    <Group title="Diet match" key="diet">
      <Checkbox size={26} checked={filters.matchProfile} onChange={(matchProfile) => set({ matchProfile })}>
        Matches my profile
      </Checkbox>
      {rules.length > 0 && (
        <div className={s.ruleTags}>
          {rules.map((rule) => (
            <Tag key={rule} className={s.ruleTag}>
              {rule}
            </Tag>
          ))}
        </div>
      )}
      <p className={s.subLabel}>Recipes that conflict</p>
      <Segmented<'hide' | 'warn'>
        label="Recipes that conflict"
        className={s.full}
        value={filters.conflictMode}
        onChange={(conflictMode) => set({ conflictMode })}
        options={[
          { value: 'hide', label: 'Hide' },
          { value: 'warn', label: 'Show with warning' },
        ]}
      />
    </Group>
  );

  const source = (
    <Group title="Source" key="source">
      <div className={s.sourceRow}>
        <Checkbox size={26} checked={filters.library} onChange={(library) => set({ library })}>
          Library
        </Checkbox>
        <Checkbox size={26} checked={filters.web} onChange={(web) => set({ web })}>
          Web
        </Checkbox>
      </div>
    </Group>
  );

  const order = layout === 'panel' ? [sort, buy, time, calories, rating, diet, source] : [sort, buy, diet, time, rating, calories, source];
  return <div className={cx(s.filters, layout === 'sheet' && s.filtersSheet)}>{order}</div>;
}
