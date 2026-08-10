import type { ArsToUsdConfiguration } from './schema';

/** Primary exchange rate endpoint. Public, no API key, CORS open. */
export const DOLARAPI_URL =
  import.meta.env.VITE_DOLARAPI_URL ??
  'https://dolarapi.com/v1/dolares/oficial';

/** Fallback exchange rate endpoint, used when the primary source fails. */
export const BLUELYTICS_URL =
  import.meta.env.VITE_BLUELYTICS_URL ??
  'https://api.bluelytics.com.ar/v2/latest';

export const DEFAULT_CONFIGURATION: ArsToUsdConfiguration = {
  rateSource: 'official',
  manualRate: 1000,
  rateSide: 'venta',
  rateTtlMs: 10 * 60 * 1000,
};
