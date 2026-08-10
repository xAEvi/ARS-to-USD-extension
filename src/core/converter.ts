import type { ExchangeRate } from './types';

/**
 * Converts an amount in Argentine pesos to US dollars using a resolved
 * exchange rate.
 *
 * @param {number} valueArs The amount in Argentine pesos.
 * @param {ExchangeRate} rate The exchange rate to convert with.
 * @returns {number} The equivalent amount in US dollars.
 */
export function convertToUsd(valueArs: number, rate: ExchangeRate): number {
  return valueArs / rate.value;
}
