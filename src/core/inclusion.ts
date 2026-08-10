/**
 * A rule that tells the detector to treat a structural location as an ARS
 * amount even without a currency marker, learned from a manual conversion
 * via the context menu. The inverse of `SuppressionRule` (DISENO.md section
 * 15.3): suppression learns "this is not a price", this learns "this is".
 */
export type InclusionRule = {
  /** Stable identifier derived from the hostname and the structural signature. */
  id: string;

  /** Hostname the rule applies to, with the www prefix removed. */
  hostname: string;

  /** Structural signature of the container, with positional descriptors removed. */
  signatureGroup: string;

  /** Creation timestamp, in epoch milliseconds. */
  createdAt: number;

  /** Last time the rule matched a detection, in epoch milliseconds. */
  lastMatchedAt?: number;
};

/**
 * What a text node looks like to the inclusion matcher, computed by the
 * page layer so this module stays free of DOM access.
 */
export type InclusionCandidate = {
  /** Structural signature of the container, with positional descriptors removed. */
  signatureGroup: string;
};

/**
 * Whether an inclusion rule applies to a candidate location.
 *
 * @param {InclusionRule} rule The rule to test.
 * @param {InclusionCandidate} candidate The candidate location.
 * @returns {boolean} Whether the rule matches the candidate.
 */
export function matchesInclusion(
  rule: InclusionRule,
  candidate: InclusionCandidate,
): boolean {
  return rule.signatureGroup === candidate.signatureGroup;
}

/**
 * Builds a stable, human-readable rule id from its hostname and structural
 * signature, so re-marking the same spot upserts the existing rule instead
 * of duplicating it.
 *
 * @param {string} hostname The normalized hostname the rule applies to.
 * @param {string} signatureGroup The structural signature the rule matches against.
 * @returns {string} The rule id.
 */
export function buildInclusionRuleId(
  hostname: string,
  signatureGroup: string,
): string {
  return `${hostname}:${signatureGroup}`;
}
