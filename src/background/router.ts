import { getConfiguration } from '../config/store';
import type { Message } from '../shared/messages';
import {
  addRule as addInclusionRule,
  getRules as getInclusionRules,
  touchRules as touchInclusionRules,
} from './inclusion-store';
import { getRate, refreshRate, type RateResult } from './rate-service';
import {
  addRule,
  clearRules,
  getRules,
  removeRule,
  touchRules,
} from './suppression-store';

async function handleRateRequest(
  resolve: (config: Parameters<typeof getRate>[0]) => Promise<RateResult>,
): Promise<RateResult> {
  const config = await getConfiguration();
  return resolve(config);
}

/**
 * Registers the background message listener for `RATE_GET`/`RATE_REFRESH`,
 * the `RULES_*` family and `INCLUSION_ADD`, resolved against the stored
 * configuration and `suppression-store.ts`/`inclusion-store.ts`. `SCAN_*`
 * messages never reach this listener: the popup sends them straight to the
 * content script via `chrome.tabs.sendMessage`.
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

      if (message.type === 'RULES_REMOVE') {
        removeRule(message.hostname, message.ruleId).then(() =>
          sendResponse(),
        );
        return true;
      }

      if (message.type === 'RULES_CLEAR') {
        clearRules(message.hostname).then(() => sendResponse());
        return true;
      }

      if (message.type === 'RULES_TOUCH') {
        touchRules(message.hostname, message.ruleIds).then(() =>
          sendResponse(),
        );
        return true;
      }

      if (message.type === 'INCLUSION_GET') {
        getInclusionRules(message.hostname).then(sendResponse);
        return true;
      }

      if (message.type === 'INCLUSION_ADD') {
        getConfiguration()
          .then((config) =>
            addInclusionRule(message.rule, config.maxRulesPerHost),
          )
          .then(() => sendResponse());
        return true;
      }

      if (message.type === 'INCLUSION_TOUCH') {
        touchInclusionRules(message.hostname, message.ruleIds).then(() =>
          sendResponse(),
        );
        return true;
      }

      return undefined;
    },
  );
}
