import { describe, expect, it } from 'vitest';
import { readSelection } from '../src/core/selection';

describe('readSelection', () => {
  it.each([
    // Bare numbers, in every format the parser resolves.
    ['15.000', 15000],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['500', 500],

    // Prefix markers.
    ['$15.000', 15000],
    ['$ 1.500', 1500],
    ['AR$1.234,56', 1234.56],
    ['ARS 1.234,56', 1234.56],

    // Suffix markers.
    ['1.500 pesos', 1500],
    ['1500 pesos argentinos', 1500],

    // Dollar markers are tolerated like any other: the extension does not
    // infer currency, it converts what the user selected.
    ['US$ 100', 100],
    ['U$S 100', 100],

    // Surrounding whitespace is not the user's fault.
    ['  $15.000  ', 15000],

    // Right at the digit ceiling.
    ['1.234.567.890,12', 1234567890.12],
  ] as const)('reads %s as %d', (input, expected) => {
    expect(readSelection(input)?.valueArs).toBeCloseTo(expected);
  });

  it('echoes the selection back trimmed', () => {
    expect(readSelection('  $15.000 ')).toEqual({
      rawText: '$15.000',
      valueArs: 15000,
    });
  });

  it.each([
    // Nothing to read.
    ['', 'an empty selection'],
    ['   ', 'a whitespace-only selection'],
    ['sin precio', 'text without digits'],
    ['USD', 'a marker without a number'],

    // An amount inside a wider selection: the user was selecting text for
    // some other reason.
    ['el precio es $15.000', 'an amount inside a sentence'],
    ['Total: $1.500', 'an amount with a label'],
    ['$15.000 y $20.000', 'two amounts'],
    ['$15.000\n$20.000', 'a selection spanning lines'],
    ['Este producto cuesta $15.000 hoy', 'a selection over the length cap'],

    // Digit runs that are not prices.
    ['1.234.567.890.123', 'more digits than a price has'],

    // Nothing to convert.
    ['0', 'zero'],
    ['$0,00', 'a zero amount'],
  ] as const)('rejects %s (%s)', (input, _description) => {
    expect(readSelection(input)).toBeUndefined();
  });
});
