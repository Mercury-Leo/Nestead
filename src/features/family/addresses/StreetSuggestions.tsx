import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../../components/ui';
import { suggestAddresses } from './addressSearch';
import type { AddressSuggestion, Suggestions } from './addressSearch';
import s from './Addresses.module.css';

/** Asking waits for a pause in typing, so a word typed quickly costs one request, not one per letter. */
export const DEBOUNCE_MS = 300;
/** Fewer letters than this match too much to be worth asking about. */
export const MIN_LETTERS = 3;

const NONE: Suggestions = { results: [] };

/**
 * Suggestions for `text` while `enabled`: after a pause in typing, the latest
 * answer only (an earlier request still on its way is cancelled).
 */
export function useAddressSuggestions(text: string, enabled: boolean): Suggestions {
  const [suggestions, setSuggestions] = useState<Suggestions>(NONE);
  const query = text.replace(/\s+/g, ' ').trim();
  const asking = enabled && query.length >= MIN_LETTERS;

  useEffect(() => {
    if (!asking) {
      setSuggestions(NONE);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      suggestAddresses(query, controller.signal).then(setSuggestions, () => {
        // Aborted: a newer request has taken over.
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, asking]);

  return asking ? suggestions : NONE;
}

export const optionId = (listId: string, index: number): string => `${listId}-${index}`;

/**
 * The open list under the street field. It sits in the form's flow rather than
 * floating over it, so the sheet never clips it. Options keep the focus in the
 * field (mouse down is cancelled), as a combobox's options should.
 */
export function StreetSuggestions({
  id,
  suggestions,
  active,
  onPick,
}: {
  id: string;
  suggestions: Suggestions;
  active: number;
  onPick: (suggestion: AddressSuggestion) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={s.suggestions}>
      <ul id={id} role="listbox" aria-label={t('addresses.form.suggestions')} className={s.suggestionList}>
        {suggestions.results.map((suggestion, index) => (
          <li
            key={`${suggestion.street}|${suggestion.city}`}
            id={optionId(id, index)}
            role="option"
            aria-selected={index === active}
            className={cx(s.suggestion, index === active && s.suggestionActive)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(suggestion)}
          >
            <bdi className={s.suggestionStreet}>{suggestion.street}</bdi>
            <bdi className={s.suggestionPlace}>
              {suggestion.country === undefined ? suggestion.city : t('addresses.form.cityCountry', { city: suggestion.city, country: suggestion.country })}
            </bdi>
          </li>
        ))}
      </ul>
      {suggestions.attribution !== undefined && (
        <p className={s.attribution}>
          {/* The credit reads in its own language's direction: "© OpenStreetMap contributors" keeps its © first in Hebrew. */}
          <bdi>{suggestions.attribution}</bdi>
        </p>
      )}
    </div>
  );
}
