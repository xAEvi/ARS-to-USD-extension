/** What a suppression rule matches against. */
export type SuppressionScope =
  /** Matches the literal token text anywhere in the host. */
  | 'token'

  /** Matches the exact structural signature, including positional descriptors. */
  | 'location'

  /** Matches the structural signature with positional descriptors removed. */
  | 'location-group';

/** Why the user marked a detection as a false positive. */
export type SuppressionReason =
  /** The matched text is not a monetary value at all. */
  | 'not-a-price'

  /** The matched text is monetary but not expressed in Argentine pesos. */
  | 'not-ars';

/** A persisted rule that suppresses future detections matching it. */
export type SuppressionRule = {
  /** Stable identifier derived from the hostname, scope and matcher. */
  id: string;

  /** Hostname the rule applies to, with the www prefix removed. */
  hostname: string;

  /** What the rule matches against. */
  scope: SuppressionScope;

  /** Literal token text. Present when scope is token. */
  token?: string;

  /** Structural signature of the container. Present when scope is location or location-group. */
  signature?: string;

  /** Why the user marked the detection as a false positive. */
  reason: SuppressionReason;

  /** Creation timestamp, in epoch milliseconds. */
  createdAt: number;

  /** Last time the rule suppressed a detection, in epoch milliseconds. */
  lastMatchedAt?: number;
};

/**
 * What a detected amount looks like to the suppression matcher, computed by
 * the page layer so this module stays free of DOM access.
 */
export type SuppressionCandidate = {
  /** The matched token text, exactly as detected. */
  token: string;

  /** Structural signature of the container, including positional descriptors. */
  signature: string;

  /** Structural signature of the container, with positional descriptors removed. */
  signatureGroup: string;
};

/**
 * Whether a suppression rule applies to a candidate detection. Suppression
 * is a hard veto: it never lowers confidence, since it is an explicit user
 * decision that outranks any automatic signal.
 *
 * @param {SuppressionRule} rule The rule to test.
 * @param {SuppressionCandidate} candidate The candidate detection.
 * @returns {boolean} Whether the rule suppresses the candidate.
 */
export function matches(
  rule: SuppressionRule,
  candidate: SuppressionCandidate,
): boolean {
  if (rule.scope === 'token') return rule.token === candidate.token;
  if (rule.scope === 'location') return rule.signature === candidate.signature;
  return rule.signature === candidate.signatureGroup;
}

/**
 * Normalizes a hostname for rule storage and lookup by dropping a leading
 * `www.`. Rules are per exact hostname and never propagate across
 * subdomains beyond that.
 *
 * @param {string} hostname The hostname to normalize.
 * @returns {string} The normalized hostname.
 */
export function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./i, '');
}

/**
 * Builds a stable, human-readable rule id from its hostname, scope and
 * matcher, so re-marking the same spot upserts the existing rule instead of
 * duplicating it.
 *
 * @param {string} hostname The normalized hostname the rule applies to.
 * @param {SuppressionScope} scope The rule's scope.
 * @param {string} matcher The token or signature the rule matches against.
 * @returns {string} The rule id.
 */
export function buildRuleId(
  hostname: string,
  scope: SuppressionScope,
  matcher: string,
): string {
  return `${hostname}:${scope}:${matcher}`;
}
