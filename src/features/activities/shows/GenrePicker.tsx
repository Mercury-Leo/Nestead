import { useMemo, useState } from 'react';
import { ChevronDown, Tags } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Sheet, cx } from '../../../components/ui';
import { formatList } from '../../../i18n';
import { genreLabel } from './labels';
import s from './GenrePicker.module.css';

/**
 * The genre filter: a button that names the genres picked ("Action and
 * Comedy"), and a sheet to pick them. A show must have every genre picked, so
 * the sheet offers only genres that still leave something to show: each with
 * how many of the shows listed now have it, which is what picking it would
 * list. Picked genres stay offered, so they can always be taken off.
 */
export function GenrePicker({
  picked,
  counts,
  listed,
  onChange,
  shape,
  className,
}: {
  /** Genres picked, as stored (in English). */
  picked: readonly string[];
  /** Each genre among the shows listed now, with how many have it (genreCounts()). */
  counts: ReadonlyMap<string, number>;
  /** How many shows are listed now. */
  listed: number;
  onChange: (genres: string[]) => void;
  shape: 'button' | 'chip';
  className?: string;
}): JSX.Element {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const collator = useMemo(() => new Intl.Collator(i18n.language, { sensitivity: 'base' }), [i18n.language]);
  const options = useMemo(
    () =>
      [...new Set([...picked, ...counts.keys()])]
        .map((genre) => ({ genre, label: genreLabel(t, genre) }))
        .sort((a, b) => collator.compare(a.label, b.label)),
    [picked, counts, t, collator],
  );
  const toggle = (genre: string): void => onChange(picked.includes(genre) ? picked.filter((item) => item !== genre) : [...picked, genre]);

  // Picked, the button shows only their names; a screen reader also hears what they are.
  const names = formatList(picked.map((genre) => genreLabel(t, genre)));
  const text =
    picked.length === 0 ? (
      <span className={s.text}>{t('shows.genres.label')}</span>
    ) : (
      <>
        <span className={s.text} aria-hidden>
          {names}
        </span>
        <span className="visually-hidden">{t('shows.genres.picked', { genres: names })}</span>
      </>
    );

  return (
    <>
      {shape === 'chip' ? (
        <Chip icon={Tags} selected={picked.length > 0} onClick={() => setOpen(true)} className={cx(s.chip, className)}>
          {text}
        </Chip>
      ) : (
        <button type="button" className={cx(s.button, picked.length > 0 && s.buttonOn, className)} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Tags size={18} strokeWidth={2} aria-hidden />
          {text}
          <ChevronDown size={18} strokeWidth={2} aria-hidden className={s.chevron} />
        </button>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('shows.genres.label')}
        footer={
          <div className={s.footer}>
            <Button variant="ghost" disabled={picked.length === 0} onClick={() => onChange([])}>
              {t('shows.genres.clear')}
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              {t('shows.genres.done', { count: listed })}
            </Button>
          </div>
        }
      >
        <p className={s.hint}>{t('shows.genres.hint')}</p>
        {options.length === 0 ? (
          <p className={s.hint}>{t('shows.genres.none')}</p>
        ) : (
          <div className={s.options} role="group" aria-label={t('shows.genres.label')}>
            {options.map(({ genre, label: name }) => (
              <Chip key={genre} selected={picked.includes(genre)} onClick={() => toggle(genre)}>
                {t('shows.genres.option', { genre: name, count: counts.get(genre) ?? 0 })}
              </Chip>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
