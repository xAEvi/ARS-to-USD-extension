import type { RateResult } from '../src/background/rate-service';
import { convertToUsd } from '../src/core/converter';
import { formatUsd } from '../src/core/formatter';
import { readSelection } from '../src/core/selection';
import { closeAmountPanel, showAmountPanel } from '../src/page/panel';
import { isHostDisabled } from '../src/shared/disabled-hosts';
import type { Message } from '../src/shared/messages';
import { formatRateAge, RATE_PROVIDER_LABELS } from '../src/shared/rate-display';

/**
 * Whether an element (or its closest ancestor) is a surface the user can
 * type into. Selecting a monetary-looking string while editing a form field
 * is not a request to convert it.
 */
function isEditableSurface(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return !!element?.closest('[contenteditable], input, textarea');
}

export default defineContentScript({
  // Active on every page by default (DISENO.md section 2.2's activeTab-only
  // model is gone): the extension now listens for a monetary-looking
  // selection everywhere, and the popup's toggle only records an opt-out per
  // hostname in `disabled-hosts.ts`, checked below at load time.
  matches: ['http://*/*', 'https://*/*'],

  async main() {
    let enabled = !(await isHostDisabled(location.hostname));
    let activeRange: Range | undefined;

    function getAnchorRect(): DOMRect | undefined {
      return activeRange?.getBoundingClientRect();
    }

    function handlePanelClosed(): void {
      activeRange = undefined;
    }

    async function handleSelection(): Promise<void> {
      if (!enabled) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        closeAmountPanel();
        return;
      }

      const range = selection.getRangeAt(0);
      if (isEditableSurface(range.commonAncestorContainer)) {
        closeAmountPanel();
        return;
      }

      const amount = readSelection(range.toString());
      if (!amount) {
        closeAmountPanel();
        return;
      }

      activeRange = range.cloneRange();

      const rateResult = (await chrome.runtime.sendMessage({
        type: 'RATE_GET',
      } satisfies Message)) as RateResult;

      if (rateResult.status === 'error') {
        showAmountPanel(
          getAnchorRect,
          {
            status: 'error',
            rawText: amount.rawText,
            message: rateResult.message,
          },
          handlePanelClosed,
        );
        return;
      }

      const { rate } = rateResult;
      showAmountPanel(
        getAnchorRect,
        {
          status: 'ok',
          rawText: amount.rawText,
          converted: formatUsd(convertToUsd(amount.valueArs, rate)),
          sourceLabel: RATE_PROVIDER_LABELS[rate.provider] ?? rate.provider,
          ageLabel: formatRateAge(rate.fetchedAt),
          isStale: rate.isStale,
        },
        handlePanelClosed,
      );
    }

    document.addEventListener('mouseup', () => void handleSelection());
    document.addEventListener('keyup', () => void handleSelection());

    // The popup sends these when the user flips the per-site toggle while
    // this tab is already open, so the change takes effect without a
    // reload; the `isHostDisabled` check above only covers the initial load.
    chrome.runtime.onMessage.addListener((message: Message) => {
      if (message.type === 'ACTIVATE') {
        enabled = true;
        return;
      }

      if (message.type === 'DEACTIVATE') {
        enabled = false;
        closeAmountPanel();
        activeRange = undefined;
        return;
      }
    });
  },
});
