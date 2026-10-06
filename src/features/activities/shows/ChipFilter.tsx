import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Chip, Sheet, cx } from '../../../components/ui';
import { formatList } from '../../../i18n';
import s from './ChipFilter.module.css';

/**
 * A filter of names a show must all have (genres, tags): a button that names
 * those picked ("Action and Comedy"), and a sheet to pick them. The sheet
 * offers only names that still leave something to show: each with how many
 * of the shows listed now have it, which is what picking it would list.
 * Picked names stay offered, so they can always be taken off.
 */
export function ChipFilter({
  label,
  icon: Icon,
  hint,
  empty,
  picked,
  counts,
  listed,
  name,
  pickedLabel,
  onChange,
  shape,
  className,
}: {
  /** The control's name and the sheet's title ("Genres"). */
  label: string;
  icon: LucideIcon;
  /** Under the sheet's title: how picking works. */
  hint: string;
  /** In the sheet when nothing can be picked. */
  empty: string;
  /** Names picked, as stored. */
  picked: readonly string[];
  /** Each name among the shows listed now, with how many have it. */
  counts: ReadonlyMap<string, number>;
  /** How many shows are listed now. */
  listed: number;
  /** A name as the screen shows it: a genre translated, a tag as typed. */
  name: (option: string) => string;
  /** The screen-reader label for what is picked, given their names as a list ("Genres: Action and Comedy"). */
  pickedLabel: (names: string) => string;
  onChange: (picked: string[]) => void;
  shape: 'button' | 'chip';
  className?: string;
}): JSX.Element {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const collator = useMemo(() => new Intl.Collator(i18n.language, { sensitivity: 'base', numeric: true }), [i18n.language]);
  const options = useMemo(
    () =>
      [...new Set([...picked, ...counts.keys()])]
        .map((option) => ({ option, label: name(option) }))
        .sort((a, b) => collator.compare(a.label, b.label)),
    [picked, counts, name, collator],
  );
  const toggle = (option: string): void => onChange(picked.includes(option) ? picked.filter((item) => item !== option) : [...picked, option]);

  // Picked, the button shows only their names; a screen reader also hears what they are.
  const names = formatList(picked.map(name));
  const text =
    picked.length === 0 ? (
      <span className={s.text}>{label}</span>
    ) : (
      <>
        <span className={s.text} aria-hidden>
          {names}
        </span>
        <span className="visually-hidden">{pickedLabel(names)}</span>
      </>
    );

  return (
    <>
      {shape === 'chip' ? (
        <Chip icon={Icon} selected={picked.length > 0} onClick={() => setOpen(true)} className={cx(s.chip, className)}>
          {text}
        </Chip>
      ) : (
        <button type="button" className={cx(s.button, picked.length > 0 && s.buttonOn, className)} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon size={18} strokeWidth={2} aria-hidden />
          {text}
          <ChevronDown size={18} strokeWidth={2} aria-hidden className={s.chevron} />
        </button>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <div className={s.footer}>
            <Button variant="ghost" disabled={picked.length === 0} onClick={() => onChange([])}>
              {t('shows.filter.clear')}
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              {t('shows.filter.done', { count: listed })}
            </Button>
          </div>
        }
      >
        <p className={s.hint}>{hint}</p>
        {options.length === 0 ? (
          <p className={s.hint}>{empty}</p>
        ) : (
          <div className={s.options} role="group" aria-label={label}>
            {options.map(({ option, label: optionName }) => (
              <Chip key={option} selected={picked.includes(option)} onClick={() => toggle(option)}>
                <span>
                  <Trans i18nKey="shows.filter.option" values={{ count: counts.get(option) ?? 0 }} components={{ name: <bdi className={s.name}>{optionName}</bdi> }} />
                </span>
              </Chip>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
