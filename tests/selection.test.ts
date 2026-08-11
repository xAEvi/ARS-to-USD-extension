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

    // Attached scale suffixes.
    ['100k', 100_000],
    ['100K', 100_000],
    ['22,5k', 22_500],
    ['22.5k', 22_500],
    ['1M', 1_000_000],
    ['1MM', 1_000_000],

    // `m` and `M` both mean million, not "mil": DISENO.md section 3.
    ['20m', 20_000_000],
    ['1m', 1_000_000],

    // Argentine price notation.
    ['$1.500.-', 1500],
    ['$1.500,-', 1500],
    ['100 000', 100_000],

    // Scale words.
    ['100 mil', 100_000],
    ['2 millones', 2_000_000],
    ['1 millón', 1_000_000],

    // Slang.
    ['2 palos', 2_000_000],
    ['10 lucas', 10_000],
    ['500 mangos', 500],
    ['2 gambas', 200],
    ['2 melones', 2_000_000],
    ['2 melón', 2_000_000],

    // A decimal number still scales correctly.
    ['1,5 palos', 1_500_000],
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

    // A scale suffix glued to an unrelated unit: nothing may consume the
    // trailing letters, so the whole selection fails to match.
    ['22.5kg', 'a weight, not a scaled amount'],
    ['50 km', 'a distance'],
    ['100kb', 'a file size'],
    ['3kW', 'a power rating'],
    ['5m2', 'an area'],

    // Dollars, not pesos: converting them would produce a nonsense value.
    ['500 verdes', 'slang for dollars'],
    ['2 palos verdes', 'millions of dollars'],

    // Fractions of a scale word are out of scope.
    ['medio palo', 'a fraction of a scale word'],

    // Two amounts, same as without a scale word.
    ['entre 1k y 2k', 'two amounts'],

    // Passes the raw digit ceiling but the scaled value is absurd.
    ['999999999999k', 'a value past the sanity ceiling'],
  ] as const)('rejects %s (%s)', (input, _description) => {
    expect(readSelection(input)).toBeUndefined();
  });
});
