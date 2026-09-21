import { mockProvider } from './mockProvider';
import type { PriceProvider } from './types';

/**
 * The price provider in use. Swapping in a real one later is a single change
 * here, exactly like the data backend in src/data/index.ts.
 */
export const prices: PriceProvider = mockProvider;
