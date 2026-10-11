import { useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover } from '../../components/ui';
import { TASK_ICONS, TASK_ICON_GROUPS } from './icons';
import { readRecentIcons, rememberIcon } from './recentIcons';

/**
 * A task's icon, in a card and in the composer: a row with the icon on a
 * button that opens the choices in a floating panel (`Popover`), so the card
 * stays its own size. A pick is saved, remembered as recent, closes the panel
 * and puts focus back on the button.
 */
export function IconPicker({ value, onPick }: { value: string | undefined; onPick: (icon: string) => void }): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  return (
    <div className="icon-field">
      <span id={`${id}-label`}>{t('board.card.icon')}</span>
      <button
        ref={trigger}
        type="button"
        className="icon-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen(!open)}
      >
        <span id={`${id}-value`}>{value ?? ''}</span>
        <ChevronDown size={14} strokeWidth={2.2} aria-hidden className={open ? 'is-open' : ''} />
      </button>
      {open && (
        <Popover
          anchor={trigger}
          label={t('board.card.icon')}
          align="end"
          onClose={() => setOpen(false)}
          className="icon-popover"
        >
          <IconChoices
            value={value}
            onPick={(icon) => {
              rememberIcon(icon);
              onPick(icon);
              setOpen(false);
              trigger.current?.focus();
            }}
          />
        </Popover>
      )}
    </div>
  );
}

/**
 * This device's recent picks, the everyday sixteen, and the rest by kind of
 * chore behind "More icons", already open when the task's icon is one of
 * those, so the current choice is in view. Recent is read as the panel opens.
 */
function IconChoices({ value, onPick }: { value: string | undefined; onPick: (icon: string) => void }): JSX.Element {
  const { t } = useTranslation();
  const [recent] = useState(readRecentIcons);
  const [expanded, setExpanded] = useState(
    () => value !== undefined && !recent.includes(value) && !(TASK_ICONS as readonly string[]).includes(value),
  );
  const id = useId();
  // The current icon takes focus as the panel opens: its first button, since
  // it can be both recent and everyday.
  let focusTaken = false;

  const grid = (icons: readonly string[]): JSX.Element => (
    <div className="icon-grid">
      {icons.map((icon) => {
        const current = icon === value;
        const autofocus = current && !focusTaken;
        if (autofocus) focusTaken = true;
        return (
          <button
            type="button"
            key={icon}
            className={current ? 'icon-on' : ''}
            aria-pressed={current}
            data-autofocus={autofocus ? true : undefined}
            onClick={() => onPick(icon)}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );

  const section = (key: string, label: string, icons: readonly string[]): JSX.Element => (
    <div key={key} className="icon-section" role="group" aria-labelledby={`${id}-${key}`}>
      <span id={`${id}-${key}`} className="icon-heading">
        {label}
      </span>
      {grid(icons)}
    </div>
  );

  return (
    <div className="icon-picker">
      {recent.length > 0 && section('recent', t('board.icons.recent'), recent)}
      {grid(TASK_ICONS)}
      <button type="button" className="icon-more-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <ChevronDown size={14} strokeWidth={2.2} aria-hidden className={expanded ? 'is-open' : ''} />
        {t(expanded ? 'board.icons.fewer' : 'board.icons.more')}
      </button>
      {expanded && (
        <div className="icon-more">
          {TASK_ICON_GROUPS.map((group) => section(group.key, t(`board.icons.groups.${group.key}`), group.icons))}
        </div>
      )}
    </div>
  );
}
