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
