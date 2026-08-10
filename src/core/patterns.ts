/** What a matched currency marker tells us about the amount's currency. */
export type MarkerKind = 'dollar' | 'ars-explicit' | 'ambiguous' | 'none';

// Prefix markers, in priority order: dollar markers reject immediately, ARS
// markers are explicit, and the bare `$` sign is ambiguous.
const DOLLAR_PREFIX_SOURCE = String.raw`U\$\s?D|U\$\s?S|US\s?\$|USD`;
const ARS_PREFIX_SOURCE = String.raw`\$ARS|AR\$|ARS`;
const AMBIGUOUS_MARKER_SOURCE = String.raw`\$`;

// Suffix markers: ARS words are explicit, dollar words reject.
const ARS_SUFFIX_SOURCE = String.raw`pesos(?:\s+argentinos)?|ARS`;
const DOLLAR_SUFFIX_SOURCE = String.raw`d[oó]lares|USD`;

const DOLLAR_MARKER_REGEX = new RegExp(
  `^(?:${DOLLAR_PREFIX_SOURCE}|${DOLLAR_SUFFIX_SOURCE})$`,
  'i',
);
const ARS_EXPLICIT_MARKER_REGEX = new RegExp(
  `^(?:${ARS_PREFIX_SOURCE}|${ARS_SUFFIX_SOURCE})$`,
  'i',
);
const AMBIGUOUS_MARKER_REGEX = new RegExp(`^${AMBIGUOUS_MARKER_SOURCE}$`);

/** A sequence of digits with `.` and/or `,` as group separators, interpreted later by the number parser. */
const NUMBER_SOURCE = String.raw`\d+(?:[.,]\d+)*`;

/**
 * Matches a bare number, without requiring a currency marker. Used for
 * manual conversions and inclusion rules (DISENO.md section 15), where the
 * user (or a learned rule) has already confirmed the amount is a price;
 * `TOKEN_PATTERN`'s marker requirement does not apply there.
 */
export const NUMBER_PATTERN = new RegExp(NUMBER_SOURCE, 'g');

const PREFIX_MARKER_SOURCE = `${DOLLAR_PREFIX_SOURCE}|${ARS_PREFIX_SOURCE}|${AMBIGUOUS_MARKER_SOURCE}`;
const SUFFIX_MARKER_SOURCE = `${ARS_SUFFIX_SOURCE}|${DOLLAR_SUFFIX_SOURCE}`;

/**
 * Matches a candidate monetary token: an optional currency marker before the
 * number, an optional currency marker after it, or both. A match with
 * neither group is not a currency token and must be discarded by the caller,
 * since a bare number is never converted.
 *
 * The separating whitespace lives inside the same optional group as its
 * marker, so it is only consumed when that marker actually matches. Keeping
 * it outside would let the engine absorb a stray leading or trailing space
 * even when no marker is present.
 */
export const TOKEN_PATTERN = new RegExp(
  String.raw`(?:(?<prefix>${PREFIX_MARKER_SOURCE})\s?)?(?<number>${NUMBER_SOURCE})(?:\s?(?<suffix>${SUFFIX_MARKER_SOURCE}))?`,
  'gi',
);

/**
 * Classifies a matched prefix or suffix marker into what it implies about
 * the amount's currency. Order matters: a dollar marker always wins over the
 * ambiguous `$` sign, since `U$S` contains a `$` but must be rejected.
 *
 * @param {string} [marker] The matched marker text, if any.
 * @returns {MarkerKind} What the marker implies about the currency.
 */
export function classifyMarker(marker?: string): MarkerKind {
  if (!marker) return 'none';
  if (DOLLAR_MARKER_REGEX.test(marker)) return 'dollar';
  if (ARS_EXPLICIT_MARKER_REGEX.test(marker)) return 'ars-explicit';
  if (AMBIGUOUS_MARKER_REGEX.test(marker)) return 'ambiguous';
  return 'none';
}
