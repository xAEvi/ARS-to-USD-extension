/** Confidence level assigned to a detected amount. */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * Context describing the current page, built once per execution and passed to
 * every detector call.
 */
export type PageContext = {
  /** Hostname of the current document. */
  hostname: string;

  /** Whether the hostname belongs to an Argentine top level domain. */
  isArgentineDomain: boolean;

  /** Value of the document language attribute, if present. */
  documentLanguage?: string;

  /** Whether the document declares an Argentine locale. */
  isArgentineLocale: boolean;

  /** Prices explicitly declared as ARS in the page structured data. */
  declaredArsPrices: Set<number>;

  /** Whether the page structured data declares any non ARS currency. */
  hasForeignCurrencyMarkup: boolean;
};

/** A monetary amount found in a text node, along with its parsed value and confidence. */
export type DetectedAmount = {
  /** The exact substring matched in the source text, including currency markers. */
  rawText: string;

  /** Index in the source text where the match starts. */
  startIndex: number;

  /** Index in the source text where the match ends, exclusive. */
  endIndex: number;

  /** The parsed numeric value, in Argentine pesos. */
  valueArs: number;

  /** Confidence that the amount is genuinely expressed in Argentine pesos. */
  confidence: Confidence;
};

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
