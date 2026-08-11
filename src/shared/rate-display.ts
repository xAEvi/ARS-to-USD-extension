import type { RateHouse, RateProvider } from '../core/types';

/** Human readable label for each rate provider, shared by the popup and the floating panel. */
export const RATE_PROVIDER_LABELS: Record<RateProvider, string> = {
  dolarapi: 'dolarapi.com',
  bluelytics: 'bluelytics',
  manual: 'manual',
};

/** Human readable label for each dolarapi.com house, and for the manual rate. */
export const RATE_SOURCE_LABELS: Record<RateHouse | 'manual', string> = {
  oficial: 'Dólar oficial',
  blue: 'Dólar blue',
  bolsa: 'Dólar bolsa (MEP)',
  contadoconliqui: 'Dólar contado con liqui (CCL)',
  tarjeta: 'Dólar tarjeta',
  mayorista: 'Dólar mayorista',
  cripto: 'Dólar cripto',
  manual: 'Cotización manual',
};

/**
 * Formats how long ago a rate was fetched, in the same coarse wording the
 * popup and the panel both need.
 *
 * @param {number} fetchedAt When the rate was obtained, in epoch milliseconds.
 * @returns {string} A short Spanish phrase, e.g. `hace 3 minutos`.
 */
export function formatRateAge(fetchedAt: number): string {
  const minutes = Math.round((Date.now() - fetchedAt) / 60_000);
  if (minutes < 1) return 'hace instantes';
  if (minutes === 1) return 'hace 1 minuto';
  return `hace ${minutes} minutos`;
}
