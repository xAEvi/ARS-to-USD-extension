import { parseAmount } from './number-parser';
import { MONETARY_SELECTION_PATTERN } from './patterns';

/**
 * Maximum length, in characters, of a selection still read as an amount.
 * Fits `US$ 1.234.567.890,12` with room to spare and does not fit a
 * sentence.
 */
const MAX_LENGTH = 24;

/**
 * Maximum number of digits in the amount. A longer run of digits is some
 * other kind of identifier: a card number, a phone, a tracking code.
 */
const MAX_DIGITS = 12;

/** An amount read from a user selection, ready to convert. */
export type SelectedAmount = {
  /** The selected text, trimmed, as the panel should echo it back. */
  rawText: string;

  /** The parsed numeric value, in Argentine pesos. */
  valueArs: number;
};

/**
 * Reads a user selection as a monetary amount.
 *
 * This is the extension's only filter, and it exists to keep the panel from
 * appearing while the user selects text for reasons that have nothing to do
 * with converting a price. It deliberately says nothing about which currency
 * the amount is in: selecting is the confirmation, and what to select is the
 * user's call.
 *
 * @param {string} text The selected text.
 * @returns {SelectedAmount | undefined} The amount, or `undefined` when the selection is not one.
 */
export function readSelection(text: string): SelectedAmount | undefined {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_LENGTH) return undefined;

  const number = MONETARY_SELECTION_PATTERN.exec(trimmed)?.groups?.number;
  if (!number) return undefined;

  const digitCount = number.replace(/\D/g, '').length;
  if (digitCount > MAX_DIGITS) return undefined;

  const { value } = parseAmount(number);
  if (!Number.isFinite(value) || value <= 0) return undefined;

  return { rawText: trimmed, valueArs: value };
}
