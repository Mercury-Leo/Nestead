import { useEffect, useState } from 'react';

interface DueDateInputProps {
  /** YYYY-MM-DD, or undefined for no date. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/**
 * A date field that reports only whole dates. Typing a year digit by digit
 * passes through 0002, 0020 and 0202 on the way to 2026, and none of those
 * should be saved, let alone sync to everyone's board.
 */
export function DueDateInput({ value, onChange }: DueDateInputProps): JSX.Element {
  const [text, setText] = useState(value ?? '');

  // Someone else changed it, or the form was reset.
  useEffect(() => setText(value ?? ''), [value]);

  return (
    <input
      type="date"
      className="due-date-input"
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (next === '') onChange(undefined);
        else if (/^[1-9]\d{3}-\d{2}-\d{2}$/.test(next)) onChange(next);
      }}
    />
  );
}
