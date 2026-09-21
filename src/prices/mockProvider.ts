import type { PriceProvider, PriceQuote } from './types';

/**
 * Deterministic fake prices. No network, no API key: the same query always
 * returns the same numbers, so screens built against this behave predictably.
 */

const STORES = ['Corner Shop', 'Big Market', 'Value Store'] as const;

/** Small stable string hash, so prices depend only on the query. */
function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}

export const mockProvider: PriceProvider = {
  label: 'MOCK DATA',

  async lookup(query: string): Promise<PriceQuote[]> {
    const item = query.trim();
    if (item === '') return [];

    const seed = hash(item.toLowerCase());

    return STORES.map((store, index): PriceQuote => {
      const pence = 80 + ((seed >> (index * 3)) % 420);
      return {
        store,
        item,
        price: Math.round(pence) / 100,
        currency: 'GBP',
        unit: 'each',
      };
    });
  },
};
