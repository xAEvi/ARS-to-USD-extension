/**
 * Typed message contracts. `RATE_GET`/`RATE_REFRESH` go from any extension
 * page to the background. `ACTIVATE`/`DEACTIVATE` go from the popup straight
 * to the content script of the current tab, via `chrome.tabs.sendMessage`.
 */
export type Message =
  | { type: 'RATE_GET' }
  | { type: 'RATE_REFRESH' }
  | { type: 'ACTIVATE' }
  | { type: 'DEACTIVATE' };
