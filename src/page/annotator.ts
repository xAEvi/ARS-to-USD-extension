import type { DetectedAmount } from '../core/types';

const LOW_CONFIDENCE_TITLE =
  'Conversión con baja confianza: el monto podría no estar expresado en pesos argentinos.';

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
}

[data-aru-wrap][data-aru-confidence="low"] {
  border-bottom: 1px dashed currentColor;
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
 * Materializes detected amounts within a text node per DISENO.md section
 * 5.1: the matched substring is split off with `splitText` and wrapped in a
 * `[data-aru-wrap]` span carrying the original text and confidence, with
 * the converted amount appended in a `[data-aru-usd]` span.
 *
 * @param {Text} textNode The text node to annotate. Must not already be wrapped.
 * @param {Array<DetectedAmount>} matches The amounts to annotate, as returned by `detect`.
 * @param {(amount: DetectedAmount) => string} formatAmount Produces the USD text to append for an amount.
 */
export function annotateTextNode(
  textNode: Text,
  matches: Array<DetectedAmount>,
  formatAmount: (amount: DetectedAmount) => string,
): void {
  const ownerDocument = textNode.ownerDocument;
  if (!ownerDocument) return;

  // Process right-to-left: splitText only mutates the node from the cut
  // point onward, so earlier matches keep valid indices without needing to
  // recompute them as the node is split.
  const sorted = [...matches].sort((a, b) => b.startIndex - a.startIndex);

  for (const match of sorted) {
    const matchNode = textNode.splitText(match.startIndex);
    matchNode.splitText(match.endIndex - match.startIndex);

    const wrap = ownerDocument.createElement('span');
    wrap.setAttribute('data-aru-wrap', '');
    wrap.setAttribute('data-aru-original', match.rawText);
    wrap.setAttribute('data-aru-confidence', match.confidence);
    if (match.confidence === 'low') wrap.title = LOW_CONFIDENCE_TITLE;

    const usdSpan = ownerDocument.createElement('span');
    usdSpan.setAttribute('data-aru-usd', '');
    usdSpan.textContent = ` (${formatAmount(match)})`;

    matchNode.replaceWith(wrap);
    wrap.appendChild(matchNode);
    wrap.appendChild(usdSpan);
  }
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
  for (const wrap of root.querySelectorAll('[data-aru-wrap]')) {
    const ownerDocument = wrap.ownerDocument;
    const original = wrap.getAttribute('data-aru-original') ?? '';
    const parent = wrap.parentNode;

    wrap.replaceWith(ownerDocument.createTextNode(original));
    parent?.normalize();
  }
}
