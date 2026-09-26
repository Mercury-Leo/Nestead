import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, Chip, RadioList, Segmented, Tag, cx } from '../../../components/ui';
import type { DietProfile } from '../../../domain/types';
import { KCAL_MAX, KCAL_MIN } from '../../../domain/kitchen/search';
import type { SearchFilters, SortKey, TimeBucket } from '../../../domain/kitchen/search';
import { formatNumber } from '../../../i18n';
import { ruleLabels, sortLabel, sortShort, timeLabel } from '../labels';
import { calorieLabel } from './filterLabels';
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
  const { t } = useTranslation();
  const pct = (value: number): number => ((value - KCAL_MIN) / (KCAL_MAX - KCAL_MIN)) * 100;
  return (
    <div className={s.range}>
      <div className={s.rangeTrack}>
        <span className={s.rangeFill} style={{ insetInlineStart: `${pct(min)}%`, insetInlineEnd: `${100 - pct(max)}%` }} />
        <input
          type="range"
          aria-label={t('search.filter.kcalMinLabel')}
          min={KCAL_MIN}
          max={KCAL_MAX}
          step={50}
          value={min}
          onChange={(event) => onChange(Math.min(Number(event.target.value), max - 50), max)}
        />
        <input
          type="range"
          aria-label={t('search.filter.kcalMaxLabel')}
          min={KCAL_MIN}
          max={KCAL_MAX}
          step={50}
          value={max}
          onChange={(event) => onChange(min, Math.max(Number(event.target.value), min + 50))}
        />
      </div>
      <div className={s.rangeEnds}>
        <span>{formatNumber(KCAL_MIN)}</span>
        <span>{t('search.filter.kcalEnd', { kcal: KCAL_MAX })}</span>
      </div>
    </div>
  );
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
  const { t } = useTranslation();
  const set = (patch: Partial<SearchFilters>): void => onChange({ ...filters, ...patch });
  const rules = ruleLabels(t, profile);

  const sort =
    layout === 'panel' ? (
      <Group title={t('search.filter.sortBy')} key="sort">
        <RadioList
          label={t('search.filter.sortBy')}
          value={filters.sort}
          onChange={(sort) => set({ sort })}
          options={SORT_KEYS.map((key) => ({ value: key, label: sortLabel(t, key) }))}
        />
      </Group>
    ) : (
      <Group title={t('search.filter.sortBy')} key="sort">
        <div className={s.chipWrap} role="radiogroup" aria-label={t('search.filter.sortBy')}>
          {SORT_KEYS.map((key) => (
            <Chip key={key} selected={filters.sort === key} onClick={() => set({ sort: key })}>
              {key === 'fit' ? sortLabel(t, key) : sortShort(t, key)}
            </Chip>
          ))}
        </div>
      </Group>
    );

  const buy = (
    <Group title={t('search.filter.itemsToBuy')} aside={t('search.filter.atMost')} key="buy">
      <Segmented<Buy>
        label={t('search.filter.itemsToBuyLabel')}
        className={s.full}
        value={filters.maxBuy === null ? 'any' : (String(filters.maxBuy) as Buy)}
        onChange={(value) => set({ maxBuy: value === 'any' ? null : Number(value) })}
        options={[
          { value: '0', label: formatNumber(0) },
          { value: '1', label: t('search.filter.atMostOption', { count: 1 }) },
          { value: '2', label: t('search.filter.atMostOption', { count: 2 }) },
          { value: '3', label: t('search.filter.atMostOption', { count: 3 }) },
          { value: 'any', label: t('search.filter.any') },
        ]}
      />
    </Group>
  );

  const time = (
    <Group title={t('search.filter.totalTime')} key="time">
      <div className={s.chipWrap}>
        {BUCKETS.map((bucket) => {
          const on = filters.time.includes(bucket);
          return (
            <Chip
              key={bucket}
              selected={on}
              onClick={() => set({ time: on ? filters.time.filter((b) => b !== bucket) : [...filters.time, bucket] })}
            >
              {timeLabel(t, bucket)}
            </Chip>
          );
        })}
      </div>
    </Group>
  );

  const calories = (
    <Group title={t('search.filter.calories')} aside={calorieLabel(t, filters)} key="kcal">
      <CalorieRange min={filters.kcalMin} max={filters.kcalMax} onChange={(kcalMin, kcalMax) => set({ kcalMin, kcalMax })} />
    </Group>
  );

  const rating = (
    <Group title={t('search.filter.rating')} key="rating">
      <Segmented<MinRating>
        label={t('search.filter.minRating')}
        className={s.full}
        value={filters.minRating === null ? 'any' : (String(filters.minRating) as MinRating)}
        onChange={(value) => set({ minRating: value === 'any' ? null : Number(value) })}
        options={[
          { value: 'any', label: t('search.filter.any') },
          { value: '3', label: t('search.filter.ratingOption', { rating: formatNumber(3) }) },
          { value: '4', label: t('search.filter.ratingOption', { rating: formatNumber(4) }) },
          { value: '4.5', label: t('search.filter.ratingOption', { rating: formatNumber(4.5) }) },
        ]}
      />
    </Group>
  );

  const diet = (
    <Group title={t('search.filter.diet')} key="diet">
      <Checkbox size={26} checked={filters.matchProfile} onChange={(matchProfile) => set({ matchProfile })}>
        {t('search.filter.matchesProfile')}
      </Checkbox>
      {rules.length > 0 && (
        <div className={s.ruleTags}>
          {rules.map((rule) => (
            <Tag key={rule} className={s.ruleTag}>
              <bdi>{rule}</bdi>
            </Tag>
          ))}
        </div>
      )}
      <p className={s.subLabel}>{t('search.filter.conflicts')}</p>
      <Segmented<'hide' | 'warn'>
        label={t('search.filter.conflicts')}
        className={s.full}
        value={filters.conflictMode}
        onChange={(conflictMode) => set({ conflictMode })}
        options={[
          { value: 'hide', label: t('search.filter.hide') },
          { value: 'warn', label: t('search.filter.warn') },
        ]}
      />
    </Group>
  );

  const source = (
    <Group title={t('search.filter.source')} key="source">
      <div className={s.sourceRow}>
        <Checkbox size={26} checked={filters.library} onChange={(library) => set({ library })}>
          {t('search.filter.library')}
        </Checkbox>
        <Checkbox size={26} checked={filters.web} onChange={(web) => set({ web })}>
          {t('search.filter.web')}
        </Checkbox>
      </div>
    </Group>
  );

  const order = layout === 'panel' ? [sort, buy, time, calories, rating, diet, source] : [sort, buy, diet, time, rating, calories, source];
  return <div className={cx(s.filters, layout === 'sheet' && s.filtersSheet)}>{order}</div>;
}
