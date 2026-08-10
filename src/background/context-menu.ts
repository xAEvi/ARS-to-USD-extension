import { getConfiguration } from '../config/store';
import type { Message } from '../shared/messages';
import { getRate } from './rate-service';

const CONVERT_SELECTION_MENU_ID = 'aru-convert-selection';

/**
 * Registers the `Convertir "%s" a USD` context menu item over selected text
 * (DISENO.md section 15.2), and its click handler. Selection-based, rather
 * than tracking every right-click, so the extension does not need an
 * always-on content script listening on every page: the selection gesture
 * is as explicit as clicking "Convertir" in the popup.
 */
export function registerContextMenu(): void {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: CONVERT_SELECTION_MENU_ID,
      title: 'Convertir "%s" a USD',
      contexts: ['selection'],
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONVERT_SELECTION_MENU_ID || !tab?.id) return;
    void handleConvertSelection(info, tab.id);
  });
}

async function handleConvertSelection(
  info: chrome.contextMenus.OnClickData,
  tabId: number,
): Promise<void> {
  const config = await getConfiguration();
  const rateResult = await getRate(config);
  if (rateResult.status === 'error') return;

  await chrome.scripting.executeScript({
    target:
      info.frameId !== undefined
        ? { tabId, frameIds: [info.frameId] }
        : { tabId },
    files: ['content-script.js'],
  });

  const message: Message = {
    type: 'MANUAL_CONVERT_SELECTION',
    rate: rateResult.rate,
  };

  if (info.frameId !== undefined)
    await chrome.tabs.sendMessage(tabId, message, { frameId: info.frameId });
  else await chrome.tabs.sendMessage(tabId, message);
}
