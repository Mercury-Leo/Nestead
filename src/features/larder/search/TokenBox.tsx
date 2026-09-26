import { useRef, useState } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../../components/ui';
import s from './Search.module.css';

/**
 * The ingredient box: typed ingredients become removable tokens. Enter or a
 * comma makes a token; Backspace in an empty box takes the last one back.
 */
export function TokenBox({
  tokens,
  onChange,
  placeholder,
  label,
}: {
  tokens: string[];
  onChange: (tokens: string[]) => void;
  placeholder?: string;
  label?: string;
}): JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const commit = (text: string): void => {
    const added = text
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part !== '' && !tokens.includes(part));
    if (added.length > 0) onChange([...tokens, ...added]);
    setDraft('');
  };

  return (
    <div className={s.box} onClick={() => input.current?.focus()}>
      <SearchIcon size={22} strokeWidth={2} aria-hidden className={s.boxIcon} />
      <ul className={s.tokens} aria-label={t('search.tokens.list')}>
        {tokens.map((token) => (
          <li key={token} className={s.token}>
            <span dir="auto">{token}</span>
            <button
              type="button"
              className={s.tokenX}
              aria-label={t('search.tokens.remove', { token })}
              onClick={(event) => {
                event.stopPropagation();
                onChange(tokens.filter((t) => t !== token));
              }}
            >
              <X size={16} strokeWidth={2.2} aria-hidden />
            </button>
          </li>
        ))}
        <li className={s.tokenInputItem}>
          <input
            ref={input}
            className={s.tokenInput}
            aria-label={label ?? t('search.tokens.label')}
            dir="auto"
            value={draft}
            placeholder={placeholder ?? t('search.tokens.placeholder')}
            enterKeyHint="search"
            onChange={(event) => {
              const value = event.target.value;
              if (value.includes(',')) commit(value);
              else setDraft(value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit(draft);
              } else if (event.key === 'Backspace' && draft === '' && tokens.length > 0) {
                onChange(tokens.slice(0, -1));
              }
            }}
            onBlur={() => commit(draft)}
          />
        </li>
      </ul>
    </div>
  );
}

/** The same box in "By recipe name" mode: one plain text field. */
export function NameBox({ value, onChange }: { value: string; onChange: (value: string) => void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={cx(s.box)}>
      <SearchIcon size={22} strokeWidth={2} aria-hidden className={s.boxIcon} />
      <input
        className={s.tokenInput}
        type="search"
        aria-label={t('search.tokens.name')}
        dir="auto"
        value={value}
        placeholder={t('search.tokens.namePlaceholder')}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
