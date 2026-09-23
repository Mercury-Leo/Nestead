import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { cx } from '../../../components/ui';
import { CATALOG } from '../../../domain/kitchen/catalog';
import type { CatalogItem } from '../../../domain/kitchen/catalog';
import { keyForText } from '../../../domain/kitchen/fit';
import s from './Pantry.module.css';

/**
 * The pantry typeahead. Suggestions come from the catalog, skip what is
 * already in the pantry, and say which recipe needs them. Enter adds the first
 * match; commas add several at once; unknown words become custom items.
 */

export interface Suggestion {
  item: CatalogItem;
  /** Where the typed text starts inside the name, for the bold part. */
  at: number;
}

export function suggest(query: string, exclude: ReadonlySet<string>, limit = 5): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const starts: Suggestion[] = [];
  const words: Suggestion[] = [];
  const aliases: Suggestion[] = [];
  for (const item of CATALOG) {
    if (exclude.has(item.id)) continue;
    const name = item.name.toLowerCase();
    if (name.startsWith(q)) starts.push({ item, at: 0 });
    else if (name.includes(` ${q}`) || name.includes(`-${q}`)) words.push({ item, at: name.search(new RegExp(`[ -]${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)) + 1 });
    else if (item.aliases.some((alias) => alias.toLowerCase().startsWith(q))) aliases.push({ item, at: -1 });
  }
  return [...starts, ...words, ...aliases].slice(0, limit);
}

function Highlight({ text, at, length }: { text: string; at: number; length: number }): JSX.Element {
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong>{text.slice(at, at + length)}</strong>
      {text.slice(at + length)}
    </>
  );
}

export function PantryAdd({
  onAdd,
  existingKeys,
  neededFor,
  placeholder = 'Add items — e.g. eggs, feta, basil',
  autoFocus = false,
  inline = false,
}: {
  onAdd: (names: string[]) => void;
  /** Keys (catalog ids) already in the pantry, so they are not suggested. */
  existingKeys: ReadonlySet<string>;
  /** catalog key -> recipe title, for "Needed for …". */
  neededFor: ReadonlyMap<string, string>;
  placeholder?: string;
  autoFocus?: boolean;
  /** Phone layout: suggestions sit in the page instead of floating. */
  inline?: boolean;
}): JSX.Element {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  // Only the part after the last comma is being typed; the rest is settled.
  const current = text.split(',').pop() ?? '';
  const options = useMemo(() => suggest(current, existingKeys), [current, existingKeys]);

  const add = (names: string[]): void => {
    const clean = names.map((name) => name.trim()).filter((name) => name !== '');
    if (clean.length > 0) onAdd(clean);
    setText('');
    setActive(0);
  };

  const commitAll = (): void => {
    const parts = text.split(',');
    const last = parts.pop() ?? '';
    const chosen = options[active];
    // The last part becomes the highlighted suggestion when there is one.
    add([...parts, chosen !== undefined && last.trim() !== '' ? chosen.item.name : last]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitAll();
    } else if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      setActive((active + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault();
      setActive((active - 1 + options.length) % options.length);
    } else if (event.key === 'Escape') {
      setText('');
    }
  };

  const open = options.length > 0 && current.trim() !== '';

  return (
    <div className={cx(s.typeahead, inline && s.typeaheadInline)}>
      <div className={cx(s.addField, open && s.addFieldOpen)}>
        <Plus size={20} strokeWidth={2} aria-hidden className={s.addIcon} />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-label="Add to pantry"
          value={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <div className={s.dropdown}>
          <ul id={listId} role="listbox" aria-label="Suggestions" className={s.options}>
            {options.map((option, index) => {
              const needed = neededFor.get(option.item.id);
              return (
                <li
                  key={option.item.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={cx(s.option, index === active && s.optionActive)}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const parts = text.split(',');
                    parts.pop();
                    add([...parts, option.item.name]);
                  }}
                >
                  <span className={s.optionText}>
                    <span className={s.optionName}>
                      <Highlight text={option.item.name} at={option.at} length={current.trim().length} />
                    </span>
                    {needed !== undefined && <span className={s.optionNeeded}>Needed for {needed}</span>}
                  </span>
                  <span className={s.optionSection}>{option.item.section}</span>
                  <span className={s.optionPlus} aria-hidden>
                    <Plus size={16} strokeWidth={2.2} />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className={s.dropdownHint}>Enter adds the first match · separate with commas to add several</p>
        </div>
      )}
    </div>
  );
}

export function pantryKeys(items: readonly { name: string; canonicalId?: string }[]): Set<string> {
  return new Set(items.map((item) => keyForText(item.name, item.canonicalId)));
}
