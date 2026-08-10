import { convertToUsd } from '../src/core/converter';
import { detect, meetsMinConfidence } from '../src/core/detector';
import { formatUsd } from '../src/core/formatter';
import { buildInclusionRuleId, type InclusionRule } from '../src/core/inclusion';
import { parseAmount } from '../src/core/number-parser';
import { NUMBER_PATTERN } from '../src/core/patterns';
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
import { processInBatches } from '../src/page/scheduler';
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

/**
 * Finds the `NUMBER_PATTERN` match closest to `offset` within `text`: the
 * one containing it if any, otherwise the first match found. Used so a text
 * node with more than one number (e.g. "3 cuotas de $200") picks the one
 * the user actually selected instead of always the first.
 */
function findNumberNearOffset(
  text: string,
  offset: number,
): { rawText: string; start: number; end: number } | undefined {
  NUMBER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  let fallback: { rawText: string; start: number; end: number } | undefined;

  while ((match = NUMBER_PATTERN.exec(text))) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset <= end)
      return { rawText: match[0], start, end };
    fallback ??= { rawText: match[0], start, end };
  }

  return fallback;
}

/**
 * Handles a click on the "Convertir "%s" a USD" context menu item
 * (DISENO.md section 15.2): reads the live selection instead of the text
 * carried in the message, since it is still intact on the page by the time
 * the menu click arrives. Annotates the amount closest to the selection
 * with high confidence, and remembers the container's structural signature
 * as an `InclusionRule` so similar pages convert it automatically.
 */
function handleManualConvertSelection(rate: ExchangeRate): void {
  const selection = window.getSelection();
  const anchorNode = selection?.anchorNode;
  if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) return;

  const textNode = anchorNode as Text;
  const container = textNode.parentElement;
  if (!container) return;
  if (container.closest('[data-aru-wrap], [contenteditable]')) return;

  const found = findNumberNearOffset(
    textNode.textContent ?? '',
    selection!.anchorOffset,
  );
  if (!found) return;

  const amount: DetectedAmount = {
    rawText: found.rawText,
    startIndex: found.start,
    endIndex: found.end,
    valueArs: parseAmount(found.rawText).value,
    confidence: 'high',
  };

  injectAnnotationStyles();
  annotateTextNode(
    textNode,
    [amount],
    (a) => formatUsd(convertToUsd(a.valueArs, rate)),
    handleFeedbackRequested,
  );

  const hostname = normalizeHostname(document.location.hostname);
  const { signatureGroup } = computeSignature(container);
  const rule: InclusionRule = {
    id: buildInclusionRuleId(hostname, signatureGroup),
    hostname,
    signatureGroup,
    createdAt: Date.now(),
  };

  chrome.runtime.sendMessage({ type: 'INCLUSION_ADD', rule } satisfies Message);
}

/**
 * Scans the page for amounts to annotate, per DISENO.md section 5.4:
 * processed in batches via `processInBatches` instead of one long
 * synchronous pass, and stops starting new work once `maxAnnotations`
 * `[data-aru-wrap]` elements have been created. The text node in progress
 * when the cap is hit still finishes annotating all of its own matches, so
 * the final count can exceed `maxAnnotations` by at most that node's match
 * count -- a deliberate simplification, since the cap exists to avoid
 * hanging on huge listings, not to be exact to the item.
 */
function runScan(
  rate: ExchangeRate,
  minConfidence: Confidence,
  rules: Array<SuppressionRule>,
  showSuppressed: boolean,
  maxAnnotations: number,
): Promise<ScanSummary> {
  injectAnnotationStyles();

  const context = buildPageContext(document);
  const hostname = normalizeHostname(document.location.hostname);
  const summary: ScanSummary = {
    totalAnnotated: 0,
    byConfidence: { high: 0, medium: 0, low: 0 },
    suppressed: 0,
  };
  const matchedRuleIds = new Set<string>();
  let wrapCount = 0;
  const formatAmount = (amount: DetectedAmount): string =>
    formatUsd(convertToUsd(amount.valueArs, rate));

  return processInBatches(
    collectTextNodes(document.body),
    (textNode) => {
      const container = textNode.parentElement;
      if (!container) return;

      const candidates = detect(textNode.textContent ?? '', context).filter(
        (amount) => meetsMinConfidence(amount.confidence, minConfidence),
      );

      if (candidates.length === 0) return;

      // Every candidate in this text node shares the same container, so
      // the signature is only computed once per node, not once per match.
      const { signature, signatureGroup } = computeSignature(container);

      const kept: Array<DetectedAmount> = [];
      const suppressed: Array<SuppressedAmount> = [];

      for (const amount of candidates) {
        const matchingRules = rules.filter((rule) =>
          matchesRule(rule, {
            token: amount.rawText,
            signature,
            signatureGroup,
          }),
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

      if (kept.length === 0 && suppressed.length === 0) return;

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

      wrapCount += kept.length + suppressed.length;
      for (const amount of kept) {
        summary.totalAnnotated += 1;
        summary.byConfidence[amount.confidence] += 1;
      }
    },
    { shouldContinue: () => wrapCount < maxAnnotations },
  ).then(() => {
    if (matchedRuleIds.size > 0)
      chrome.runtime.sendMessage({
        type: 'RULES_TOUCH',
        hostname,
        ruleIds: [...matchedRuleIds],
      } satisfies Message);

    return summary;
  });
}

/**
 * Runs a scan with the mutation observer paused, so the annotations it
 * produces aren't mistaken for an external change and don't trigger a
 * feedback loop (DISENO.md section 5.4).
 */
async function runScanGuarded(
  rate: ExchangeRate,
  minConfidence: Confidence,
  rules: Array<SuppressionRule>,
  showSuppressed: boolean,
  maxAnnotations: number,
): Promise<ScanSummary> {
  activeObserverHandle?.pause();
  const summary = await runScan(
    rate,
    minConfidence,
    rules,
    showSuppressed,
    maxAnnotations,
  );
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
  maxAnnotations: number,
  hostname: string,
): Promise<void> {
  activeObserverHandle?.pause();
  try {
    const rules = (await chrome.runtime.sendMessage({
      type: 'RULES_GET',
      hostname,
    } satisfies Message)) as Array<SuppressionRule>;
    await runScan(rate, minConfidence, rules, showSuppressed, maxAnnotations);
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
        void (async () => {
          const summary = await runScanGuarded(
            message.rate,
            message.minConfidence,
            message.rules,
            message.showSuppressed,
            message.maxAnnotations,
          );

          activeObserverHandle?.disconnect();
          activeObserverHandle = message.watchMutations
            ? observeMutations(document.body, () => {
                void rescanForObserver(
                  message.rate,
                  message.minConfidence,
                  message.showSuppressed,
                  message.maxAnnotations,
                  normalizeHostname(document.location.hostname),
                );
              })
            : undefined;

          sendResponse(summary);
        })();
        return true;
      }

      if (message.type === 'SCAN_REVERT') {
        activeObserverHandle?.disconnect();
        activeObserverHandle = undefined;
        revert(document.body);
        sendResponse();
        return;
      }

      if (message.type === 'MANUAL_CONVERT_SELECTION') {
        handleManualConvertSelection(message.rate);
        sendResponse();
        return;
      }

      return undefined;
    },
  );
});
