import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TASK_ICONS, TASK_ICON_GROUPS } from './icons';
import { readRecentIcons, rememberIcon } from './recentIcons';

/**
 * A task's icon: this device's recent picks, the everyday sixteen, and the
 * rest by kind of chore behind "More icons". A pick is remembered as recent.
 *
 * The recent row is read once, when the picker opens: updated on every pick it
 * would reorder under the finger, and the next tap would land on another icon.
 */
export function IconPicker({ value, onPick }: { value: string | undefined; onPick: (icon: string) => void }): JSX.Element {
  const { t } = useTranslation();
  const [recent] = useState(readRecentIcons);
  const [expanded, setExpanded] = useState(false);
  const id = useId();

  const grid = (icons: readonly string[]): JSX.Element => (
    <div className="icon-grid">
      {icons.map((icon) => (
        <button
          type="button"
          key={icon}
          className={icon === value ? 'icon-on' : ''}
          aria-pressed={icon === value}
          onClick={() => {
            rememberIcon(icon);
            onPick(icon);
          }}
        >
          {icon}
        </button>
      ))}
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
    <div className="icon-picker" role="group" aria-label={t('board.card.icon')}>
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
