/** The shapes recipe import sends and accepts. The app reads ImportedRecipe too. */

export interface ImportedRecipe {
  url: string;
  site: string;
  title: string;
  description?: string;
  image?: string;
  servings?: number;
  servingUnit?: string;
  prepMin?: number;
  cookMin?: number;
  ingredients: string[];
  steps: string[];
  equipment: string[];
  kcal?: number;
  rating?: number;
}

export interface ImportReport {
  found: string[];
  missing: string[];
}

export type ImportError = 'invalid-url' | 'blocked' | 'fetch-failed' | 'too-large' | 'not-found' | 'timeout';

export interface ImportOptions {
  fetch?: typeof fetch;
  /** Resolves a host name to addresses, where the platform allows it (Node). */
  resolveHost?: (host: string) => Promise<string[]>;
  timeoutMs?: number;
  maxBytes?: number;
}
