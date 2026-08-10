import type { SuppressionReason } from '../core/suppression';
import type { Confidence, DetectedAmount } from '../core/types';

const LOW_CONFIDENCE_TITLE =
  'Conversión con baja confianza: el monto podría no estar expresado en pesos argentinos.';

const SUPPRESSED_REASON_LABELS: Record<SuppressionReason, string> = {
  'not-a-price': 'no es un precio',
  'not-ars': 'no está en pesos',
};

const SUPPRESSED_MARKER_SYMBOL = '⊘';

const STYLE_ELEMENT_ID = 'aru-styles';

/**
 * Annotation stylesheet per DISENO.md section 5.3: inherited-friendly
 * properties so price grids don't break, plus a dashed underline for low
 * confidence amounts. Kept as a template string until a bundler is wired in
 * (Fase 4) and can hand this to the extension as an actual `.css` file.
 */
export const ANNOTATION_STYLES = `
[data-aru-wrap] {
  color: inherit;
  font: inherit;
}

[data-aru-usd] {
  opacity: 0.75;
  font-size: 0.9em;
  cursor: pointer;
}

[data-aru-wrap][data-aru-confidence="low"] {
  border-bottom: 1px dashed currentColor;
}

[data-aru-suppressed-marker] {
  opacity: 0.5;
  font-size: 0.85em;
  cursor: pointer;
  margin-left: 2px;
}
`;

/**
 * Injects the annotation stylesheet into `target` if it is not already
 * present. Safe to call on every scan; it never inserts a second `<style>`.
 *
 * @param {Document} [target] The document to inject into. Defaults to `document`.
 */
export function injectAnnotationStyles(target: Document = document): void {
  if (target.getElementById(STYLE_ELEMENT_ID)) return;

  const style = target.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = ANNOTATION_STYLES;
  target.head.appendChild(style);
}

/**
 * Splits off each match's text from `textNode` right-to-left: `splitText`
 * only mutates the node from the cut point onward, so earlier matches keep
 * valid indices without needing to recompute them as the node is split.
 * Shared by every annotation function so mixing amount groups that share a
 * text node still happens in a single pass.
 */
function splitMatches<T extends { startIndex: number; endIndex: number }>(
  textNode: Text,
  matches: Array<T>,
): Array<{ entry: T; matchNode: Text }> {
  const sorted = [...matches].sort((a, b) => b.startIndex - a.startIndex);
  const result: Array<{ entry: T; matchNode: Text }> = [];

  for (const entry of sorted) {
    const matchNode = textNode.splitText(entry.startIndex);
    matchNode.splitText(entry.endIndex - entry.startIndex);
    result.push({ entry, matchNode });
  }

  return result;
}

function buildBaseWrap(
  ownerDocument: Document,
  original: string,
  confidence: Confidence,
): HTMLElement {
  const wrap = ownerDocument.createElement('span');
  wrap.setAttribute('data-aru-wrap', '');
  wrap.setAttribute('data-aru-original', original);
  wrap.setAttribute('data-aru-confidence', confidence);
  if (confidence === 'low') wrap.title = LOW_CONFIDENCE_TITLE;
  return wrap;
}

function buildUsdSpan(
  ownerDocument: Document,
  amount: DetectedAmount,
  formatAmount: (amount: DetectedAmount) => string,
  wrap: HTMLElement,
  onFeedbackRequested?: (wrap: HTMLElement, amount: DetectedAmount) => void,
): HTMLElement {
  const usdSpan = ownerDocument.createElement('span');
  usdSpan.setAttribute('data-aru-usd', '');
  usdSpan.textContent = ` (${formatAmount(amount)})`;

  if (onFeedbackRequested) {
    // Annotations often sit inside a product card <a>; without this the
    // click would also navigate the page (DISENO.md section 6.7).
    usdSpan.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onFeedbackRequested(wrap, amount);
    });
  }

  return usdSpan;
}

