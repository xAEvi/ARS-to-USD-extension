import { getConfiguration } from '../config/store';
import type { Message } from '../shared/messages';
import { getRate, refreshRate, type RateResult } from './rate-service';
import { addRule, getRules } from './suppression-store';

async function handleRateRequest(
  resolve: (config: Parameters<typeof getRate>[0]) => Promise<RateResult>,
): Promise<RateResult> {
  const config = await getConfiguration();
  return resolve(config);
}

/**
 * Registers the background message listener for `RATE_GET`/`RATE_REFRESH`
 * and `RULES_GET`/`RULES_ADD`, resolved against the stored configuration.
 * `SCAN_*` messages never reach this listener: the popup sends them
 * straight to the content script via `chrome.tabs.sendMessage`.
 * `RULES_REMOVE`/`RULES_CLEAR` arrive in Fase 6, with the popup UI that
 * sends them.
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

      if (message.type === 'RULES_GET') {
        getRules(message.hostname).then(sendResponse);
        return true;
      }

      if (message.type === 'RULES_ADD') {
        getConfiguration()
          .then((config) => addRule(message.rule, config.maxRulesPerHost))
          .then(() => sendResponse());
        return true;
      }

      return undefined;
    },
  );
}
