/**
 * Normalizes a hostname for storage and comparison: lowercased, with a
 * leading `www.` stripped so `www.example.com` and `example.com` are
 * treated as the same site.
 *
 * @param {string} hostname The raw hostname, e.g. from `location.hostname`.
 * @returns {string} The normalized hostname.
 */
export function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}
