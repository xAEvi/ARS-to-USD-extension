import { describe, expect, it } from 'vitest';
import { parseAmount } from '../src/core/number-parser';

describe('parseAmount', () => {
  it.each([
    // es-AR: comma decimal, dots as thousands.
    ['1.234,56', 1234.56, 'es-AR'],
    ['1.234.567,89', 1234567.89, 'es-AR'],
    ['0,50', 0.5, 'es-AR'],

    // es-AR: dots only, resolved by trailing group digit count.
    ['1.500', 1500, 'es-AR'],
    ['1.234.567', 1234567, 'es-AR'],
    ['1.50', 1.5, 'es-AR'],
    ['1.5', 1.5, 'es-AR'],

    // No separators.
    ['1500', 1500, 'plain'],

    // Unambiguous en-US: comma thousands, dot decimal.
    ['1,234.56', 1234.56, 'en-US'],
    ['1,234,567.89', 1234567.89, 'en-US'],
  ] as const)('parses %s as %d (%s)', (input, expected, format) => {
    const result = parseAmount(input);
    expect(result.value).toBeCloseTo(expected);
    expect(result.format).toBe(format);
  });

  it('reads a lone comma with 1-2 trailing digits as an es-AR decimal', () => {
    expect(parseAmount('1500,5')).toEqual({ value: 1500.5, format: 'es-AR' });
  });

  it('reads repeated comma groups of 3 digits as en-US thousands', () => {
    expect(parseAmount('1,500,000')).toEqual({
      value: 1500000,
      format: 'en-US',
    });
  });
});