/**
 * Materializes detected amounts within a text node per DISENO.md section
 * 5.1: the matched substring is split off with `splitText` and wrapped in a
 * `[data-aru-wrap]` span carrying the original text and confidence, with
 * the converted amount appended in a `[data-aru-usd]` span.
 *
 * @param {Text} textNode The text node to annotate. Must not already be wrapped.
 * @param {Array<DetectedAmount>} matches The amounts to annotate, as returned by `detect`.
 * @param {(amount: DetectedAmount) => string} formatAmount Produces the USD text to append for an amount.
 * @param {(wrap: HTMLElement, amount: DetectedAmount) => void} [onFeedbackRequested] Called when the `[data-aru-usd]` span is clicked, to open the false-alarm popover (DISENO.md section 6.7).
 */
export function annotateTextNode(
  textNode: Text,
  matches: Array<DetectedAmount>,
  formatAmount: (amount: DetectedAmount) => string,
  onFeedbackRequested?: (wrap: HTMLElement, amount: DetectedAmount) => void,
): void {
  const ownerDocument = textNode.ownerDocument;
  if (!ownerDocument) return;

  for (const { entry: match, matchNode } of splitMatches(textNode, matches)) {
    const wrap = buildBaseWrap(ownerDocument, match.rawText, match.confidence);
    const usdSpan = buildUsdSpan(
      ownerDocument,
      match,
      formatAmount,
      wrap,
      onFeedbackRequested,
    );

    matchNode.replaceWith(wrap);
    wrap.appendChild(matchNode);
    wrap.appendChild(usdSpan);
  }
}

/** A detected amount a suppression rule blocked, carrying enough to undo it. */
export type SuppressedAmount = DetectedAmount & {
  /** Ids of every rule that matched this amount, removed together on unmark. */
  ruleIds: Array<string>;

  /** Reason of the (first) rule that matched, shown in the marker's tooltip. */
  reason: SuppressionReason;
};

type MixedEntry =
  | {
      kind: 'kept';
      startIndex: number;
      endIndex: number;
      amount: DetectedAmount;
    }
  | {
      kind: 'suppressed';
      startIndex: number;
      endIndex: number;
      amount: SuppressedAmount;
    };

function buildSuppressedMarker(
  ownerDocument: Document,
  amount: SuppressedAmount,
  wrap: HTMLElement,
  onUnsuppressRequested?: (wrap: HTMLElement, amount: SuppressedAmount) => void,
): HTMLElement {
  const marker = ownerDocument.createElement('span');
  marker.setAttribute('data-aru-suppressed-marker', '');
  marker.textContent = SUPPRESSED_MARKER_SYMBOL;
  marker.title = `Marcado como falsa alarma (${SUPPRESSED_REASON_LABELS[amount.reason]}). Click para deshacer.`;

  if (onUnsuppressRequested) {
    marker.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onUnsuppressRequested(wrap, amount);
    });
  }

  return marker;
}

/**
 * Like `annotateTextNode`, but for a text node that mixes amounts to
 * convert with amounts a suppression rule blocked. Both groups are split
 * off from `textNode` in the same right-to-left pass: annotating `kept`
 * first would mutate the node and invalidate the indices of any
 * `suppressed` match still pending, since they were computed against the
 * same original string.
 *
 * Suppressed amounts get a discreet `[data-aru-suppressed-marker]` instead
 * of the converted amount, per DISENO.md section 6.7's "mostrar suprimidos"
 * mode; clicking it is meant to remove the rule and reveal the conversion,
 * which the caller does by calling `convertSuppressedWrap` on the returned
 * wrap once the rule is gone.
 *
 * @param {Text} textNode The text node to annotate. Must not already be wrapped.
 * @param {Array<DetectedAmount>} kept The amounts to convert normally.
 * @param {Array<SuppressedAmount>} suppressed The amounts a suppression rule blocked.
 * @param {(amount: DetectedAmount) => string} formatAmount Produces the USD text to append for a converted amount.
 * @param {(wrap: HTMLElement, amount: DetectedAmount) => void} [onFeedbackRequested] Called when a converted amount's `[data-aru-usd]` span is clicked.
 * @param {(wrap: HTMLElement, amount: SuppressedAmount) => void} [onUnsuppressRequested] Called when a suppressed amount's marker is clicked.
 */
