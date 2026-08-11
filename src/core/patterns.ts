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

/**
 * A sequence of digits with `.` and/or `,` as group separators, interpreted
 * later by the number parser, or a space-grouped SI form (`100 000`). The
 * space class covers a regular space, a non-breaking space (U+00A0) and a
 * thin space (U+2009), the ones text editors and `Intl`-formatted pages
 * tend to insert. The space form requires groups of exactly 3 digits, same
 * as the dot-grouped `es-AR` shape, so it never swallows the space that
 * separates a number from a following scale word (`100 mil`): `mil` is not
 * 3 digits.
 */
const NUMBER_SOURCE = String.raw`\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*`;

/**
 * Scale words and suffixes that multiply the parsed number, and the factor
 * each one applies. Attached suffixes (`k`, `M`, `m`, `MM`) glue directly to
 * the number; the rest are separate words. `m` and `M` both mean million,
 * not "mil": see DISENO.md section 3 for why that reading was chosen over
 * treating `m` as ambiguous.
 *
 * Keys are unaccented; `readSelection` normalizes the matched text (`ó` to
 * `o`) before looking a value up, so both `millon` and `millón` resolve to
 * the same entry.
 */
export const SCALE_FACTORS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  mm: 1_000_000,
  mil: 1_000,
  millon: 1_000_000,
  millones: 1_000_000,
  luca: 1_000,
  lucas: 1_000,
  palo: 1_000_000,
  palos: 1_000_000,
  mango: 1,
  mangos: 1,
  gamba: 100,
  gambas: 100,
  melon: 1_000_000,
  melones: 1_000_000,
};

// Longest alternatives first so a prefix like `mil` cannot short-circuit a
// longer word like `millones` before backtracking gets the chance to try
// it; anchoring would recover the correct match either way, but trying the
// longer form first avoids relying on that.
const SCALE_SOURCE = String.raw`millones|mill[oó]n|mangos|mango|gambas|gamba|melones|mel[oó]n|palos|palo|lucas|luca|mil|mm|k|m`;

/**
 * Matches a selection that is a monetary value and nothing else: a number,
 * with an optional scale word or suffix, and an optional currency marker
 * before or after it. A trailing `.-`/`,-`, common in Argentine price
 * notation, is tolerated and discarded like a currency marker.
 *
 * Anchored on purpose. An unanchored match would accept a number buried in a
 * sentence, and a selection that wide means the user was selecting text for
 * some other reason. Anchoring is also what keeps a scale suffix from
 * attaching to a unit it does not belong to (`22.5kg`, `50km`): if the
 * letters after the number are not one of `SCALE_SOURCE`'s alternatives,
 * nothing in the pattern can consume them and the whole match fails.
 */
export const MONETARY_SELECTION_PATTERN = new RegExp(
  String.raw`^(?:(?:${MARKER_SOURCE})\s?)?(?<number>${NUMBER_SOURCE})(?:\s?(?<scale>${SCALE_SOURCE}))?(?:\s?(?:${MARKER_SOURCE}))?(?:[.,]-)?$`,
  'i',
);
