import { getStorageValue, setStorageValue } from '../shared/storage';

const ACTIVE_TABS_KEY = 'active-tabs';

const BADGE_TEXT = 'ON';
const BADGE_BACKGROUND_COLOR = '#1a7f37';

/**
 * `chrome.storage.session` and not `local`: the active state is meant to
 * survive only for the browser session, the same lifetime `activeTab`
 * itself has. Persisting it in `local` would make the badge lie after a
 * browser restart, claiming a tab is active when the permission that made
 * it so is already gone.
 */
async function getActiveTabIds(): Promise<Array<number>> {
  return (await getStorageValue<Array<number>>(ACTIVE_TABS_KEY, 'session')) ?? [];
}

/**
 * Whether the extension is active on a given tab.
 *
 * @param {number} tabId The tab to check.
 * @returns {Promise<boolean>} Whether the tab is active.
 */
export async function isTabActive(tabId: number): Promise<boolean> {
  return (await getActiveTabIds()).includes(tabId);
}

function setBadge(tabId: number, active: boolean): void {
  void chrome.action.setBadgeText({ tabId, text: active ? BADGE_TEXT : '' });
  if (active)
    void chrome.action.setBadgeBackgroundColor({
      tabId,
      color: BADGE_BACKGROUND_COLOR,
    });
}

/**
 * Marks a tab as active or inactive, persists it and updates the toolbar
 * badge so the user can tell without opening the popup.
 *
 * @param {number} tabId The tab to update.
 * @param {boolean} active Whether the tab should be marked active.
 * @returns {Promise<void>} A promise that resolves once the change is persisted.
 */
export async function setTabActive(
  tabId: number,
  active: boolean,
): Promise<void> {
  const tabIds = await getActiveTabIds();
  const next = active
    ? [...new Set([...tabIds, tabId])]
    : tabIds.filter((id) => id !== tabId);

  await setStorageValue(ACTIVE_TABS_KEY, next, 'session');
  setBadge(tabId, active);
}

/**
 * Registers cleanup for tabs that stop being eligible for an active session:
 * closed tabs, and tabs that navigate to a new document. Navigation matters
 * because `activeTab` itself is revoked on navigation (DISENO.md section
 * 2.2), so keeping the tab marked active past that point would show a badge
 * for a permission the extension no longer holds.
 */
export function registerActiveTabCleanup(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void setTabActive(tabId, false);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading' && changeInfo.url !== undefined)
      void setTabActive(tabId, false);
  });
}
