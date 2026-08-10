import type { InclusionRule } from '../core/inclusion';
import { getStorageValue, setStorageValue } from '../shared/storage';

function storageKey(hostname: string): string {
  return `inclusion:${hostname}`;
}

/**
 * Reads the inclusion rules saved for a hostname, in `chrome.storage.local`.
 *
 * @param {string} hostname The normalized hostname to look up.
 * @returns {Promise<Array<InclusionRule>>} The rules for that host, or an empty array.
 */
export async function getRules(
  hostname: string,
): Promise<Array<InclusionRule>> {
  return (
    (await getStorageValue<Array<InclusionRule>>(storageKey(hostname))) ?? []
  );
}

/**
 * Persists an inclusion rule, upserting by `id` so re-marking the same spot
 * updates the existing rule instead of duplicating it. When the host's rule
 * count exceeds `maxRulesPerHost`, prunes the least recently matched rules
 * first, mirroring `suppression-store.ts`'s `addRule`.
 *
 * @param {InclusionRule} rule The rule to persist.
 * @param {number} maxRulesPerHost Cap on rules kept per host before pruning.
 * @returns {Promise<void>} A promise that resolves once the rule is persisted.
 */
export async function addRule(
  rule: InclusionRule,
  maxRulesPerHost: number,
): Promise<void> {
  const existing = await getRules(rule.hostname);
  const next = [...existing.filter((current) => current.id !== rule.id), rule];

  const pruned =
    next.length > maxRulesPerHost
      ? next
          .slice()
          .sort(
            (a, b) =>
              (a.lastMatchedAt ?? a.createdAt) -
              (b.lastMatchedAt ?? b.createdAt),
          )
          .slice(next.length - maxRulesPerHost)
      : next;

  await setStorageValue(storageKey(rule.hostname), pruned);
}

/**
 * Marks the given rules as having just matched a detection, so the LRU
 * pruning in `addRule` can order by actual usage instead of falling back to
 * `createdAt`.
 *
 * @param {string} hostname The normalized hostname the rules belong to.
 * @param {Array<string>} ruleIds Ids of the rules that matched during a scan.
 * @returns {Promise<void>} A promise that resolves once the update is persisted.
 */
export async function touchRules(
  hostname: string,
  ruleIds: Array<string>,
): Promise<void> {
  if (ruleIds.length === 0) return;

  const rules = await getRules(hostname);
  const matchedIds = new Set(ruleIds);
  const now = Date.now();

  await setStorageValue(
    storageKey(hostname),
    rules.map((rule) =>
      matchedIds.has(rule.id) ? { ...rule, lastMatchedAt: now } : rule,
    ),
  );
}
