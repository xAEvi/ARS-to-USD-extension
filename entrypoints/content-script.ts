import { convertToUsd } from '../src/core/converter';
import { detect, meetsMinConfidence } from '../src/core/detector';
import { formatUsd } from '../src/core/formatter';
import type {
  Confidence,
  DetectedAmount,
  ExchangeRate,
} from '../src/core/types';
import {
  annotateTextNode,
  injectAnnotationStyles,
  revert,
} from '../src/page/annotator';
import { buildPageContext } from '../src/page/context';
import { collectTextNodes } from '../src/page/walker';
import type { Message, ScanSummary } from '../src/shared/messages';

function runScan(rate: ExchangeRate, minConfidence: Confidence): ScanSummary {
  injectAnnotationStyles();

  const context = buildPageContext(document);
  const summary: ScanSummary = {
    totalAnnotated: 0,
    byConfidence: { high: 0, medium: 0, low: 0 },
    suppressed: 0,
  };

  for (const textNode of collectTextNodes(document.body)) {
    const matches = detect(textNode.textContent ?? '', context).filter(
      (amount) => meetsMinConfidence(amount.confidence, minConfidence),
    );

    if (matches.length === 0) continue;

    annotateTextNode(textNode, matches, (amount: DetectedAmount) =>
      formatUsd(convertToUsd(amount.valueArs, rate)),
    );

    for (const amount of matches) {
      summary.totalAnnotated += 1;
      summary.byConfidence[amount.confidence] += 1;
    }
  }

  return summary;
}

export default defineUnlistedScript(() => {
  chrome.runtime.onMessage.addListener(
    (message: Message, _sender, sendResponse) => {
      if (message.type === 'SCAN_RUN') {
        sendResponse(runScan(message.rate, message.minConfidence));
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
