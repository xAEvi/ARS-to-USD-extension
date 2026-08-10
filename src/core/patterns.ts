/**
 * Currency markers tolerated around a selected number.
 *
 * They are noise, not evidence. The extension no longer infers the currency
 * of an amount: it converts whatever the user selected, so a marker only
 * needs to be recognized well enough not to reject a selection that carries
 * one. Ordering still matters within the alternation, since `$ARS` and `AR$`
 * have to be tried before the bare `$`.
 */
const MARKER_SOURCE = String.raw`U\$\s?D|U\$\s?S|US\s?\$|USD|\$ARS|AR\$|ARS|\$|pesos(?:\s+argentinos)?|d[oó]lares`;

/** A sequence of digits with `.` and/or `,` as group separators, interpreted later by the number parser. */
const NUMBER_SOURCE = String.raw`\d+(?:[.,]\d+)*`;

/**
 * Matches a selection that is a monetary value and nothing else: a number
 * with an optional currency marker before or after it.
 *
 * Anchored on purpose. An unanchored match would accept a number buried in a
 * sentence, and a selection that wide means the user was selecting text for
 * some other reason.
 */
export const MONETARY_SELECTION_PATTERN = new RegExp(
  String.raw`^(?:(?:${MARKER_SOURCE})\s?)?(?<number>${NUMBER_SOURCE})(?:\s?(?:${MARKER_SOURCE}))?$`,
  'i',
);
