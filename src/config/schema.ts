import type { Confidence, RateSide } from '../core/types';

/**
 * User configurable behavior of the extension. Only the fields consumed so
 * far exist; the rest of DISENO.md section 8 is added incrementally as
 * later phases need it.
 */
export type ArsToUsdConfiguration = {
  /** Source used to obtain the exchange rate. */
  rateSource: 'official' | 'manual';

  /** Manual exchange rate in ARS per USD. Only used when rateSource is manual. */
  manualRate: number;

  /** Side of the official quote used for the conversion. */
  rateSide: RateSide;

  /** Cache lifetime for the official rate, in milliseconds. */
  rateTtlMs: number;

  /** Minimum confidence level required to annotate a detected amount. */
  minConfidence: Confidence;

  /** Maximum number of suppression rules kept per hostname before LRU pruning. */
  maxRulesPerHost: number;
};
