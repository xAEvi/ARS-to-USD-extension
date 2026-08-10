import { convertToUsd } from '../src/core/converter';
import { detect, meetsMinConfidence } from '../src/core/detector';
import { formatUsd } from '../src/core/formatter';
import {
  buildRuleId,
  matches as matchesRule,
  normalizeHostname,
  type SuppressionRule,
} from '../src/core/suppression';
import type {
  Confidence,
  DetectedAmount,
  ExchangeRate,
} from '../src/core/types';
import {
  annotateMixedTextNode,
  annotateTextNode,
  convertSuppressedWrap,
  injectAnnotationStyles,
  revert,
  revertWrap,
  type SuppressedAmount,
} from '../src/page/annotator';
import { buildPageContext } from '../src/page/context';
import { showFeedbackPopover } from '../src/page/feedback-popover';
import { observeMutations, type MutationWatcher } from '../src/page/observer';
import { computeSignature } from '../src/page/signature';
import { collectTextNodes } from '../src/page/walker';
import type { Message, ScanSummary } from '../src/shared/messages';

/**
 * The mutation observer for the current conversion session, if any. Lives
 * at module scope so it survives across `SCAN_RUN`/`SCAN_REVERT` messages
 * handled by the same injected script instance.
 */
let activeObserverHandle: MutationWatcher | undefined;

/**
 * Opens the false-alarm popover for a clicked amount and, on confirmation,
 * persists the suppression rule and reverts the affected annotation(s) --
 * just the clicked one for `location`, every visible equivalent for
 * `location-group` -- per DISENO.md section 9's marking flow.
 */
function handleFeedbackRequested(
  wrap: HTMLElement,
  amount: DetectedAmount,
): void {
  const container = wrap.parentElement;
  if (!container) return;

  const { signature, signatureGroup } = computeSignature(container);
  const hostname = normalizeHostname(document.location.hostname);

  showFeedbackPopover(wrap, ({ reason, scope }) => {
    const matcher =
      scope === 'token'
        ? amount.rawText
        : scope === 'location-group'
          ? signatureGroup
          : signature;

    const rule: SuppressionRule = {
      id: buildRuleId(hostname, scope, matcher),
      hostname,
      scope,
      token: scope === 'token' ? amount.rawText : undefined,
      signature: scope === 'token' ? undefined : matcher,
      reason,
      createdAt: Date.now(),
    };

    chrome.runtime
      .sendMessage({ type: 'RULES_ADD', rule } satisfies Message)
      .then(() => {
        if (scope !== 'location-group') {
          revertWrap(wrap);
          return;
        }

        for (const otherWrap of document.querySelectorAll('[data-aru-wrap]')) {
          const otherContainer = otherWrap.parentElement;
          if (!otherContainer) continue;
          if (
            computeSignature(otherContainer).signatureGroup === signatureGroup
          )
            revertWrap(otherWrap);
        }
      });
  });
}

/**
 * Handles a click on a suppressed amount's marker (DISENO.md section 6.7,
 * "mostrar suprimidos" mode): removes every rule that blocked it, then
 * converts the wrap in place.
 */
function handleUnsuppressRequested(
  wrap: HTMLElement,
  amount: SuppressedAmount,
  rate: ExchangeRate,
  hostname: string,
): void {
  Promise.all(
    amount.ruleIds.map((ruleId) =>
      chrome.runtime.sendMessage({
        type: 'RULES_REMOVE',
        hostname,
        ruleId,
      } satisfies Message),
    ),
  ).then(() => {
    convertSuppressedWrap(
      wrap,
      amount,
      (a) => formatUsd(convertToUsd(a.valueArs, rate)),
      handleFeedbackRequested,
    );
  });
}

