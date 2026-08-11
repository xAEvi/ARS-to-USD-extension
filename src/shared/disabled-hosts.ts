import { normalizeHostname } from '../core/hostname';
import { getStorageValue, setStorageValue } from './storage';

const DISABLED_HOSTS_KEY = 'disabled-hosts';

const BADGE_TEXT = 'OFF';
const BADGE_BACKGROUND_COLOR = '#8a8a8a';

/**
 * The extension is active on every site by default; this is the opt-out
 * list of hostnames where the user turned it off from the popup. Kept in
 * `chrome.storage.local` and not `sync`: it is a per-device browsing
 * preference, not something that should follow the user's Chrome profile
 * across machines the way the rate configuration does.
 */
async function getDisabledHosts(): Promise<Array<string>> {
  return (await getStorageValue<Array<string>>(DISABLED_HOSTS_KEY)) ?? [];
}

/**
 * Whether the extension is disabled on a given hostname.
 *
 * @param {string} hostname The hostname to check, as returned by `location.hostname`.
 * @returns {Promise<boolean>} Whether the extension is disabled there.
 */
export async function isHostDisabled(hostname: string): Promise<boolean> {
  return (await getDisabledHosts()).includes(normalizeHostname(hostname));
}

function setBadge(tabId: number, disabled: boolean): void {
  void chrome.action.setBadgeText({ tabId, text: disabled ? BADGE_TEXT : '' });
  if (disabled)
    void chrome.action.setBadgeBackgroundColor({
      tabId,
      color: BADGE_BACKGROUND_COLOR,
    });
}

/**
 * Enables or disables the extension on a hostname, persists it and updates
 * the toolbar badge for the given tab. The badge only appears when disabled:
 * active is the default state and does not need to announce itself.
 *
 * @param {string} hostname The hostname to update.
 * @param {boolean} disabled Whether the extension should be disabled there.
 * @param {number} [tabId] The current tab, to reflect the change in its badge.
 * @returns {Promise<void>} A promise that resolves once the change is persisted.
 */
export async function setHostDisabled(
  hostname: string,
  disabled: boolean,
  tabId?: number,
): Promise<void> {
  const normalized = normalizeHostname(hostname);
  const hosts = await getDisabledHosts();
  const next = disabled
    ? [...new Set([...hosts, normalized])]
    : hosts.filter((host) => host !== normalized);

  await setStorageValue(DISABLED_HOSTS_KEY, next);
  if (tabId !== undefined) setBadge(tabId, disabled);
}
