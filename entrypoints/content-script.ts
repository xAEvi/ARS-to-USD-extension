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
  annotateTextNode,
  injectAnnotationStyles,
  revert,
  revertWrap,
} from '../src/page/annotator';
import { buildPageContext } from '../src/page/context';
import { showFeedbackPopover } from '../src/page/feedback-popover';
import { computeSignature } from '../src/page/signature';
import { collectTextNodes } from '../src/page/walker';
import type { Message, ScanSummary } from '../src/shared/messages';

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

function runScan(
  rate: ExchangeRate,
  minConfidence: Confidence,
  rules: Array<SuppressionRule>,
): ScanSummary {
  injectAnnotationStyles();

  const context = buildPageContext(document);
  const summary: ScanSummary = {
    totalAnnotated: 0,
    byConfidence: { high: 0, medium: 0, low: 0 },
    suppressed: 0,
  };

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
    for (const amount of candidates) {
      const isSuppressed = rules.some((rule) =>
        matchesRule(rule, { token: amount.rawText, signature, signatureGroup }),
      );

      if (isSuppressed) summary.suppressed += 1;
      else kept.push(amount);
    }

    if (kept.length === 0) continue;

    annotateTextNode(
      textNode,
      kept,
      (amount) => formatUsd(convertToUsd(amount.valueArs, rate)),
      handleFeedbackRequested,
    );

    for (const amount of kept) {
      summary.totalAnnotated += 1;
      summary.byConfidence[amount.confidence] += 1;
    }
  }

  return summary;
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
        sendResponse(
          runScan(message.rate, message.minConfidence, message.rules),
        );
        return;
      }

      if (message.type === 'SCAN_REVERT') {
        revert(document.body);
        sendResponse();
        return;
      }

      return undefined;
    },
  );
});
