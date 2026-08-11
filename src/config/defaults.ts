import type { ArsToUsdConfiguration } from './schema';

/** Base URL for dolarapi.com's per-house dollar endpoints. Public, no API key, CORS open. */
export const DOLARAPI_BASE_URL =
  import.meta.env.VITE_DOLARAPI_BASE_URL ?? 'https://dolarapi.com/v1/dolares';

/**
 * Fallback endpoint, used when the primary source fails. Only covers
 * `oficial` and `blue`: it is the only house it has no dolarapi.com
 * equivalent for.
 */
export const BLUELYTICS_URL =
  import.meta.env.VITE_BLUELYTICS_URL ??
  'https://api.bluelytics.com.ar/v2/latest';

export const DEFAULT_CONFIGURATION: ArsToUsdConfiguration = {
  rateSource: 'oficial',
  manualRate: 1000,
  rateSide: 'venta',
  rateTtlMs: 10 * 60 * 1000,
};
