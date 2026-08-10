/** Side of the official quote used for the conversion. */
export type RateSide = 'venta' | 'compra' | 'promedio';

/** Origin of a resolved exchange rate. */
export type RateProvider = 'dolarapi' | 'bluelytics' | 'manual';

/** A resolved ARS per USD exchange rate, ready to convert amounts. */
export type ExchangeRate = {
  /** ARS per USD, already resolved to the configured side. */
  value: number;

  /** Which side of the quote this value represents. */
  side: RateSide | 'manual';

  /** Where this value came from. */
  provider: RateProvider;

  /** When this value was obtained or read from cache, in epoch milliseconds. */
  fetchedAt: number;

  /** The update timestamp reported by the API. Absent for manual rates. */
  quotedAt?: string;

  /** True when the API failed and this is an expired cached value used as a last resort. */
  isStale: boolean;
};