export function annotateMixedTextNode(
  textNode: Text,
  kept: Array<DetectedAmount>,
  suppressed: Array<SuppressedAmount>,
  formatAmount: (amount: DetectedAmount) => string,
  onFeedbackRequested?: (wrap: HTMLElement, amount: DetectedAmount) => void,
  onUnsuppressRequested?: (wrap: HTMLElement, amount: SuppressedAmount) => void,
): void {
  const ownerDocument = textNode.ownerDocument;
  if (!ownerDocument) return;

  const entries: Array<MixedEntry> = [
    ...kept.map((amount) => ({
      kind: 'kept' as const,
      startIndex: amount.startIndex,
      endIndex: amount.endIndex,
      amount,
    })),
    ...suppressed.map((amount) => ({
      kind: 'suppressed' as const,
      startIndex: amount.startIndex,
      endIndex: amount.endIndex,
      amount,
    })),
  ];

  for (const { entry, matchNode } of splitMatches(textNode, entries)) {
    const wrap = buildBaseWrap(
      ownerDocument,
      entry.amount.rawText,
      entry.amount.confidence,
    );

    if (entry.kind === 'kept') {
      const usdSpan = buildUsdSpan(
        ownerDocument,
        entry.amount,
        formatAmount,
        wrap,
        onFeedbackRequested,
      );
      matchNode.replaceWith(wrap);
      wrap.appendChild(matchNode);
      wrap.appendChild(usdSpan);
      continue;
    }

    wrap.setAttribute('data-aru-suppressed', '');
    wrap.setAttribute('data-aru-suppression-reason', entry.amount.reason);
    const marker = buildSuppressedMarker(
      ownerDocument,
      entry.amount,
      wrap,
      onUnsuppressRequested,
    );

    matchNode.replaceWith(wrap);
    wrap.appendChild(matchNode);
    wrap.appendChild(marker);
  }
}

/**
 * Turns a suppressed wrap into a normally converted one, in place, once its
 * blocking rule has been removed. Reuses the wrap element rather than
 * reverting and re-detecting: the amount is already fully known from the
 * scan that produced it, so a rescan would be redundant.
 *
 * @param {HTMLElement} wrap The `[data-aru-wrap][data-aru-suppressed]` element to convert.
 * @param {DetectedAmount} amount The amount the wrap represents.
 * @param {(amount: DetectedAmount) => string} formatAmount Produces the USD text to append.
 * @param {(wrap: HTMLElement, amount: DetectedAmount) => void} [onFeedbackRequested] Called when the resulting `[data-aru-usd]` span is clicked.
 */
export function convertSuppressedWrap(
  wrap: HTMLElement,
  amount: DetectedAmount,
  formatAmount: (amount: DetectedAmount) => string,
  onFeedbackRequested?: (wrap: HTMLElement, amount: DetectedAmount) => void,
): void {
  const ownerDocument = wrap.ownerDocument;

  wrap.removeAttribute('data-aru-suppressed');
  wrap.removeAttribute('data-aru-suppression-reason');
  wrap.querySelector('[data-aru-suppressed-marker]')?.remove();

  const usdSpan = buildUsdSpan(
    ownerDocument,
    amount,
    formatAmount,
    wrap,
    onFeedbackRequested,
  );
  wrap.appendChild(usdSpan);
}

function revertOne(wrap: Element): void {
  const ownerDocument = wrap.ownerDocument;
  const original = wrap.getAttribute('data-aru-original') ?? '';
  const parent = wrap.parentNode;

  wrap.replaceWith(ownerDocument.createTextNode(original));
  parent?.normalize();
}

/**
 * Reverts a single annotation, per DISENO.md section 5.2. Used to revert
 * the specific wrap the user clicked, and any equivalent ones when a
 * `location-group` suppression rule was just added.
 *
 * @param {Element} wrap The `[data-aru-wrap]` element to revert.
 */
export function revertWrap(wrap: Element): void {
  revertOne(wrap);
}

/**
 * Reverts every annotation under `root` per DISENO.md section 5.2: each
 * `[data-aru-wrap]` is replaced by a text node holding its
 * `data-aru-original` content, and the parent is normalized so the text
 * nodes split during annotation merge back together.
 *
 * @param {ParentNode} root The subtree to revert.
 */
export function revert(root: ParentNode): void {
  for (const wrap of root.querySelectorAll('[data-aru-wrap]')) revertOne(wrap);
}
