const USD_NUMBER_FORMAT = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a US dollar amount per DISENO.md section 5.5: `es-AR` grouping and
 * decimal separators, `USD` prefix, and a floor message for anything under a
 * cent so a real amount is never rounded down to zero silently.
 *
 * @param {number} value The amount in US dollars.
 * @returns {string} The formatted amount, e.g. `USD 12,50` or `< USD 0,01`.
 */
export function formatUsd(value: number): string {
  if (value < 0.01) return '< USD 0,01';
  return `USD ${USD_NUMBER_FORMAT.format(value)}`;
}
