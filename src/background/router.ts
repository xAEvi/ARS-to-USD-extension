import { getConfiguration } from '../config/store';
import type { Message } from '../shared/messages';
import { getRate, refreshRate, type RateResult } from './rate-service';

async function handleRateRequest(
  resolve: (config: Parameters<typeof getRate>[0]) => Promise<RateResult>,
): Promise<RateResult> {
  const config = await getConfiguration();
  return resolve(config);
}

/**
 * Registers the background message listener for `RATE_GET`/`RATE_REFRESH`,
 * resolved against the stored configuration. `SCAN_*` messages never reach
 * this listener: the popup sends them straight to the content script via
 * `chrome.tabs.sendMessage`. `RULES_*` messages arrive in Fase 5.
 */
export function registerRouter(): void {
  chrome.runtime.onMessage.addListener(
    (message: Message, _sender, sendResponse) => {
      if (message.type === 'RATE_GET') {
        handleRateRequest(getRate).then(sendResponse);
        return true;
      }

      if (message.type === 'RATE_REFRESH') {
        handleRateRequest(refreshRate).then(sendResponse);
        return true;
      }

      return undefined;
    },
  );
}
