export interface PriceQuote {
  store: string;
  /** The item this quote is for, as matched by the provider. */
  item: string;
  price: number;
  currency: string;
  /** e.g. "each", "per kg". */
  unit: string;
}

export interface PriceProvider {
  /** Shown next to any price so nobody mistakes mock data for real data. */
  label: string;
  lookup(query: string): Promise<PriceQuote[]>;
}
