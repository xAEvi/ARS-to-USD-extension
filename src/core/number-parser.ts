/**
 * The number format a matched digit sequence appears to follow.
 *
 * `es-AR` covers both explicit es-AR formatting (dot thousands, comma
 * decimal) and the digit-only case, which reads the same in both locales.
 * `en-US` is only produced when the format is unambiguous, since that is the
 * signal the detector uses to lower confidence.
 */
export type NumberFormat = 'es-AR' | 'en-US' | 'plain';

export type ParsedNumber = {
  /** The parsed numeric value. */
  value: number;

  /** The number format the input matched. */
  format: NumberFormat;
};

const ES_AR_THOUSANDS = /^\d{1,3}(\.\d{3})+$/;
const EN_US_THOUSANDS = /^\d{1,3}(,\d{3})+$/;
const SINGLE_DOT_DECIMAL = /^\d+\.\d{1,2}$/;
const SINGLE_COMMA_DECIMAL = /^\d+,\d{1,2}$/;

/**
 * Parses a digit sequence that mixes a decimal and a thousands separator,
 * given which character plays which role.
 */
function parseWithSeparators(
  text: string,
  decimalChar: string,
  thousandsChar: string,
  format: NumberFormat,
): ParsedNumber {
  const withoutThousands = text.split(thousandsChar).join('');
  const normalized = withoutThousands.replace(decimalChar, '.');
  return { value: Number(normalized), format };
}

/**
 * Parses a digit sequence formatted per DISENO.md section 3.3, resolving the
 * es-AR/en-US ambiguity of `.` and `,` separators.
 *
 * @param {string} text A digit sequence, optionally using `.` and `,` as group separators.
 * @returns {ParsedNumber} The parsed value and the format it was read as.
 */
export function parseAmount(text: string): ParsedNumber {
  const trimmed = text.trim();
  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');

  if (!hasComma && !hasDot) return { value: Number(trimmed), format: 'plain' };

  if (hasComma && hasDot) {
    // Whichever separator comes last is the decimal separator: dot then
    // comma is es-AR (`1.234,56`), comma then dot is unambiguous en-US
    // (`1,234.56`).
    return trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.')
      ? parseWithSeparators(trimmed, ',', '.', 'es-AR')
      : parseWithSeparators(trimmed, '.', ',', 'en-US');
  }

  if (hasDot) {
    // Repeated groups of exactly 3 digits are thousands separators
    // (`1.500`, `1.234.567`). A single dot followed by 1-2 digits is the
    // ambiguous decimal case, resolved as es-AR (`1.50` -> `1.5`).
    if (ES_AR_THOUSANDS.test(trimmed))
      return { value: Number(trimmed.split('.').join('')), format: 'es-AR' };

    if (SINGLE_DOT_DECIMAL.test(trimmed))
      return { value: Number(trimmed), format: 'es-AR' };

    // Anything else with only dots (e.g. a final group that isn't exactly 3
    // digits) is not a shape DISENO.md accounts for; treat every dot as a
    // thousands separator, the more common real world shape.
    return { value: Number(trimmed.split('.').join('')), format: 'es-AR' };
  }

  // Only commas. DISENO.md does not cover this case explicitly, so it is
  // resolved by mirroring the dot-only rules: a single comma with 1-2
  // trailing digits reads as the es-AR decimal separator, anything else
  // (repeated groups of 3) reads as en-US thousands.
  if (SINGLE_COMMA_DECIMAL.test(trimmed))
    return { value: Number(trimmed.replace(',', '.')), format: 'es-AR' };

  if (EN_US_THOUSANDS.test(trimmed))
    return { value: Number(trimmed.split(',').join('')), format: 'en-US' };

  return { value: Number(trimmed.split(',').join('')), format: 'en-US' };
}
