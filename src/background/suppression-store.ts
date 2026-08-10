import type { SuppressionRule } from '../core/suppression';
import { getStorageValue, setStorageValue } from '../shared/storage';

function storageKey(hostname: string): string {
  return `suppression:${hostname}`;
}

/**
 * Reads the suppression rules saved for a hostname, in `chrome.storage.local`.
 *
 * @param {string} hostname The normalized hostname to look up.
 * @returns {Promise<Array<SuppressionRule>>} The rules for that host, or an empty array.
 */
export async function getRules(
  hostname: string,
): Promise<Array<SuppressionRule>> {
  return (
    (await getStorageValue<Array<SuppressionRule>>(storageKey(hostname))) ?? []
  );
}

/**
 * Persists a suppression rule, upserting by `id` so re-marking the same
 * spot updates the existing rule instead of duplicating it. When the host's
 * rule count exceeds `maxRulesPerHost`, prunes the least recently matched
 * rules first, per DISENO.md section 6.5.
 *
 * @param {SuppressionRule} rule The rule to persist.
 * @param {number} maxRulesPerHost Cap on rules kept per host before pruning.
 * @returns {Promise<void>} A promise that resolves once the rule is persisted.
 */
export async function addRule(
  rule: SuppressionRule,
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
 * Removes a single rule from a host's list.
 *
 * @param {string} hostname The normalized hostname the rule belongs to.
 * @param {string} ruleId The id of the rule to remove.
 * @returns {Promise<void>} A promise that resolves once the removal is persisted.
 */
export async function removeRule(
  hostname: string,
  ruleId: string,
): Promise<void> {
  const rules = await getRules(hostname);
  await setStorageValue(
    storageKey(hostname),
    rules.filter((rule) => rule.id !== ruleId),
  );
}

/**
 * Removes every rule saved for a host.
 *
 * @param {string} hostname The normalized hostname to clear.
 * @returns {Promise<void>} A promise that resolves once the rules are cleared.
 */
export async function clearRules(hostname: string): Promise<void> {
  await setStorageValue(storageKey(hostname), []);
}
