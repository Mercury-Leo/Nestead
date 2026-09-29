/** Median with the run-to-run spread, the shape every number in PERFORMANCE.md takes. */
export interface Spread {
  median: number;
  min: number;
  max: number;
  runs: number;
}

export function spread(values: readonly number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return { median, min: sorted[0]!, max: sorted[sorted.length - 1]!, runs: sorted.length };
}

/** Medians of every numeric field across runs. */
export function summarise<T extends Record<string, number>>(samples: readonly T[]): Record<keyof T, Spread> {
  const keys = Object.keys(samples[0] ?? {}) as (keyof T)[];
  return Object.fromEntries(keys.map((key) => [key, spread(samples.map((sample) => sample[key]))])) as Record<keyof T, Spread>;
}

export function show(spreadValue: Spread, unit = 'ms', digits = 0): string {
  const f = (n: number): string => n.toFixed(digits);
  return `${f(spreadValue.median)} ${unit} (${f(spreadValue.min)}–${f(spreadValue.max)})`;
}
