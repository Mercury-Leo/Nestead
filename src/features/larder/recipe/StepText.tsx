import type { ReactNode } from 'react';
import { detectDurations } from '../../../domain/kitchen/durations';
import type { DetectedDuration } from '../../../domain/kitchen/durations';

/**
 * Step text with its detected times swapped for chips. The recipe page shows
 * them as quiet labels; cook mode passes a renderer that makes them timers.
 */
export function StepText({
  text,
  stepNumber,
  renderChip,
}: {
  text: string;
  stepNumber: number;
  renderChip: (duration: DetectedDuration, index: number) => ReactNode;
}): JSX.Element {
  const durations = detectDurations(text, stepNumber);
  const parts: ReactNode[] = [];
  let at = 0;
  durations.forEach((duration, index) => {
    if (duration.start > at) parts.push(text.slice(at, duration.start));
    parts.push(<span key={`d${index}`}>{renderChip(duration, index)}</span>);
    at = duration.end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** Stable per step and position, so a chip keeps its timer across renders. */
export function chipKey(stepIndex: number, duration: DetectedDuration): string {
  return `${stepIndex}:${duration.start}`;
}
