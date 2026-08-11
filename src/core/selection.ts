import { parseAmount } from './number-parser';
import { MONETARY_SELECTION_PATTERN, SCALE_FACTORS } from './patterns';

/**
 * Maximum length, in characters, of a selection still read as an amount.
 * Fits `US$ 1.234.567.890,12` with room to spare and does not fit a
 * sentence.
 */
const MAX_LENGTH = 24;

/**
 * Maximum number of digits the user actually typed. A longer run of digits
 * is some other kind of identifier: a card number, a phone, a tracking
 * code. This limits the raw number, before a scale word multiplies it; see
 * `MAX_VALUE` for the limit on the result of that multiplication.
 */
const MAX_DIGITS = 12;

/**
 * Maximum value a selection can resolve to, after applying a scale word.
 * Without this, a typo like `999999999999k` would pass `MAX_DIGITS` (12
 * digits) and still produce a value in the quadrillions. A trillion pesos
 * is already far beyond anything a real selection needs to convert.
 */
const MAX_VALUE = 1_000_000_000_000;

/** Characters `readSelection` treats as thousands-separating whitespace inside a number, never as decimal ones. */
const NUMBER_WHITESPACE_PATTERN = /[   ]/g;

/** An amount read from a user selection, ready to convert. */
export type SelectedAmount = {
  /** The selected text, trimmed, as the panel should echo it back. */
  rawText: string;

  /** The parsed numeric value, in Argentine pesos. */
  valueArs: number;
};

/**
 * Resolves the multiplier a matched scale token applies, defaulting to 1
 * when there was none. Normalizes the accent so `millón` and `millon` share
 * the same lookup.
 *
 * @param {string} [token] The matched `scale` group, if any.
 * @returns {number} The factor to multiply the parsed number by.
 */
function scaleFactor(token?: string): number {
  if (!token) return 1;
  const normalized = token.toLowerCase().replace(/[óÓ]/g, 'o');
  return SCALE_FACTORS[normalized] ?? 1;
}

/**
 * Reads a user selection as a monetary amount.
 *
 * This is the extension's only filter, and it exists to keep the panel from
 * appearing while the user selects text for reasons that have nothing to do
 * with converting a price. It deliberately says nothing about which currency
 * the amount is in: selecting is the confirmation, and what to select is the
 * user's call.
 *
 * A scale word or suffix (`100k`, `2 palos`, `1 millón`) multiplies the
 * parsed number, unlike a currency marker: those are noise the extension
 * discards, a scale word changes the value, so getting it wrong is far more
 * costly than a currency marker being ignored. See DISENO.md section 3 for
 * the full reasoning and the list of supported forms.
 *
 * @param {string} text The selected text.
 * @returns {SelectedAmount | undefined} The amount, or `undefined` when the selection is not one.
 */
export function readSelection(text: string): SelectedAmount | undefined {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_LENGTH) return undefined;

  const match = MONETARY_SELECTION_PATTERN.exec(trimmed);
  const number = match?.groups?.number;
  if (!number) return undefined;

  const digitCount = number.replace(/\D/g, '').length;
  if (digitCount > MAX_DIGITS) return undefined;

  // Any whitespace inside the matched number is a thousands separator
  // (NUMBER_SOURCE only allows it in groups of exactly 3 digits), never a
  // decimal one, so it is safe to strip before handing the number to the
  // dot/comma-aware parser.
  const normalizedNumber = number.replace(NUMBER_WHITESPACE_PATTERN, '');
  const { value: baseValue } = parseAmount(normalizedNumber);
  if (!Number.isFinite(baseValue) || baseValue <= 0) return undefined;

  const value = baseValue * scaleFactor(match.groups?.scale);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_VALUE)
    return undefined;

  return { rawText: trimmed, valueArs: value };
}