function runScan(
  rate: ExchangeRate,
  minConfidence: Confidence,
  rules: Array<SuppressionRule>,
  showSuppressed: boolean,
): ScanSummary {
  injectAnnotationStyles();

  const context = buildPageContext(document);
  const hostname = normalizeHostname(document.location.hostname);
  const summary: ScanSummary = {
    totalAnnotated: 0,
    byConfidence: { high: 0, medium: 0, low: 0 },
    suppressed: 0,
  };
  const matchedRuleIds = new Set<string>();
  const formatAmount = (amount: DetectedAmount): string =>
    formatUsd(convertToUsd(amount.valueArs, rate));

  for (const textNode of collectTextNodes(document.body)) {
    const container = textNode.parentElement;
    if (!container) continue;

    const candidates = detect(textNode.textContent ?? '', context).filter(
      (amount) => meetsMinConfidence(amount.confidence, minConfidence),
    );

    if (candidates.length === 0) continue;

    // Every candidate in this text node shares the same container, so the
    // signature is only computed once per node, not once per match.
    const { signature, signatureGroup } = computeSignature(container);

    const kept: Array<DetectedAmount> = [];
    const suppressed: Array<SuppressedAmount> = [];

    for (const amount of candidates) {
      const matchingRules = rules.filter((rule) =>
        matchesRule(rule, { token: amount.rawText, signature, signatureGroup }),
      );

      if (matchingRules.length === 0) {
        kept.push(amount);
        continue;
      }

      summary.suppressed += 1;
      for (const rule of matchingRules) matchedRuleIds.add(rule.id);

      if (showSuppressed)
        suppressed.push({
          ...amount,
          ruleIds: matchingRules.map((rule) => rule.id),
          reason: matchingRules[0]!.reason,
        });
    }

    if (kept.length === 0 && suppressed.length === 0) continue;

    if (suppressed.length > 0) {
      annotateMixedTextNode(
        textNode,
        kept,
        suppressed,
        formatAmount,
        handleFeedbackRequested,
        (wrap, amount) =>
          handleUnsuppressRequested(wrap, amount, rate, hostname),
      );
    } else {
      annotateTextNode(textNode, kept, formatAmount, handleFeedbackRequested);
    }

    for (const amount of kept) {
      summary.totalAnnotated += 1;
      summary.byConfidence[amount.confidence] += 1;
    }
  }

  if (matchedRuleIds.size > 0)
    chrome.runtime.sendMessage({
      type: 'RULES_TOUCH',
      hostname,
      ruleIds: [...matchedRuleIds],
    } satisfies Message);

  return summary;
}

/**
 * Runs a scan with the mutation observer paused, so the annotations it
 * produces aren't mistaken for an external change and don't trigger a
 * feedback loop (DISENO.md section 5.4).
 */
function runScanGuarded(
  rate: ExchangeRate,
  minConfidence: Confidence,
  rules: Array<SuppressionRule>,
  showSuppressed: boolean,
): ScanSummary {
  activeObserverHandle?.pause();
  const summary = runScan(rate, minConfidence, rules, showSuppressed);
  activeObserverHandle?.resume();
  return summary;
}

/**
 * Rescans the page in response to a mutation observed after the initial
 * scan. Fetches the suppression rules fresh instead of reusing the ones
 * from the original `SCAN_RUN`: a rule added mid-session (via the feedback
 * popover or the "mostrar suprimidos" marker) reverts or converts its
 * target outside of a scan, and the observer would otherwise see that
 * write and re-annotate it with the stale rule list.
 */
async function rescanForObserver(
  rate: ExchangeRate,
  minConfidence: Confidence,
  showSuppressed: boolean,
  hostname: string,
): Promise<void> {
  activeObserverHandle?.pause();
  try {
    const rules = (await chrome.runtime.sendMessage({
      type: 'RULES_GET',
      hostname,
    } satisfies Message)) as Array<SuppressionRule>;
    runScan(rate, minConfidence, rules, showSuppressed);
  } finally {
    activeObserverHandle?.resume();
  }
}

export default defineUnlistedScript(() => {
  // The popup injects this script on every "Convertir" click, which can
  // execute it more than once per page without a reload. Guard against
  // registering duplicate listeners.
  const injectedWindow = window as typeof window & {
    __aruContentScriptLoaded?: boolean;
  };
  if (injectedWindow.__aruContentScriptLoaded) return;
  injectedWindow.__aruContentScriptLoaded = true;

  chrome.runtime.onMessage.addListener(
    (message: Message, _sender, sendResponse) => {
      if (message.type === 'SCAN_RUN') {
        const summary = runScanGuarded(
          message.rate,
          message.minConfidence,
          message.rules,
          message.showSuppressed,
        );

        activeObserverHandle?.disconnect();
        activeObserverHandle = message.watchMutations
          ? observeMutations(document.body, () => {
              void rescanForObserver(
                message.rate,
                message.minConfidence,
                message.showSuppressed,
                normalizeHostname(document.location.hostname),
              );
            })
          : undefined;

        sendResponse(summary);
        return;
      }

      if (message.type === 'SCAN_REVERT') {
        activeObserverHandle?.disconnect();
        activeObserverHandle = undefined;
        revert(document.body);
        sendResponse();
        return;
      }

      return undefined;
    },
  );
});
