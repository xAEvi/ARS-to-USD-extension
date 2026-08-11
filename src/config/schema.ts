import type { RateHouse, RateSide } from '../core/types';

/**
 * User configurable behavior of the extension. Only the fields consumed so
 * far exist; the rest of DISENO.md section 8 is added incrementally as
 * later phases need it.
 */
export type ArsToUsdConfiguration = {
  /** Which dollar quote to use: a dolarapi.com house, or the manual rate. */
  rateSource: RateHouse | 'manual';

  /** Manual exchange rate in ARS per USD. Only used when rateSource is manual. */
  manualRate: number;

  /** Side of the official quote used for the conversion. */
  rateSide: RateSide;

  /** Cache lifetime for the official rate, in milliseconds. */
  rateTtlMs: number;
};
